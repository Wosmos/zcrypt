package adapters

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/zcrypt/zcrypt/disguise"
	"github.com/zcrypt/zcrypt/transport"
	"github.com/zcrypt/zcrypt/types"
)

const gitlabAPI = "https://gitlab.com/api/v4"

// GitlabAdapter implements PlatformAdapter for GitLab.
type GitlabAdapter struct {
	token    string
	username string
	client   *http.Client
}

// NewGitlabAdapter creates a GitLab adapter with the given token.
func NewGitlabAdapter(token string) (*GitlabAdapter, error) {
	adapter := &GitlabAdapter{
		token:  token,
		client: transport.NewClient(transport.IdleTimeout),
	}

	// Verify token by fetching current user
	user, err := adapter.getCurrentUser()
	if err != nil {
		return nil, fmt.Errorf("authenticate gitlab: %w", err)
	}
	adapter.username = user

	return adapter, nil
}

func (g *GitlabAdapter) PlatformName() string {
	return types.PlatformGitLab
}

// GetUsername returns the authenticated GitLab username.
func (g *GitlabAdapter) GetUsername() string {
	return g.username
}

func (g *GitlabAdapter) CreateRepo(ctx context.Context, name string) (string, error) {
	body := map[string]interface{}{
		"name":                   name,
		"visibility":             "private",
		"description":            "Internal build artifacts and cache storage",
		"initialize_with_readme": true,
	}

	data, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("marshal create project: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", gitlabAPI+"/projects", bytes.NewReader(data))
	if err != nil {
		return "", fmt.Errorf("create project request: %w", err)
	}

	var result struct {
		PathWithNamespace string `json:"path_with_namespace"`
	}
	if err := g.doJSON(req, &result); err != nil {
		return "", fmt.Errorf("create project: %w", err)
	}

	return result.PathWithNamespace, nil
}

func (g *GitlabAdapter) Upload(ctx context.Context, repo string, chunk types.Chunk) (types.ChunkRef, error) {
	remotePath := chunk.Ref.RemotePath
	if remotePath == "" {
		var err error
		remotePath, err = disguise.ShardedChunkFilename()
		if err != nil {
			return types.ChunkRef{}, fmt.Errorf("generate filename: %w", err)
		}
	}

	encodedProject := url.PathEscape(repo)
	encodedPath := url.PathEscape(remotePath)
	apiURL := fmt.Sprintf("%s/projects/%s/repository/files/%s", gitlabAPI, encodedProject, encodedPath)

	body := map[string]string{
		"branch":         "main",
		"content":        base64.StdEncoding.EncodeToString(chunk.Data),
		"commit_message": disguise.CommitMessage(),
		"encoding":       "base64",
	}

	data, err := json.Marshal(body)
	if err != nil {
		return types.ChunkRef{}, fmt.Errorf("marshal upload: %w", err)
	}

	var result struct {
		FilePath string `json:"file_path"`
	}
	var lastErr error
	for attempt := 0; attempt < gitlabUploadAttempts; attempt++ {
		if attempt > 0 {
			wait := transport.Backoff(attempt-1, time.Second, 8*time.Second)
			var se *gitlabStatusError
			if errors.As(lastErr, &se) {
				wait = transport.RetryAfter(wait, se.header)
			}
			select {
			case <-ctx.Done():
				return types.ChunkRef{}, ctx.Err()
			case <-time.After(wait):
			}
		}
		req, err := http.NewRequestWithContext(ctx, "POST", apiURL, bytes.NewReader(data))
		if err != nil {
			return types.ChunkRef{}, fmt.Errorf("create upload request: %w", err)
		}
		lastErr = g.do(req, &result, false)
		if lastErr == nil {
			break
		}
		var se *gitlabStatusError
		if attempt > 0 && errors.As(lastErr, &se) && se.status == http.StatusBadRequest &&
			strings.Contains(se.body, "already exists") {
			lastErr = nil
			break
		}
		if !gitlabRetryable(lastErr) {
			return types.ChunkRef{}, fmt.Errorf("upload chunk: %w", lastErr)
		}
	}
	if lastErr != nil {
		return types.ChunkRef{}, fmt.Errorf("upload chunk: %w", lastErr)
	}

	ref := chunk.Ref
	ref.Platform = types.PlatformGitLab
	ref.Repo = repo
	ref.RemotePath = remotePath
	return ref, nil
}

func (g *GitlabAdapter) Download(ctx context.Context, ref types.ChunkRef) ([]byte, error) {
	encodedProject := url.PathEscape(ref.Repo)
	encodedPath := url.PathEscape(ref.RemotePath)
	apiURL := fmt.Sprintf("%s/projects/%s/repository/files/%s/raw?ref=main", gitlabAPI, encodedProject, encodedPath)

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create download request: %w", err)
	}
	g.setHeaders(req)

	resp, err := g.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download chunk: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("download chunk %s: %w", ref.RemotePath, ErrNotFound)
	}
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

