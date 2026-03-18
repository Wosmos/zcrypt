//go:build prodtest

package cmd_test

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// Production download performance tests.
//
// These tests run against the live Railway backend to diagnose download
// bottlenecks that can't be reproduced locally (512MB RAM, network hops, etc.)
//
// Setup:
//   1. Copy .env.prodtest.example to .env.prodtest
//   2. Fill in PRODTEST_API, PRODTEST_EMAIL, PRODTEST_PASSWORD
//   3. Run: go test -tags=prodtest -run TestProd -v -count=1 ./cmd/
//
// The tests auto-login, pick the largest file, and run diagnostics.
// No manual token or file ID needed.

var (
	prodAPI      string
	prodEmail    string
	prodPassword string
	prodToken    string // auto-populated by login
	prodFileID   string // auto-populated by file selection
	prodClient   = &http.Client{Timeout: 120 * time.Second}
)

type prodFileMeta struct {
	ID             string `json:"id"`
	OriginalName   string `json:"original_name"`
	OriginalSize   int64  `json:"original_size"`
	CompressedSize int64  `json:"compressed_size"`
	EncryptedSize  int64  `json:"encrypted_size"`
	ChunkCount     int    `json:"chunk_count"`
	SHA256         string `json:"sha256"`
	Salt           string `json:"salt"`
	Status         string `json:"status"`
}

// loadProdEnv reads .env.prodtest from the backend directory.
func loadProdEnv() {
	// Try multiple paths since test working dir can vary
	paths := []string{
		".env.prodtest",
		"../.env.prodtest",
		"../../.env.prodtest",
		"../../../.env.prodtest",
	}
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			key, val, ok := strings.Cut(line, "=")
			if !ok {
				continue
			}
			key = strings.TrimSpace(key)
			val = strings.TrimSpace(val)
			if len(val) >= 2 && ((val[0] == '"' && val[len(val)-1] == '"') || (val[0] == '\'' && val[len(val)-1] == '\'')) {
				val = val[1 : len(val)-1]
			}
			if os.Getenv(key) == "" {
				os.Setenv(key, val)
			}
		}
		break
	}

	prodAPI = os.Getenv("PRODTEST_API")
	prodEmail = os.Getenv("PRODTEST_EMAIL")
	prodPassword = os.Getenv("PRODTEST_PASSWORD")
}

func init() {
	loadProdEnv()
}

func prodSkip(t *testing.T) {
	t.Helper()
	if prodAPI == "" || prodEmail == "" || prodPassword == "" {
		t.Skip("Skipping: set PRODTEST_API, PRODTEST_EMAIL, PRODTEST_PASSWORD in .env.prodtest")
	}
}

// prodLogin authenticates against production and stores the JWT.
func prodLogin(t *testing.T) {
	t.Helper()
	if prodToken != "" {
		return // already logged in
	}

	body, _ := json.Marshal(map[string]string{
		"email":    prodEmail,
		"password": prodPassword,
	})

	resp, err := prodClient.Post(prodAPI+"/api/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("login request failed: %v", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode login response: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Fatalf("login failed (%d): %v", resp.StatusCode, result)
	}

	// Check if 2FA is required
	if req2fa, ok := result["requires_2fa"].(bool); ok && req2fa {
		t.Fatal("Account has 2FA enabled — PRODTEST_PASSWORD alone is not enough. Use a test account without 2FA.")
	}

	token, ok := result["access_token"].(string)
	if !ok || token == "" {
		t.Fatalf("no access_token in login response: %v", result)
	}

	prodToken = token
	t.Logf("Logged in as %s", prodEmail)
}

