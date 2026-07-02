package cmd

import (
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"time"

	"github.com/zcrypt/zcrypt/config"
)

// Server-side disk cache for ciphertext chunks downloaded from git platforms.
// Chunks are immutable (a re-upload mints a new chunk id), so entries never go
// stale; a size-bound sweep keeps the directory under budget. Everything here
// is best-effort — cache failures must never fail a download — and holds
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
// miss/error. A hit bumps the file's mtime so the sweep evicts LRU-ish.
func readCachedChunk(chunkID string) []byte {
	dir, err := config.ChunkCacheDir()
	if err != nil {
		return nil
	}
	path := filepath.Join(dir, chunkID+".enc")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	now := time.Now()
	_ = os.Chtimes(path, now, now)
	return data
}

// writeCachedChunk stores downloaded ciphertext, then sweeps the cache if it
// exceeds its budget. Write errors are ignored — the chunk was already served.
func writeCachedChunk(chunkID string, data []byte) {
	dir, err := config.ChunkCacheDir()
	if err != nil {
		return
	}
	if err := os.WriteFile(filepath.Join(dir, chunkID+".enc"), data, 0600); err != nil {
		return
	}
	sweepChunkCache(dir, chunkCacheBudget())
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