func (g *GitlabAdapter) Delete(ctx context.Context, ref types.ChunkRef) error {
	encodedProject := url.PathEscape(ref.Repo)
	encodedPath := url.PathEscape(ref.RemotePath)
	apiURL := fmt.Sprintf("%s/projects/%s/repository/files/%s", gitlabAPI, encodedProject, encodedPath)

	body := map[string]string{
		"branch":         "main",
		"commit_message": disguise.CommitMessage(),
	}

	data, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal delete: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "DELETE", apiURL, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("create delete request: %w", err)
	}

	cctx, cancel := transport.Control(ctx)
	defer cancel()
	req = req.WithContext(cctx)
	g.setHeaders(req)
	resp, err := g.client.Do(req)
	if err != nil {
		return fmt.Errorf("delete chunk: %w", err)
	}
	defer resp.Body.Close()

	// 404 → the file is already gone (e.g. a planned-but-never-uploaded chunk, or
	// a retry after a prior delete succeeded). Report success so it leaves the
	// deletion queue instead of retrying to a dead-letter forever.
	if resp.StatusCode == http.StatusNotFound {
		return nil
	}
	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("delete returned %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

func (g *GitlabAdapter) GetRepoSize(ctx context.Context, repo string) (int64, error) {
	encodedProject := url.PathEscape(repo)
	apiURL := fmt.Sprintf("%s/projects/%s?statistics=true", gitlabAPI, encodedProject)

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return 0, fmt.Errorf("create get project request: %w", err)
	}

	var result struct {
		Statistics struct {
			RepositorySize int64 `json:"repository_size"`
		} `json:"statistics"`
	}
	if err := g.doJSON(req, &result); err != nil {
		return 0, fmt.Errorf("get project: %w", err)
	}

	return result.Statistics.RepositorySize, nil
}

func (g *GitlabAdapter) ListChunks(ctx context.Context, repo string) ([]types.ChunkRef, error) {
	encodedProject := url.PathEscape(repo)

	// recursive=true walks the shard subdirectories (chunks live under a 2-hex
	// prefix like "02/abc.bin"), and each entry's `path` is the full sharded path
	// that chunks.remote_path stores, so a reconciliation diff lines up. Page
	// through with offset pagination until a short page signals the end; a
	// non-recursive or single-page listing would silently under-report and hide
	// real orphans.
	const perPage = 100
	var refs []types.ChunkRef
	for page := 1; ; page++ {
		apiURL := fmt.Sprintf("%s/projects/%s/repository/tree?ref=main&recursive=true&per_page=%d&page=%d",
			gitlabAPI, encodedProject, perPage, page)

		req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
		if err != nil {
			return nil, fmt.Errorf("create list request: %w", err)
		}

		var items []struct {
			Path string `json:"path"`
			Type string `json:"type"`
		}
		if err := g.doJSON(req, &items); err != nil {
			return nil, fmt.Errorf("list tree page %d: %w", page, err)
		}

		for _, item := range items {
			if item.Type == "blob" && strings.HasSuffix(item.Path, ".bin") {
				refs = append(refs, types.ChunkRef{
					Platform:   types.PlatformGitLab,
					Repo:       repo,
					RemotePath: item.Path,
				})
			}
		}

		// A short (or empty) page is the last one.
		if len(items) < perPage {
			break
		}
	}

	return refs, nil
}

// getCurrentUser fetches the authenticated user's username.
func (g *GitlabAdapter) getCurrentUser() (string, error) {
	req, err := http.NewRequest("GET", gitlabAPI+"/user", nil)
	if err != nil {
		return "", err
	}

	var user struct {
		Username string `json:"username"`
	}
	if err := g.doJSON(req, &user); err != nil {
		return "", err
	}

	return user.Username, nil
}

// setHeaders sets auth and content-type headers.
func (g *GitlabAdapter) setHeaders(req *http.Request) {
	req.Header.Set("PRIVATE-TOKEN", g.token)
	if req.Body != nil && req.Method != "GET" {
		req.Header.Set("Content-Type", "application/json")
	}
}

const gitlabUploadAttempts = 4

type gitlabStatusError struct {
	status int
	body   string
	header http.Header
}

func (e *gitlabStatusError) Error() string {
	return fmt.Sprintf("gitlab API %d: %s", e.status, e.body)
}

func gitlabRetryable(err error) bool {
	var se *gitlabStatusError
	if errors.As(err, &se) {
		return transport.Retryable(se.status)
	}
	return isTransientNetErr(err)
}

// doJSON runs a small control call under the short total timeout.
func (g *GitlabAdapter) doJSON(req *http.Request, result interface{}) error {
	return g.do(req, result, true)
}

// do executes a request with auth headers and decodes the JSON response. Bulk
// calls pass control=false and are bound by the idle rule alone.
func (g *GitlabAdapter) do(req *http.Request, result interface{}, control bool) error {
	if control {
		ctx, cancel := transport.Control(req.Context())
		defer cancel()
		req = req.WithContext(ctx)
	}
	g.setHeaders(req)

	resp, err := g.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return &gitlabStatusError{status: resp.StatusCode, body: string(body), header: resp.Header}
	}

	return json.NewDecoder(resp.Body).Decode(result)
}