// prodPickFile lists files and picks the one with the most chunks for testing.
func prodPickFile(t *testing.T) {
	t.Helper()
	if prodFileID != "" {
		return
	}

	req, _ := http.NewRequest("GET", prodAPI+"/api/files", nil)
	req.Header.Set("Authorization", "Bearer "+prodToken)

	resp, err := prodClient.Do(req)
	if err != nil {
		t.Fatalf("list files: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("list files returned %d: %s", resp.StatusCode, body)
	}

	var files []prodFileMeta
	if err := json.NewDecoder(resp.Body).Decode(&files); err != nil {
		t.Fatalf("decode file list: %v", err)
	}

	if len(files) == 0 {
		t.Fatal("No files found in account — upload a test file first")
	}

	// Pick file with most chunks (best for concurrency testing)
	sort.Slice(files, func(i, j int) bool {
		return files[i].ChunkCount > files[j].ChunkCount
	})

	best := files[0]
	prodFileID = best.ID
	t.Logf("Selected file: %s (%s) — %.2f MB, %d chunks",
		best.OriginalName, best.ID, float64(best.OriginalSize)/1e6, best.ChunkCount)
}

// prodSetup handles login + file selection. Call at the start of each test.
func prodSetup(t *testing.T) {
	t.Helper()
	prodSkip(t)
	prodLogin(t)
	prodPickFile(t)
}

func prodAuthReq(method, url string) (*http.Request, error) {
	req, err := http.NewRequest(method, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+prodToken)
	return req, nil
}

func prodFetchMeta(t *testing.T) prodFileMeta {
	t.Helper()
	req, _ := prodAuthReq("GET", prodAPI+"/api/files/"+prodFileID+"/meta")
	resp, err := prodClient.Do(req)
	if err != nil {
		t.Fatalf("fetch meta: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("meta returned %d: %s", resp.StatusCode, body)
	}
	var meta prodFileMeta
	if err := json.NewDecoder(resp.Body).Decode(&meta); err != nil {
		t.Fatalf("decode meta: %v", err)
	}
	return meta
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// TestProdMetaLatency measures how fast the metadata endpoint responds.
func TestProdMetaLatency(t *testing.T) {
	prodSetup(t)

	start := time.Now()
	meta := prodFetchMeta(t)
	elapsed := time.Since(start)

	t.Logf("File: %s (%s)", meta.OriginalName, meta.ID)
	t.Logf("Size: %.2f MB, Chunks: %d", float64(meta.OriginalSize)/1e6, meta.ChunkCount)
	t.Logf("Meta latency: %s", elapsed)

	if elapsed > 2*time.Second {
		t.Errorf("Meta endpoint too slow: %s (should be <2s for a DB lookup)", elapsed)
	}
}

// TestProdChunkTTFB measures time-to-first-byte for a single chunk download.
// This is the key diagnostic — if TTFB ~ total time, the backend is buffering.
func TestProdChunkTTFB(t *testing.T) {
	prodSetup(t)
	meta := prodFetchMeta(t)
	if meta.ChunkCount == 0 {
		t.Skip("File has no chunks")
	}

	url := fmt.Sprintf("%s/api/files/%s/chunks/0", prodAPI, prodFileID)
	req, _ := prodAuthReq("GET", url)

	reqStart := time.Now()
	resp, err := prodClient.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	ttfb := time.Since(reqStart)

	// Read first 1KB
	buf := make([]byte, 1024)
	n, _ := resp.Body.Read(buf)
	firstByteTime := time.Since(reqStart)

	// Read the rest
	rest, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	totalTime := time.Since(reqStart)

	totalBytes := int64(n) + int64(len(rest))

	t.Logf("Chunk 0 download:")
	t.Logf("  TTFB (headers):  %s", ttfb)
	t.Logf("  First byte read: %s", firstByteTime)
	t.Logf("  Total time:      %s", totalTime)
	t.Logf("  Size:            %.2f MB", float64(totalBytes)/1e6)
	t.Logf("  Throughput:      %.2f MB/s", float64(totalBytes)/1e6/totalTime.Seconds())
	t.Logf("  SHA256 header:   %s", resp.Header.Get("X-Chunk-SHA256"))
	t.Logf("  Compressed:      %s", resp.Header.Get("X-Chunk-Compressed"))

	ttfbRatio := float64(ttfb) / float64(totalTime)
	t.Logf("  TTFB/Total ratio: %.2f", ttfbRatio)

	if ttfbRatio > 0.80 {
		t.Logf("  BUFFERING DETECTED: Backend waits for full chunk before responding.")
		t.Logf("    TTFB is %.0f%% of total time — should be <30%% with streaming.", ttfbRatio*100)
		t.Logf("    Fix: replace io.ReadAll + w.Write with io.Copy streaming")
	} else {
		t.Logf("  Backend appears to be streaming (TTFB is %.0f%% of total)", ttfbRatio*100)
	}
}

// TestProdChunkIntegrity downloads a chunk and verifies SHA256 matches the header.
func TestProdChunkIntegrity(t *testing.T) {
	prodSetup(t)
	meta := prodFetchMeta(t)
	if meta.ChunkCount == 0 {
		t.Skip("File has no chunks")
	}

	url := fmt.Sprintf("%s/api/files/%s/chunks/0", prodAPI, prodFileID)
	req, _ := prodAuthReq("GET", url)

	resp, err := prodClient.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	expectedSHA := resp.Header.Get("X-Chunk-SHA256")
	if expectedSHA == "" {
		t.Fatal("No X-Chunk-SHA256 header in response")
	}

	h := sha256.New()
	n, err := io.Copy(h, resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}

	actualSHA := hex.EncodeToString(h.Sum(nil))
	if actualSHA != expectedSHA {
		t.Errorf("SHA256 mismatch: got %s, want %s (%d bytes)", actualSHA, expectedSHA, n)
	} else {
		t.Logf("Chunk 0 integrity OK: %s (%d bytes)", actualSHA, n)
	}
}

// TestProdConcurrentChunks simulates parallel chunk downloads like the frontend does.
// On Railway's 512MB, concurrent io.ReadAll of 10MB chunks can OOM the backend.
func TestProdConcurrentChunks(t *testing.T) {
	prodSetup(t)
	meta := prodFetchMeta(t)
	if meta.ChunkCount < 2 {
		t.Skip("File has fewer than 2 chunks")
	}

	concurrency := meta.ChunkCount
	if concurrency > 10 {
		concurrency = 10
	}

	t.Logf("Downloading %d chunks concurrently (file has %d total)", concurrency, meta.ChunkCount)

	type result struct {
		index int
		size  int64
		ttfb  time.Duration
		total time.Duration
		err   error
	}

	results := make([]result, concurrency)
	var wg sync.WaitGroup
	var totalBytes atomic.Int64

	overallStart := time.Now()

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			url := fmt.Sprintf("%s/api/files/%s/chunks/%d", prodAPI, prodFileID, idx)
			req, err := prodAuthReq("GET", url)
			if err != nil {
				results[idx] = result{index: idx, err: err}
				return
			}

			start := time.Now()
			resp, err := prodClient.Do(req)
			if err != nil {
				results[idx] = result{index: idx, err: err}
				return
			}
			ttfb := time.Since(start)

			data, err := io.ReadAll(resp.Body)
			resp.Body.Close()
			total := time.Since(start)

			if resp.StatusCode != 200 {
				results[idx] = result{index: idx, err: fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(data))}
				return
			}

			totalBytes.Add(int64(len(data)))
			results[idx] = result{index: idx, size: int64(len(data)), ttfb: ttfb, total: total}
		}(i)
	}

	wg.Wait()
	overallTime := time.Since(overallStart)

	var maxTTFB, maxTotal time.Duration
	var errors int
	for _, r := range results {
		if r.err != nil {
			t.Errorf("  Chunk %d FAILED: %v", r.index, r.err)
			errors++
			continue
		}
		if r.ttfb > maxTTFB {
			maxTTFB = r.ttfb
		}
		if r.total > maxTotal {
			maxTotal = r.total
		}
		t.Logf("  Chunk %d: %.2f MB, TTFB %s, Total %s", r.index, float64(r.size)/1e6, r.ttfb, r.total)
	}

	t.Logf("\nSummary (%d concurrent):", concurrency)
	t.Logf("  Total data:      %.2f MB", float64(totalBytes.Load())/1e6)
	t.Logf("  Wall clock:      %s", overallTime)
	t.Logf("  Throughput:      %.2f MB/s", float64(totalBytes.Load())/1e6/overallTime.Seconds())
	t.Logf("  Slowest TTFB:    %s", maxTTFB)
	t.Logf("  Slowest total:   %s", maxTotal)
	t.Logf("  Errors:          %d/%d", errors, concurrency)

	if errors > 0 {
		t.Logf("\n  %d chunks failed — likely OOM or timeout on Railway's 512MB.", errors)
		t.Logf("    Each 10MB chunk buffered = 10MB backend RAM.")
		t.Logf("    %d concurrent x 10MB = %dMB peak.", concurrency, concurrency*10)
	}
	if maxTTFB > 10*time.Second {
		t.Logf("\n  TTFB >10s — backend under memory/CPU pressure.")
	}
}

