package adapters

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/zcrypt/zcrypt/disguise"
	"github.com/zcrypt/zcrypt/types"
)

const (
	maxRetries    = 3
	retryBaseWait = 2 * time.Second
)

const hfEndpoint = "https://huggingface.co"

// lfsFileEntry holds info for a pending LFS commit.
type lfsFileEntry struct {
	Path string
	OID  string
	Size int64
}

// HuggingFaceAdapter implements PlatformAdapter for Hugging Face Hub.
type HuggingFaceAdapter struct {
	token    string
	username string
	client   *http.Client

	mu             sync.Mutex
	pendingCommits []lfsFileEntry
}

// NewHuggingFaceAdapter creates a HuggingFace adapter with the given token.
func NewHuggingFaceAdapter(token string) (*HuggingFaceAdapter, error) {
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		TLSHandshakeTimeout:   30 * time.Second,
		ResponseHeaderTimeout: 120 * time.Second,
		DialContext: (&net.Dialer{
			Timeout:   30 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:        10,
		IdleConnTimeout:     90 * time.Second,
		DisableKeepAlives:   false,
		MaxIdleConnsPerHost: 4,
	}
	adapter := &HuggingFaceAdapter{
		token: token,
		client: &http.Client{
			Transport: transport,
			Timeout:   0, // no overall timeout — uploads can be large
		},
	}

	user, err := adapter.whoami()
	if err != nil {
		return nil, fmt.Errorf("authenticate huggingface: %w", err)
	}
	adapter.username = user

	return adapter, nil
}

func (h *HuggingFaceAdapter) PlatformName() string {
	return "huggingface"
}

// GetUsername returns the authenticated HuggingFace username.
func (h *HuggingFaceAdapter) GetUsername() string {
	return h.username
}

func (h *HuggingFaceAdapter) CreateRepo(ctx context.Context, name string) (string, error) {
	body := map[string]interface{}{
		"type":    "model",
		"name":    name,
		"private": true,
	}

	data, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("marshal create repo: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", hfEndpoint+"/api/repos/create", bytes.NewReader(data))
	if err != nil {
		return "", fmt.Errorf("create repo request: %w", err)
	}

	var result struct {
		URL string `json:"url"`
	}
	if err := h.doJSON(req, &result); err != nil {
		return "", fmt.Errorf("create repo: %w", err)
	}

	return h.username + "/" + name, nil
}

func (h *HuggingFaceAdapter) Upload(ctx context.Context, repo string, chunk types.Chunk) (types.ChunkRef, error) {
	remotePath := chunk.Ref.RemotePath
	if remotePath == "" {
		var err error
		remotePath, err = disguise.ShardedChunkFilename()
		if err != nil {
			return types.ChunkRef{}, fmt.Errorf("generate filename: %w", err)
		}
	}

	// Compute SHA-256 for LFS
	hash := sha256.Sum256(chunk.Data)
	oid := hex.EncodeToString(hash[:])
	size := int64(len(chunk.Data))

	// Upload blob to LFS storage (no commit yet)
	if err := h.lfsUpload(ctx, repo, oid, size, chunk.Data); err != nil {
		return types.ChunkRef{}, fmt.Errorf("lfs upload: %w", err)
	}

	// Buffer the commit info — FlushCommits will create a single commit for all chunks
	h.mu.Lock()
	h.pendingCommits = append(h.pendingCommits, lfsFileEntry{Path: remotePath, OID: oid, Size: size})
	h.mu.Unlock()

	ref := chunk.Ref
	ref.Platform = "huggingface"
	ref.Repo = repo
	ref.RemotePath = remotePath
	return ref, nil
}

// FlushCommits creates a single commit for all pending LFS uploads buffered
// in-memory (legacy path). Implements the BatchCommitter interface.
func (h *HuggingFaceAdapter) FlushCommits(ctx context.Context, repo string) error {
	h.mu.Lock()
	pending := h.pendingCommits
	h.pendingCommits = nil
	h.mu.Unlock()
	return h.commitEntries(ctx, repo, pending)
}

// CommitChunks implements BatchCommitter — commits already-uploaded LFS objects
// from DB-derived entries. Unlike FlushCommits it depends on NO in-memory state,
// so the reconcile worker can call it after a restart / cache eviction and it is
// idempotent (re-committing an already-present path is a platform no-op).
func (h *HuggingFaceAdapter) CommitChunks(ctx context.Context, repo string, files []CommitFile) error {
	if len(files) == 0 {
		return nil
	}
	entries := make([]lfsFileEntry, len(files))
	for i, f := range files {
		entries[i] = lfsFileEntry{Path: f.Path, OID: f.OID, Size: f.Size}
	}
	return h.commitEntries(ctx, repo, entries)
}

// commitEntries builds one NDJSON commit for the given LFS entries and POSTs it
// to HuggingFace with retry/backoff. A nil/empty list is a no-op.
func (h *HuggingFaceAdapter) commitEntries(ctx context.Context, repo string, pending []lfsFileEntry) error {
	if len(pending) == 0 {
		return nil
	}

	ndjson := buildNDJSON(
		map[string]interface{}{
			"key":   "header",
			"value": map[string]interface{}{"summary": disguise.CommitMessage()},
		},
	)
	for _, entry := range pending {
		ndjson = appendNDJSON(ndjson, map[string]interface{}{
			"key": "lfsFile",
			"value": map[string]interface{}{
				"path": entry.Path,
				"algo": "sha256",
				"oid":  entry.OID,
				"size": entry.Size,
			},
		})
	}

	commitURL := fmt.Sprintf("%s/api/models/%s/commit/main", hfEndpoint, repo)

	// Retry with exponential backoff
	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			wait := retryBaseWait * time.Duration(math.Pow(2, float64(attempt-1)))
			log.Printf("retrying batch commit (attempt %d/%d) after %v: %v", attempt, maxRetries, wait, lastErr)
			select {
			case <-ctx.Done():
				return fmt.Errorf("batch commit: %w", ctx.Err())
			case <-time.After(wait):
			}
		}

		req, err := http.NewRequestWithContext(ctx, "POST", commitURL, bytes.NewReader(ndjson))
		if err != nil {
			return fmt.Errorf("create batch commit request: %w", err)
		}
		req.Header.Set("Content-Type", "application/x-ndjson")
		h.setAuth(req)

		resp, err := h.client.Do(req)
		if err != nil {
			lastErr = err
			if isRetryable(err) {
				continue
			}
			return fmt.Errorf("batch commit: %w", err)
		}

		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return nil
		}
		if resp.StatusCode >= 500 || resp.StatusCode == 429 {
			lastErr = fmt.Errorf("batch commit returned %d: %s", resp.StatusCode, string(body))
			continue
		}
		return fmt.Errorf("batch commit returned %d: %s", resp.StatusCode, string(body))
	}

	return fmt.Errorf("batch commit after %d retries: %w", maxRetries, lastErr)
}

