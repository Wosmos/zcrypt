package cmd

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/zcrypt/zcrypt/config"
)

// Server-side disk cache for ciphertext chunks downloaded from git platforms.
// Chunks are immutable (a re-upload mints a new chunk id), so entries never go
// stale; a size-bound sweep keeps the directory under budget. Everything here
// is best-effort (cache failures must never fail a download) and holds
// ciphertext only, so it's zero-knowledge safe.

// defaultChunkCacheBytes bounds the chunk cache size (2GB). Override with
// ZCRYPT_CHUNK_CACHE_MB.
const defaultChunkCacheBytes = 2 << 30

// chunkCacheBudget returns the cache size budget in bytes.
func chunkCacheBudget() int64 {
	if mb := os.Getenv("ZCRYPT_CHUNK_CACHE_MB"); mb != "" {
		if n, err := strconv.Atoi(mb); err == nil && n > 0 {
			return int64(n) << 20
		}
	}
	return defaultChunkCacheBytes
}

// readCachedChunk returns the cached ciphertext for a chunk, or nil on any
// miss/error. An entry whose bytes don't hash to the chunk's recorded SHA-256 is
// deleted and treated as a miss, so a corrupt entry can't be served (as
// immutable) forever. A hit bumps the file's mtime so the sweep evicts LRU-ish.
func readCachedChunk(chunkID, wantSHA256 string) []byte {
	dir, err := config.ChunkCacheDir()
	if err != nil {
		return nil
	}
	return readCachedChunkIn(dir, chunkID, wantSHA256)
}

func readCachedChunkIn(dir, chunkID, wantSHA256 string) []byte {
	path := filepath.Join(dir, filepath.Base(chunkID)+".enc")
	data, err := os.ReadFile(filepath.Clean(path))
	if err != nil {
		return nil
	}
	if !chunkHashMatches(data, wantSHA256) {
		_ = os.Remove(path)
		return nil
	}
	now := time.Now()
	_ = os.Chtimes(path, now, now)
	return data
}

// writeCachedChunk stores downloaded ciphertext, then sweeps the cache if it
// exceeds its budget. Bytes that don't match the chunk's SHA-256 are never
// cached. The entry is written to a temp file and renamed into place, so a crash
// or a concurrent reader never sees a truncated chunk. Write errors are ignored:
// the chunk was already served.
func writeCachedChunk(chunkID, wantSHA256 string, data []byte) {
	dir, err := config.ChunkCacheDir()
	if err != nil {
		return
	}
	if writeCachedChunkIn(dir, chunkID, wantSHA256, data) {
		sweepChunkCache(dir, chunkCacheBudget())
	}
}

func writeCachedChunkIn(dir, chunkID, wantSHA256 string, data []byte) bool {
	if !chunkHashMatches(data, wantSHA256) {
		return false
	}
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return false
	}
	_, werr := tmp.Write(data)
	cerr := tmp.Close()
	if werr != nil || cerr != nil {
		_ = os.Remove(tmp.Name())
		return false
	}
	if err := os.Rename(tmp.Name(), filepath.Join(dir, filepath.Base(chunkID)+".enc")); err != nil {
		_ = os.Remove(tmp.Name())
		return false
	}
	return true
}

// chunkHashMatches reports whether data hashes to want (hex SHA-256). A chunk
// with no recorded hash can't be verified and is never trusted from the cache.
func chunkHashMatches(data []byte, want string) bool {
	if want == "" {
		return false
	}
	sum := sha256.Sum256(data)
	return strings.EqualFold(hex.EncodeToString(sum[:]), want)
}

// chunkCacheWriter tees a streamed chunk into the cache. Writes never fail the
// stream they ride on: a cache error only means this chunk isn't cached. A nil
// writer (cache dir unavailable) is a no-op.
type chunkCacheWriter struct {
	f      *os.File
	dir    string
	final  string
	failed bool
}

// openChunkCacheWriter starts a temp file for chunkID, or returns nil when the
// cache is unavailable.
func openChunkCacheWriter(chunkID string) *chunkCacheWriter {
	dir, err := config.ChunkCacheDir()
	if err != nil {
		return nil
	}
	f, err := os.CreateTemp(dir, chunkID+".*.tmp")
	if err != nil {
		return nil
	}
	return &chunkCacheWriter{f: f, dir: dir, final: filepath.Join(dir, chunkID+".enc")}
}

func (c *chunkCacheWriter) Write(p []byte) (int, error) {
	if c == nil || c.failed {
		return len(p), nil
	}
	if _, err := c.f.Write(p); err != nil {
		c.failed = true
	}
	return len(p), nil
}

// commit moves verified bytes into place, then sweeps the cache.
func (c *chunkCacheWriter) commit() {
	if c == nil {
		return
	}
	if err := c.f.Close(); err != nil || c.failed {
		_ = os.Remove(c.f.Name())
		return
	}
	if err := os.Rename(c.f.Name(), c.final); err != nil {
		_ = os.Remove(c.f.Name())
		return
	}
	sweepChunkCache(c.dir, chunkCacheBudget())
}

// discard drops a partial or unverified chunk.
func (c *chunkCacheWriter) discard() {
	if c == nil {
		return
	}
	_ = c.f.Close()
	_ = os.Remove(c.f.Name())
}

// sweepChunkCache deletes oldest-mtime files until the directory is under
// budget. Concurrent sweeps are harmless: a lost Remove race just means the
// other sweep got there first.
func sweepChunkCache(dir string, budget int64) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}

	type cacheFile struct {
		path  string
		size  int64
		mtime time.Time
	}
	var files []cacheFile
	var total int64
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		files = append(files, cacheFile{filepath.Join(dir, e.Name()), info.Size(), info.ModTime()})
		total += info.Size()
	}
	if total <= budget {
		return
	}

	sort.Slice(files, func(i, j int) bool { return files[i].mtime.Before(files[j].mtime) })
	for _, f := range files {
		if total <= budget {
			break
		}
		if err := os.Remove(f.path); err == nil {
			total -= f.size
		}
	}
}