// TestProdSequentialThroughput downloads chunks one-by-one for baseline throughput.
func TestProdSequentialThroughput(t *testing.T) {
	prodSetup(t)
	meta := prodFetchMeta(t)
	if meta.ChunkCount == 0 {
		t.Skip("File has no chunks")
	}

	chunks := meta.ChunkCount
	if chunks > 10 {
		chunks = 10
	}

	t.Logf("Downloading %d chunks sequentially", chunks)

	var totalBytes int64
	overallStart := time.Now()

	for i := 0; i < chunks; i++ {
		url := fmt.Sprintf("%s/api/files/%s/chunks/%d", prodAPI, prodFileID, i)
		req, _ := prodAuthReq("GET", url)

		start := time.Now()
		resp, err := prodClient.Do(req)
		if err != nil {
			t.Fatalf("chunk %d: %v", i, err)
		}
		ttfb := time.Since(start)

		data, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		total := time.Since(start)

		if resp.StatusCode != 200 {
			t.Fatalf("chunk %d: HTTP %d", i, resp.StatusCode)
		}

		totalBytes += int64(len(data))
		t.Logf("  Chunk %d: %.2f MB, TTFB %s, Total %s, %.2f MB/s",
			i, float64(len(data))/1e6, ttfb, total, float64(len(data))/1e6/total.Seconds())
	}

	overallTime := time.Since(overallStart)
	t.Logf("\nSequential: %.2f MB in %s (%.2f MB/s)",
		float64(totalBytes)/1e6, overallTime, float64(totalBytes)/1e6/overallTime.Seconds())
}

