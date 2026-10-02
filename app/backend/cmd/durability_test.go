package cmd

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSyncRetryDelayGrowsAndCaps(t *testing.T) {
	within := func(d, want time.Duration) bool {
		return d >= want-want/5 && d <= want+want/5
	}
	for attempts, want := range map[int]time.Duration{
		0:  30 * time.Second,
		1:  time.Minute,
		4:  8 * time.Minute,
		7:  time.Hour,
		11: time.Hour,
		40: time.Hour,
	} {
		for i := 0; i < 50; i++ {
			if d := syncRetryDelay(attempts); !within(d, want) {
				t.Fatalf("syncRetryDelay(%d) = %s, want %s +/-20%%", attempts, d, want)
			}
		}
	}
}

func TestSyncRetryBudgetOutlastsAnHourLongOutage(t *testing.T) {
	var total time.Duration
	for a := 0; a < maxSyncAttempts-1; a++ {
		total += syncRetryDelay(a) * 4 / 5
	}
	if total < 3*time.Hour {
		t.Fatalf("retry budget spans only %s; a short platform outage would strand chunks", total)
	}
}

func TestIsPlatformUnhealthy(t *testing.T) {
	for _, msg := range []string{
		"upload returned 503: Service Unavailable",
		"PUT failed: 429 Too Many Requests",
		"huggingface API 500: oops",
		"github: secondary rate limit exceeded",
		"bad gateway",
	} {
		if !isPlatformUnhealthy(errors.New(msg)) {
			t.Errorf("%q should pause the platform", msg)
		}
	}
	for _, msg := range []string{
		"422 path already exists",
		"repository not found",
		"chunk 5003 failed",
	} {
		if isPlatformUnhealthy(errors.New(msg)) {
			t.Errorf("%q is a per-chunk failure, not a platform outage", msg)
		}
	}
	if isPlatformUnhealthy(nil) {
		t.Error("nil error is healthy")
	}
}

func hexSHA(b []byte) string {
	s := sha256.Sum256(b)
	return hex.EncodeToString(s[:])
}

func TestChunkCacheRejectsBytesThatDontMatchTheHash(t *testing.T) {
	dir := t.TempDir()
	data := []byte("ciphertext")
	if writeCachedChunkIn(dir, "c1", hexSHA([]byte("other")), data) {
		t.Fatal("bytes that don't hash to the chunk's sha256 must not be cached")
	}
	if writeCachedChunkIn(dir, "c1", "", data) {
		t.Fatal("a chunk with no recorded hash can't be verified and must not be cached")
	}
	if _, err := os.Stat(filepath.Join(dir, "c1.enc")); !os.IsNotExist(err) {
		t.Fatal("no cache entry may exist after a rejected write")
	}
}

func TestChunkCacheWritesAtomicallyAndRoundTrips(t *testing.T) {
	dir := t.TempDir()
	data := []byte("ciphertext-bytes")
	if !writeCachedChunkIn(dir, "c2", hexSHA(data), data) {
		t.Fatal("a verified chunk should be cached")
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "c2.enc" {
		t.Fatalf("expected only the final entry, found %v", entries)
	}
	if got := readCachedChunkIn(dir, "c2", hexSHA(data)); string(got) != string(data) {
		t.Fatalf("cache read = %q, want %q", got, data)
	}
}

func TestChunkCacheDropsCorruptEntryOnRead(t *testing.T) {
	dir := t.TempDir()
	data := []byte("ciphertext-bytes")
	path := filepath.Join(dir, "c3.enc")
	if err := os.WriteFile(path, data[:5], 0600); err != nil {
		t.Fatal(err)
	}
	if got := readCachedChunkIn(dir, "c3", hexSHA(data)); got != nil {
		t.Fatal("a truncated entry must never be served")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("a corrupt entry must be deleted so the next read re-fetches")
	}
}
