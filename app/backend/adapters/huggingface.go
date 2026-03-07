package adapters

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/zpush/zpush/disguise"
	"github.com/zpush/zpush/types"
)

const hfEndpoint = "https://huggingface.co"

// HuggingFaceAdapter implements PlatformAdapter for Hugging Face Hub.
type HuggingFaceAdapter struct {
	token    string
	username string
	client   *http.Client
}

// NewHuggingFaceAdapter creates a HuggingFace adapter with the given token.
func NewHuggingFaceAdapter(token string) (*HuggingFaceAdapter, error) {
	adapter := &HuggingFaceAdapter{
		token:  token,
		client: &http.Client{},
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
		remotePath, err = disguise.ChunkFilename()
		if err != nil {
			return types.ChunkRef{}, fmt.Errorf("generate filename: %w", err)
		}
	}

	// Compute SHA-256 for LFS
	hash := sha256.Sum256(chunk.Data)
	oid := hex.EncodeToString(hash[:])
	size := int64(len(chunk.Data))

	// Step 1: LFS batch request to get upload URL
	if err := h.lfsUpload(ctx, repo, oid, size, chunk.Data); err != nil {
		return types.ChunkRef{}, fmt.Errorf("lfs upload: %w", err)
	}

	// Step 2: Create commit referencing the LFS object
	if err := h.createLFSCommit(ctx, repo, remotePath, oid, size); err != nil {
		return types.ChunkRef{}, fmt.Errorf("commit: %w", err)
	}

	ref := chunk.Ref
	ref.Platform = "huggingface"
	ref.Repo = repo
	ref.RemotePath = remotePath
	return ref, nil
}

func (h *HuggingFaceAdapter) Download(ctx context.Context, ref types.ChunkRef) ([]byte, error) {
	downloadURL := fmt.Sprintf("%s/%s/resolve/main/%s", hfEndpoint, ref.Repo, ref.RemotePath)

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
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	headerPart, err := writer.CreateFormField("header")
	if err != nil {
		return fmt.Errorf("create header part: %w", err)
	}

	commitHeader := map[string]interface{}{
		"summary":      disguise.CommitMessage(),
		"deletedFiles": []string{ref.RemotePath},
	}
	headerData, err := json.Marshal(commitHeader)
	if err != nil {
		return fmt.Errorf("marshal commit header: %w", err)
	}
	if _, err := headerPart.Write(headerData); err != nil {
		return fmt.Errorf("write header: %w", err)
	}
	writer.Close()

	commitURL := fmt.Sprintf("%s/api/models/%s/commit/main", hfEndpoint, ref.Repo)
	req, err := http.NewRequestWithContext(ctx, "POST", commitURL, &buf)
	if err != nil {
		return fmt.Errorf("create delete commit request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	h.setAuth(req)

	resp, err := h.client.Do(req)
	if err != nil {
		return fmt.Errorf("delete commit: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("delete commit returned %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

func (h *HuggingFaceAdapter) GetRepoSize(ctx context.Context, repo string) (int64, error) {
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
	apiURL := fmt.Sprintf("%s/api/models/%s/tree/main", hfEndpoint, repo)
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create list request: %w", err)
	}

	var items []struct {
		Type string `json:"type"`
		Path string `json:"path"`
		Size int64  `json:"size"`
	}
	if err := h.doJSON(req, &items); err != nil {
		return nil, fmt.Errorf("list tree: %w", err)
	}

	var refs []types.ChunkRef
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

	return refs, nil
}

// lfsUpload handles the Git LFS batch protocol to upload binary data.
func (h *HuggingFaceAdapter) lfsUpload(ctx context.Context, repo, oid string, size int64, data []byte) error {
	// LFS batch request
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
		return fmt.Errorf("marshal lfs batch: %w", err)
	}

	lfsURL := fmt.Sprintf("%s/%s.git/info/lfs/objects/batch", hfEndpoint, repo)
	req, err := http.NewRequestWithContext(ctx, "POST", lfsURL, bytes.NewReader(bodyData))
	if err != nil {
		return fmt.Errorf("create lfs batch request: %w", err)
	}
	req.Header.Set("Content-Type", "application/vnd.git-lfs+json")
	req.Header.Set("Accept", "application/vnd.git-lfs+json")
	h.setAuth(req)

	resp, err := h.client.Do(req)
	if err != nil {
		return fmt.Errorf("lfs batch: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("lfs batch returned %d: %s", resp.StatusCode, string(body))
	}

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
	if err := json.NewDecoder(resp.Body).Decode(&batchResp); err != nil {
		return fmt.Errorf("decode lfs batch: %w", err)
	}

	if len(batchResp.Objects) == 0 {
		return fmt.Errorf("lfs batch returned no objects")
	}

	obj := batchResp.Objects[0]

	// If no upload action, the object already exists (deduplication)
	if obj.Actions.Upload.Href == "" {
		return nil
	}

	// Upload the actual data
	uploadReq, err := http.NewRequestWithContext(ctx, "PUT", obj.Actions.Upload.Href, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("create lfs upload request: %w", err)
	}
	uploadReq.Header.Set("Content-Type", "application/octet-stream")
	for k, v := range obj.Actions.Upload.Header {
		uploadReq.Header.Set(k, v)
	}

	uploadResp, err := h.client.Do(uploadReq)
	if err != nil {
		return fmt.Errorf("lfs upload: %w", err)
	}
	defer uploadResp.Body.Close()

	if uploadResp.StatusCode < 200 || uploadResp.StatusCode >= 300 {
		body, _ := io.ReadAll(uploadResp.Body)
		return fmt.Errorf("lfs upload returned %d: %s", uploadResp.StatusCode, string(body))
	}

	return nil
}

// createLFSCommit creates a commit that references an LFS object.
func (h *HuggingFaceAdapter) createLFSCommit(ctx context.Context, repo, path, oid string, size int64) error {
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	headerPart, err := writer.CreateFormField("header")
	if err != nil {
		return fmt.Errorf("create header part: %w", err)
	}

	commitHeader := map[string]interface{}{
		"summary": disguise.CommitMessage(),
		"lfsFiles": []map[string]interface{}{
			{
				"path": path,
				"algo": "sha256",
				"oid":  oid,
				"size": size,
			},
		},
	}
	headerData, err := json.Marshal(commitHeader)
	if err != nil {
		return fmt.Errorf("marshal commit header: %w", err)
	}
	if _, err := headerPart.Write(headerData); err != nil {
		return fmt.Errorf("write header: %w", err)
	}
	writer.Close()

	commitURL := fmt.Sprintf("%s/api/models/%s/commit/main", hfEndpoint, repo)
	req, err := http.NewRequestWithContext(ctx, "POST", commitURL, &buf)
	if err != nil {
		return fmt.Errorf("create commit request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	h.setAuth(req)

	resp, err := h.client.Do(req)
	if err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("commit returned %d: %s", resp.StatusCode, string(body))
	}

	return nil
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
