package cmd

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/zcrypt/zcrypt/types"
)

type fakeStreamer struct {
	parts [][]byte
	err   error
}

func (f fakeStreamer) DownloadTo(_ context.Context, _ types.ChunkRef, w io.Writer) (int64, error) {
	var n int64
	for _, p := range f.parts {
		m, err := w.Write(p)
		n += int64(m)
		if err != nil {
			return n, err
		}
	}
	return n, f.err
}

func shaHex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func cachePath(t *testing.T, chunkID string) string {
	t.Helper()
	return filepath.Join(os.Getenv("HOME"), ".zcrypt", "chunk-cache", chunkID+".enc")
}

func TestRelayStreamedChunkForwardsAndCaches(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	chunk := types.ChunkRef{ChunkID: "c1", SHA256: shaHex([]byte("hello world")), Compressed: true}
	rec := httptest.NewRecorder()

	if err := relayStreamedChunk(context.Background(), rec, fakeStreamer{parts: [][]byte{[]byte("hello "), []byte("world")}}, chunk); err != nil {
		t.Fatalf("relay: %v", err)
	}

	if rec.Code != http.StatusOK || rec.Body.String() != "hello world" {
		t.Fatalf("got %d %q", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("X-Chunk-SHA256") != chunk.SHA256 || rec.Header().Get("X-Chunk-Compressed") != "true" {
		t.Fatalf("missing chunk headers: %v", rec.Header())
	}
	cached, err := os.ReadFile(cachePath(t, "c1"))
	if err != nil || string(cached) != "hello world" {
		t.Fatalf("cache = %q, %v", cached, err)
	}
	if got := readCachedChunk("c1", chunk.SHA256); string(got) != "hello world" {
		t.Fatalf("readCachedChunk = %q", got)
	}
}

func TestRelayStreamedChunkFailsCleanlyBeforeFirstByte(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	rec := httptest.NewRecorder()

	err := relayStreamedChunk(context.Background(), rec, fakeStreamer{err: errors.New("getFile: dial timeout")}, types.ChunkRef{ChunkID: "c2", SHA256: "x"})

	if err == nil || rec.Body.Len() != 0 {
		t.Fatalf("err = %v, body = %q; want the error returned with nothing written", err, rec.Body.String())
	}
	if rec.Header().Get("X-Chunk-SHA256") != "" || rec.Header().Get("Cache-Control") != "" {
		t.Fatalf("chunk headers leaked onto the error: %v", rec.Header())
	}
	if _, err := os.Stat(cachePath(t, "c2")); !os.IsNotExist(err) {
		t.Fatalf("failed chunk was cached: %v", err)
	}
}

func TestRelayStreamedChunkAbortsAfterPartialBody(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	defer func() {
		if r := recover(); r != http.ErrAbortHandler {
			t.Fatalf("recover = %v, want ErrAbortHandler", r)
		}
		if _, err := os.Stat(cachePath(t, "c3")); !os.IsNotExist(err) {
			t.Fatalf("partial chunk was cached: %v", err)
		}
	}()
	_ = relayStreamedChunk(context.Background(), httptest.NewRecorder(), fakeStreamer{
		parts: [][]byte{[]byte("half")},
		err:   errors.New("connection reset"),
	}, types.ChunkRef{ChunkID: "c3", SHA256: shaHex([]byte("half and more"))})
	t.Fatal("expected the response to be aborted")
}

func TestRelayStreamedChunkAbortsOnShaMismatch(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	defer func() {
		if r := recover(); r != http.ErrAbortHandler {
			t.Fatalf("recover = %v, want ErrAbortHandler", r)
		}
		if _, err := os.Stat(cachePath(t, "c4")); !os.IsNotExist(err) {
			t.Fatalf("corrupt chunk was cached: %v", err)
		}
	}()
	_ = relayStreamedChunk(context.Background(), httptest.NewRecorder(), fakeStreamer{
		parts: [][]byte{[]byte("tampered")},
	}, types.ChunkRef{ChunkID: "c4", SHA256: shaHex([]byte("original"))})
	t.Fatal("expected the response to be aborted")
}

func TestRelayStreamedChunkDoesNotCacheWithoutSha(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	if err := relayStreamedChunk(context.Background(), httptest.NewRecorder(), fakeStreamer{
		parts: [][]byte{[]byte("unverifiable")},
	}, types.ChunkRef{ChunkID: "c5"}); err != nil {
		t.Fatalf("relay: %v", err)
	}
	if _, err := os.Stat(cachePath(t, "c5")); !os.IsNotExist(err) {
		t.Fatalf("unverifiable chunk was cached: %v", err)
	}
}

func TestChunkCacheWriterNilIsNoop(t *testing.T) {
	var c *chunkCacheWriter
	if n, err := c.Write([]byte("abc")); n != 3 || err != nil {
		t.Fatalf("Write = %d, %v", n, err)
	}
	c.commit()
	c.discard()
}