func (h *HuggingFaceAdapter) Download(ctx context.Context, ref types.ChunkRef) ([]byte, error) {
	// Handle legacy chunks that stored only the short repo name (without username prefix)
	repo := ref.Repo
	if !strings.Contains(repo, "/") {
		repo = h.username + "/" + repo
	}
	downloadURL := fmt.Sprintf("%s/%s/resolve/main/%s", hfEndpoint, repo, ref.RemotePath)

	req, err := http.NewRequestWithContext(ctx, "GET", downloadURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create download request: %w", err)
	}
	h.setAuth(req)

	resp, err := h.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download chunk: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("download returned %d: %s", resp.StatusCode, string(body))
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read download body: %w", err)
	}

	return data, nil
}

func (h *HuggingFaceAdapter) Delete(ctx context.Context, ref types.ChunkRef) error {
	// Handle legacy chunks that stored only the short repo name (without username prefix)
	repo := ref.Repo
	if !strings.Contains(repo, "/") {
		repo = h.username + "/" + repo
	}

	ndjson := buildNDJSON(
		map[string]interface{}{
			"key":   "header",
			"value": map[string]interface{}{"summary": disguise.CommitMessage()},
		},
	)
	ndjson = appendNDJSON(ndjson, map[string]interface{}{
		"key":   "deletedFile",
		"value": map[string]interface{}{"path": ref.RemotePath},
	})

	commitURL := fmt.Sprintf("%s/api/models/%s/commit/main", hfEndpoint, repo)
	req, err := http.NewRequestWithContext(ctx, "POST", commitURL, bytes.NewReader(ndjson))
	if err != nil {
		return fmt.Errorf("create delete commit request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-ndjson")
	h.setAuth(req)

	resp, err := h.client.Do(req)
	if err != nil {
		return fmt.Errorf("delete commit: %w", err)
	}
	defer resp.Body.Close()

	// 404 → the file (or repo) is already gone: a planned-but-never-uploaded
	// chunk, or a retry after a prior successful delete. Report success so it
	// leaves the deletion queue instead of retrying to a dead-letter forever.
	if resp.StatusCode == http.StatusNotFound {
		return nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("delete commit returned %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// BatchDelete removes many chunks from one repo in a SINGLE commit (implements
// BatchDeleter). It first lists the repo tree so paths that no longer exist are
// skipped rather than failing the commit. This both (a) avoids HuggingFace's
// 128-commits/hour/repo limit — one commit for the whole batch instead of one
// per file — and (b) lets a queue full of never-committed / already-gone paths
// drain in a single tree read with no commit at all. A rate-limit (429) is
// returned verbatim so the caller can detect it and back off.
func (h *HuggingFaceAdapter) BatchDelete(ctx context.Context, repo string, remotePaths []string) error {
	if len(remotePaths) == 0 {
		return nil
	}
	if !strings.Contains(repo, "/") {
		repo = h.username + "/" + repo
	}

	// Only reference paths that actually exist — deleting an absent path would
	// fail the whole commit, and the storm we're draining is mostly never-committed
	// paths that are already "gone" as far as the platform is concerned.
	present, err := h.ListChunks(ctx, repo)
	if err != nil {
		return fmt.Errorf("list repo for batch delete: %w", err)
	}
	presentSet := make(map[string]struct{}, len(present))
	for _, p := range present {
		presentSet[p.RemotePath] = struct{}{}
	}

	ndjson := buildNDJSON(map[string]interface{}{
		"key":   "header",
		"value": map[string]interface{}{"summary": disguise.CommitMessage()},
	})
	n := 0
	for _, path := range remotePaths {
		if _, ok := presentSet[path]; !ok {
			continue // already absent — nothing to delete
		}
		ndjson = appendNDJSON(ndjson, map[string]interface{}{
			"key":   "deletedFile",
			"value": map[string]interface{}{"path": path},
		})
		n++
	}
	if n == 0 {
		return nil // every path already gone — no commit needed
	}

	commitURL := fmt.Sprintf("%s/api/models/%s/commit/main", hfEndpoint, repo)
	req, err := http.NewRequestWithContext(ctx, "POST", commitURL, bytes.NewReader(ndjson))
	if err != nil {
		return fmt.Errorf("create batch delete request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-ndjson")
	h.setAuth(req)

	resp, err := h.client.Do(req)
	if err != nil {
		return fmt.Errorf("batch delete: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil // repo/paths already gone
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("batch delete returned %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (h *HuggingFaceAdapter) GetRepoSize(ctx context.Context, repo string) (int64, error) {
	if !strings.Contains(repo, "/") {
		repo = h.username + "/" + repo
	}
	apiURL := fmt.Sprintf("%s/api/models/%s", hfEndpoint, repo)
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return 0, fmt.Errorf("create repo info request: %w", err)
	}

	var result struct {
		Siblings []struct {
			RFilename string `json:"rfilename"`
			Size      int64  `json:"size"`
		} `json:"siblings"`
	}
	if err := h.doJSON(req, &result); err != nil {
		return 0, fmt.Errorf("get repo info: %w", err)
	}

	var total int64
	for _, f := range result.Siblings {
		total += f.Size
	}
	return total, nil
}

func (h *HuggingFaceAdapter) ListChunks(ctx context.Context, repo string) ([]types.ChunkRef, error) {
	if !strings.Contains(repo, "/") {
		repo = h.username + "/" + repo
	}

	// recursive=true walks the shard subdirectories (chunks live under a 2-hex
	// prefix like "02/abc.bin") and returns each file's full `path`, matching what
	// chunks.remote_path stores so a reconciliation diff lines up. limit=1000 is
	// the API max; the response's Link header carries a rel="next" cursor when a
	// repo has more, which we follow so nothing is silently under-reported.
	nextURL := fmt.Sprintf("%s/api/models/%s/tree/main?recursive=true&limit=1000", hfEndpoint, repo)

	var refs []types.ChunkRef
	for nextURL != "" {
		req, err := http.NewRequestWithContext(ctx, "GET", nextURL, nil)
		if err != nil {
			return nil, fmt.Errorf("create list request: %w", err)
		}
		h.setAuth(req)

		resp, err := h.client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("list tree: %w", err)
		}

		var items []struct {
			Type string `json:"type"`
			Path string `json:"path"`
			Size int64  `json:"size"`
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			return nil, fmt.Errorf("list tree: huggingface API %d: %s", resp.StatusCode, string(body))
		}
		if err := json.NewDecoder(resp.Body).Decode(&items); err != nil {
			resp.Body.Close()
			return nil, fmt.Errorf("decode tree: %w", err)
		}
		nextURL = parseNextLink(resp.Header.Get("Link"))
		resp.Body.Close()

		for _, item := range items {
			if item.Type == "file" && strings.HasSuffix(item.Path, ".bin") {
				refs = append(refs, types.ChunkRef{
					Platform:   "huggingface",
					Repo:       repo,
					RemotePath: item.Path,
					Size:       item.Size,
				})
			}
		}
	}

	return refs, nil
}

// parseNextLink extracts the rel="next" URL from an RFC 5988 Link header, as
// used by the HuggingFace tree API for cursor pagination. Returns "" when there
// is no next page.
func parseNextLink(header string) string {
	if header == "" {
		return ""
	}
	for _, part := range strings.Split(header, ",") {
		segs := strings.Split(part, ";")
		if len(segs) < 2 {
			continue
		}
		isNext := false
		for _, s := range segs[1:] {
			if strings.Contains(s, `rel="next"`) {
				isNext = true
				break
			}
		}
		if !isNext {
			continue
		}
		url := strings.TrimSpace(segs[0])
		url = strings.TrimPrefix(url, "<")
		url = strings.TrimSuffix(url, ">")
		return url
	}
	return ""
}

// isRetryable returns true for transient network errors worth retrying.
func isRetryable(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "TLS handshake timeout") ||
		strings.Contains(s, "connection reset") ||
		strings.Contains(s, "connection refused") ||
		strings.Contains(s, "i/o timeout") ||
		strings.Contains(s, "EOF")
}

// getLFSUploadInfo calls the LFS batch API to obtain a presigned upload URL.
// Returns ("", nil, nil) if the object already exists on the platform (dedup).
func (h *HuggingFaceAdapter) getLFSUploadInfo(ctx context.Context, repo, oid string, size int64) (string, map[string]string, error) {
	batchBody := map[string]interface{}{
		"operation": "upload",
		"transfers": []string{"basic"},
		"objects": []map[string]interface{}{
			{
				"oid":  oid,
				"size": size,
			},
		},
	}

	bodyData, err := json.Marshal(batchBody)
	if err != nil {
		return "", nil, fmt.Errorf("marshal lfs batch: %w", err)
	}

	lfsURL := fmt.Sprintf("%s/%s.git/info/lfs/objects/batch", hfEndpoint, repo)

	var batchResp struct {
		Objects []struct {
			OID     string `json:"oid"`
			Size    int64  `json:"size"`
			Actions struct {
				Upload struct {
					Href   string            `json:"href"`
					Header map[string]string `json:"header"`
				} `json:"upload"`
			} `json:"actions"`
		} `json:"objects"`
	}

	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			wait := retryBaseWait * time.Duration(math.Pow(2, float64(attempt-1)))
			log.Printf("retrying LFS batch (attempt %d/%d) after %v: %v", attempt, maxRetries, wait, lastErr)
			select {
			case <-ctx.Done():
				return "", nil, fmt.Errorf("lfs batch: %w", ctx.Err())
			case <-time.After(wait):
			}
		}

		req, err := http.NewRequestWithContext(ctx, "POST", lfsURL, bytes.NewReader(bodyData))
		if err != nil {
			return "", nil, fmt.Errorf("create lfs batch request: %w", err)
		}
		req.Header.Set("Content-Type", "application/vnd.git-lfs+json")
		req.Header.Set("Accept", "application/vnd.git-lfs+json")
		h.setAuth(req)

		resp, err := h.client.Do(req)
		if err != nil {
			lastErr = err
			if isRetryable(err) {
				continue
			}
			return "", nil, fmt.Errorf("lfs batch: %w", err)
		}

		if resp.StatusCode >= 500 {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			lastErr = fmt.Errorf("lfs batch returned %d: %s", resp.StatusCode, string(body))
			continue
		}

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			return "", nil, fmt.Errorf("lfs batch returned %d: %s", resp.StatusCode, string(body))
		}

		if err := json.NewDecoder(resp.Body).Decode(&batchResp); err != nil {
			resp.Body.Close()
			return "", nil, fmt.Errorf("decode lfs batch: %w", err)
		}
		resp.Body.Close()
		lastErr = nil
		break
	}
	if lastErr != nil {
		return "", nil, fmt.Errorf("lfs batch after %d retries: %w", maxRetries, lastErr)
	}

	if len(batchResp.Objects) == 0 {
		return "", nil, fmt.Errorf("lfs batch returned no objects")
	}

	obj := batchResp.Objects[0]

	// No upload action means the object already exists (dedup)
	if obj.Actions.Upload.Href == "" {
		return "", nil, nil
	}

	return obj.Actions.Upload.Href, obj.Actions.Upload.Header, nil
}

// uploadToLFSURL uploads data to a presigned LFS URL with retries.
func (h *HuggingFaceAdapter) uploadToLFSURL(ctx context.Context, url string, headers map[string]string, data []byte) error {
	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			wait := retryBaseWait * time.Duration(math.Pow(2, float64(attempt-1)))
			log.Printf("retrying LFS upload (attempt %d/%d) after %v: %v", attempt, maxRetries, wait, lastErr)
			select {
			case <-ctx.Done():
				return fmt.Errorf("lfs upload: %w", ctx.Err())
			case <-time.After(wait):
			}
		}

		uploadReq, err := http.NewRequestWithContext(ctx, "PUT", url, bytes.NewReader(data))
		if err != nil {
			return fmt.Errorf("create lfs upload request: %w", err)
		}
		uploadReq.Header.Set("Content-Type", "application/octet-stream")
		for k, v := range headers {
			uploadReq.Header.Set(k, v)
		}

		uploadResp, err := h.client.Do(uploadReq)
		if err != nil {
			lastErr = err
			if isRetryable(err) {
				continue
			}
			return fmt.Errorf("lfs upload: %w", err)
		}

		if uploadResp.StatusCode >= 500 {
			body, _ := io.ReadAll(uploadResp.Body)
			uploadResp.Body.Close()
			lastErr = fmt.Errorf("lfs upload returned %d: %s", uploadResp.StatusCode, string(body))
			continue
		}

		if uploadResp.StatusCode < 200 || uploadResp.StatusCode >= 300 {
			body, _ := io.ReadAll(uploadResp.Body)
			uploadResp.Body.Close()
			return fmt.Errorf("lfs upload returned %d: %s", uploadResp.StatusCode, string(body))
		}
		uploadResp.Body.Close()
		return nil
	}

	return fmt.Errorf("lfs upload after %d retries: %w", maxRetries, lastErr)
}