// TestProdConcurrentVsSequential compares both to quantify the speedup from parallelism.
func TestProdConcurrentVsSequential(t *testing.T) {
	prodSetup(t)
	meta := prodFetchMeta(t)
	if meta.ChunkCount < 3 {
		t.Skip("Need at least 3 chunks")
	}

	chunks := meta.ChunkCount
	if chunks > 6 {
		chunks = 6
	}

	// Sequential
	seqStart := time.Now()
	var seqBytes int64
	for i := 0; i < chunks; i++ {
		url := fmt.Sprintf("%s/api/files/%s/chunks/%d", prodAPI, prodFileID, i)
		req, _ := prodAuthReq("GET", url)
		resp, err := prodClient.Do(req)
		if err != nil {
			t.Fatalf("seq chunk %d: %v", i, err)
		}
		data, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		seqBytes += int64(len(data))
	}
	seqTime := time.Since(seqStart)

	time.Sleep(2 * time.Second)

	// Concurrent
	conStart := time.Now()
	var conBytes atomic.Int64
	var wg sync.WaitGroup
	var conErrors atomic.Int32
	for i := 0; i < chunks; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			url := fmt.Sprintf("%s/api/files/%s/chunks/%d", prodAPI, prodFileID, idx)
			req, _ := prodAuthReq("GET", url)
			resp, err := prodClient.Do(req)
			if err != nil {
				conErrors.Add(1)
				return
			}
			data, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			conBytes.Add(int64(len(data)))
		}(i)
	}
	wg.Wait()
	conTime := time.Since(conStart)

	speedup := float64(seqTime) / float64(conTime)

	t.Logf("Sequential: %.2f MB in %s (%.2f MB/s)", float64(seqBytes)/1e6, seqTime, float64(seqBytes)/1e6/seqTime.Seconds())
	t.Logf("Concurrent: %.2f MB in %s (%.2f MB/s)", float64(conBytes.Load())/1e6, conTime, float64(conBytes.Load())/1e6/conTime.Seconds())
	t.Logf("Speedup: %.2fx", speedup)
	t.Logf("Errors: %d", conErrors.Load())

	if speedup < 1.5 {
		t.Logf("\nConcurrent barely faster (%.2fx) — backend is the bottleneck.", speedup)
	}
	if conErrors.Load() > 0 {
		t.Logf("\n%d concurrent downloads failed — possible OOM on Railway.", conErrors.Load())
	}
}
