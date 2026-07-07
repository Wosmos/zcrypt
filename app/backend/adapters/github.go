package adapters

import (
	"context"
	"fmt"
	"github.com/google/go-github/v60/github"
	"github.com/zcrypt/zcrypt/disguise"
	"github.com/zcrypt/zcrypt/types"
	"io"
	"math/rand"
	"net/http"
	"strings"
	"time"
)

// GithubAdapter implements PlatformAdapter for GitHub.
type GithubAdapter struct {
	client *github.Client
	owner  string
	token  string
}

// NewGithubAdapter creates a GitHub adapter with the given token.
func NewGithubAdapter(token string) (*GithubAdapter, error) {
	httpClient := &http.Client{Timeout: 60 * time.Second}
	client := github.NewClient(httpClient).WithAuthToken(token)

	user, _, err := client.Users.Get(context.Background(), "")
	if err != nil {
		return nil, fmt.Errorf("authenticate github: %w", err)
	}

	return &GithubAdapter{
		client: client,
		owner:  user.GetLogin(),
		token:  token,
	}, nil
}

func (g *GithubAdapter) PlatformName() string {
	return "github"
}

func (g *GithubAdapter) CreateRepo(ctx context.Context, name string) (string, error) {
	repo := &github.Repository{
		Name:        github.String(name),
		Private:     github.Bool(true),
		Description: github.String("Internal build artifacts and cache storage"),
		AutoInit:    github.Bool(true),
	}

	created, _, err := g.client.Repositories.Create(ctx, "", repo)
	if err != nil {
		return "", fmt.Errorf("create repo: %w", err)
	}

	return created.GetFullName(), nil
}

func (g *GithubAdapter) Upload(ctx context.Context, repo string, chunk types.Chunk) (types.ChunkRef, error) {
	remotePath := chunk.Ref.RemotePath
	if remotePath == "" {
		var err error
		remotePath, err = disguise.ShardedChunkFilename()
		if err != nil {
			return types.ChunkRef{}, fmt.Errorf("generate filename: %w", err)
		}
	}

	owner, repoName := g.parseRepo(repo)

	// Retry on 409 (SHA conflict from concurrent commits) with exponential backoff + jitter.
	// GitHub Contents API creates one commit per CreateFile — concurrent uploads to the same
	// repo race on HEAD SHA. With the server-side per-repo semaphore limiting to 2 concurrent,
	// 10 retries with jitter handles residual contention reliably. The path is held STABLE
	// across retries: a 409 is a HEAD-SHA race, not a path collision, so re-committing the
	// same path after backoff resolves it. Rotating the path here would break the sync
	// worker's invariant that the caller-planned path is authoritative — a rotated-then-lost
	// path (crash before return) would strand the blob where deletion can never find it.
	var lastErr error
	for attempt := 0; attempt < 10; attempt++ {
		if attempt > 0 {
			// Exponential backoff capped at 8s, plus random jitter up to 1s
			base := time.Duration(1<<uint(min(attempt-1, 3))) * time.Second
			jitter := time.Duration(rand.Intn(1000)) * time.Millisecond
			select {
			case <-ctx.Done():
				return types.ChunkRef{}, ctx.Err()
			case <-time.After(base + jitter):
			}
		}

		opts := &github.RepositoryContentFileOptions{
			Message: github.String(disguise.CommitMessage()),
			Content: chunk.Data,
		}

		_, _, err := g.client.Repositories.CreateFile(ctx, owner, repoName, remotePath, opts)
		if err == nil {
			ref := chunk.Ref
			ref.Platform = "github"
			ref.Repo = repo
			ref.RemotePath = remotePath
			return ref, nil
		}

		lastErr = err

		// Retry on 409 Conflict (concurrent commit changed HEAD SHA)
		if errResp, ok := err.(*github.ErrorResponse); ok && errResp.Response != nil && errResp.Response.StatusCode == 409 {
			continue
		}

		// Non-retryable error
		return types.ChunkRef{}, fmt.Errorf("upload chunk: %w", err)
	}

	return types.ChunkRef{}, fmt.Errorf("upload chunk after retries: %w", lastErr)
}

func (g *GithubAdapter) Download(ctx context.Context, ref types.ChunkRef) ([]byte, error) {
	owner, repoName := g.parseRepo(ref.Repo)

	// Use raw.githubusercontent.com directly — single request, no size limit,
	// avoids the 2-request Contents API dance.
	rawURL := fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/main/%s", owner, repoName, ref.RemotePath)
	req, err := http.NewRequestWithContext(ctx, "GET", rawURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create download request: %w", err)
	}
	req.Header.Set("Authorization", "token "+g.token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download file: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download chunk: GET %s: %d %s", rawURL, resp.StatusCode, resp.Status)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read download body: %w", err)
	}

	return data, nil
}