// lfsUpload handles the Git LFS batch protocol to upload binary data.
func (h *HuggingFaceAdapter) lfsUpload(ctx context.Context, repo, oid string, size int64, data []byte) error {
	url, headers, err := h.getLFSUploadInfo(ctx, repo, oid, size)
	if err != nil {
		return err
	}
	if url == "" {
		return nil // already exists (dedup)
	}
	return h.uploadToLFSURL(ctx, url, headers, data)
}

// GetUploadURL implements DirectUploader — returns a presigned URL for direct client upload.
func (h *HuggingFaceAdapter) GetUploadURL(ctx context.Context, repo string, oid string, size int64) (string, map[string]string, error) {
	return h.getLFSUploadInfo(ctx, repo, oid, size)
}

// RegisterUpload implements DirectUploader — records a directly-uploaded chunk for batch commit.
func (h *HuggingFaceAdapter) RegisterUpload(remotePath, oid string, size int64) {
	h.mu.Lock()
	h.pendingCommits = append(h.pendingCommits, lfsFileEntry{Path: remotePath, OID: oid, Size: size})
	h.mu.Unlock()
}

// createLFSCommit creates a commit that references an LFS object (used by Delete).
func (h *HuggingFaceAdapter) createLFSCommit(ctx context.Context, repo, path, oid string, size int64) error {
	ndjson := buildNDJSON(
		map[string]interface{}{
			"key":   "header",
			"value": map[string]interface{}{"summary": disguise.CommitMessage()},
		},
	)
	ndjson = appendNDJSON(ndjson, map[string]interface{}{
		"key": "lfsFile",
		"value": map[string]interface{}{
			"path": path, "algo": "sha256", "oid": oid, "size": size,
		},
	})

	commitURL := fmt.Sprintf("%s/api/models/%s/commit/main", hfEndpoint, repo)

	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			wait := retryBaseWait * time.Duration(math.Pow(2, float64(attempt-1)))
			select {
			case <-ctx.Done():
				return fmt.Errorf("commit: %w", ctx.Err())
			case <-time.After(wait):
			}
		}

		req, err := http.NewRequestWithContext(ctx, "POST", commitURL, bytes.NewReader(ndjson))
		if err != nil {
			return fmt.Errorf("create commit request: %w", err)
		}
		req.Header.Set("Content-Type", "application/x-ndjson")
		h.setAuth(req)

		resp, err := h.client.Do(req)
		if err != nil {
			lastErr = err
			if isRetryable(err) {
				continue
			}
			return fmt.Errorf("commit: %w", err)
		}

		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return nil
		}
		if resp.StatusCode >= 500 || resp.StatusCode == 429 {
			lastErr = fmt.Errorf("commit returned %d: %s", resp.StatusCode, string(body))
			continue
		}
		return fmt.Errorf("commit returned %d: %s", resp.StatusCode, string(body))
	}
	return fmt.Errorf("commit after %d retries: %w", maxRetries, lastErr)
}

// buildNDJSON creates an NDJSON byte slice from the first entry.
func buildNDJSON(entry map[string]interface{}) []byte {
	data, _ := json.Marshal(entry)
	return data
}

// appendNDJSON appends another JSON line to an NDJSON byte slice.
func appendNDJSON(ndjson []byte, entry map[string]interface{}) []byte {
	data, _ := json.Marshal(entry)
	ndjson = append(ndjson, '\n')
	ndjson = append(ndjson, data...)
	return ndjson
}

// whoami fetches the authenticated user's username.
func (h *HuggingFaceAdapter) whoami() (string, error) {
	req, err := http.NewRequest("GET", hfEndpoint+"/api/whoami-v2", nil)
	if err != nil {
		return "", err
	}

	var result struct {
		Name string `json:"name"`
	}
	if err := h.doJSON(req, &result); err != nil {
		return "", err
	}

	return result.Name, nil
}

// setAuth sets the Authorization bearer header.
func (h *HuggingFaceAdapter) setAuth(req *http.Request) {
	req.Header.Set("Authorization", "Bearer "+h.token)
}

// doJSON executes a request with auth headers and decodes JSON response.
func (h *HuggingFaceAdapter) doJSON(req *http.Request, result interface{}) error {
	h.setAuth(req)
	if req.Body != nil && req.Method != "GET" {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := h.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("huggingface API %d: %s", resp.StatusCode, string(body))
	}

	return json.NewDecoder(resp.Body).Decode(result)
}