// parseRepo extracts owner and repo name from either:
//   - "owner/repo-name" (correct format)
//   - "github_owner_repo-name" (legacy pool ID format)
func (g *GithubAdapter) parseRepo(repo string) (owner, name string) {
	// Normal format: owner/repo
	if parts := strings.SplitN(repo, "/", 2); len(parts) == 2 {
		return parts[0], parts[1]
	}
	// Legacy format: github_owner_reponame — strip "github_" prefix, split on first "_"
	legacy := repo
	legacy = strings.TrimPrefix(legacy, "github_")
	if parts := strings.SplitN(legacy, "_", 2); len(parts) == 2 {
		return parts[0], parts[1]
	}
	// Fallback
	return g.owner, repo
}

func (g *GithubAdapter) Delete(ctx context.Context, ref types.ChunkRef) error {
	owner, repoName := g.parseRepo(ref.Repo)

	// Get the file SHA first.
	content, _, _, err := g.client.Repositories.GetContents(ctx, owner, repoName, ref.RemotePath, nil)
	if err != nil {
		// Already gone (404) → the chunk is deleted as far as we care; report
		// success so it leaves the deletion queue instead of retrying forever.
		if errResp, ok := err.(*github.ErrorResponse); ok && errResp.Response != nil &&
			errResp.Response.StatusCode == http.StatusNotFound {
			return nil
		}
		return fmt.Errorf("get file for delete: %w", err)
	}

	// GetContents returns a nil file-content (with no error) when the path isn't a
	// single file — e.g. it's a directory, or the file is otherwise absent. There
	// is no SHA to delete, so the chunk is effectively gone. Guard this: a nil
	// dereference here previously panicked and crash-looped the whole deletion
	// worker on the entire batch.
	if content == nil || content.SHA == nil {
		return nil
	}

	opts := &github.RepositoryContentFileOptions{
		Message: github.String(disguise.CommitMessage()),
		SHA:     content.SHA,
	}

	_, _, err = g.client.Repositories.DeleteFile(ctx, owner, repoName, ref.RemotePath, opts)
	if err != nil {
		return fmt.Errorf("delete chunk: %w", err)
	}
	return nil
}

func (g *GithubAdapter) GetRepoSize(ctx context.Context, repo string) (int64, error) {
	owner, repoName := g.parseRepo(repo)

	r, _, err := g.client.Repositories.Get(ctx, owner, repoName)
	if err != nil {
		return 0, fmt.Errorf("get repo: %w", err)
	}

	// GitHub returns size in KB
	return int64(r.GetSize()) * 1024, nil
}

func (g *GithubAdapter) ListChunks(ctx context.Context, repo string) ([]types.ChunkRef, error) {
	owner := g.owner
	repoName := repoNameFromFull(repo)
	if parts := strings.SplitN(repo, "/", 2); len(parts) == 2 {
		owner = parts[0]
		repoName = parts[1]
	}

	// Use the recursive Git Trees API rather than GetContents on the root: chunks
	// are stored under a 2-hex-char shard directory (e.g. "02/abc.bin"), so a
	// root-only listing would miss every blob. recursive=true returns the whole
	// tree in one call and each entry's Path is the full sharded path, which is
	// exactly what chunks.remote_path stores — so a reconciliation diff matches.
	tree, resp, err := g.client.Git.GetTree(ctx, owner, repoName, "HEAD", true)
	if err != nil {
		// An empty repo (no commits yet) has no tree → nothing stored, not an error.
		if resp != nil && resp.StatusCode == http.StatusNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("get tree: %w", err)
	}

	var refs []types.ChunkRef
	for _, entry := range tree.Entries {
		if entry.GetType() != "blob" {
			continue
		}
		path := entry.GetPath()
		if strings.HasSuffix(path, ".bin") {
			refs = append(refs, types.ChunkRef{
				Platform:   "github",
				Repo:       repo,
				RemotePath: path,
				Size:       int64(entry.GetSize()),
			})
		}
	}
	// GitHub truncates the tree response above ~100k entries / 7MB. Our repos cap
	// far below that (GitHub threshold 850MB of ~10-17MB chunks ≈ <90 blobs), so
	// truncation should never happen — but surface it rather than silently
	// under-reporting, which for a reconciliation sweep would hide real orphans.
	if tree.GetTruncated() {
		return refs, fmt.Errorf("tree listing truncated for %s: results incomplete", repo)
	}
	return refs, nil
}

// GetUsername returns the authenticated GitHub username.
func (g *GithubAdapter) GetUsername() string {
	return g.owner
}

func repoNameFromFull(full string) string {
	if parts := strings.SplitN(full, "/", 2); len(parts) == 2 {
		return parts[1]
	}
	return full
}
