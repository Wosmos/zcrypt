package adapters

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/google/go-github/v60/github"
	"github.com/zpush/zpush/disguise"
	"github.com/zpush/zpush/types"
)

// GithubAdapter implements PlatformAdapter for GitHub.
type GithubAdapter struct {
	client *github.Client
	owner  string
}

// NewGithubAdapter creates a GitHub adapter with the given token.
func NewGithubAdapter(token string) (*GithubAdapter, error) {
	client := github.NewClient(nil).WithAuthToken(token)

	user, _, err := client.Users.Get(context.Background(), "")
	if err != nil {
		return nil, fmt.Errorf("authenticate github: %w", err)
	}

	return &GithubAdapter{
		client: client,
		owner:  user.GetLogin(),
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
		remotePath, err = disguise.ChunkFilename()
		if err != nil {
			return types.ChunkRef{}, fmt.Errorf("generate filename: %w", err)
		}
	}

	repoName := repoNameFromFull(repo)
	owner := g.owner
	if parts := strings.SplitN(repo, "/", 2); len(parts) == 2 {
		owner = parts[0]
		repoName = parts[1]
	}

	opts := &github.RepositoryContentFileOptions{
		Message: github.String(disguise.CommitMessage()),
		Content: chunk.Data,
	}

	_, _, err := g.client.Repositories.CreateFile(ctx, owner, repoName, remotePath, opts)
	if err != nil {
		return types.ChunkRef{}, fmt.Errorf("upload chunk: %w", err)
	}

	ref := chunk.Ref
	ref.Platform = "github"
	ref.Repo = repo
	ref.RemotePath = remotePath
	return ref, nil
}

func (g *GithubAdapter) Download(ctx context.Context, ref types.ChunkRef) ([]byte, error) {
	owner := g.owner
	repoName := repoNameFromFull(ref.Repo)
	if parts := strings.SplitN(ref.Repo, "/", 2); len(parts) == 2 {
		owner = parts[0]
		repoName = parts[1]
	}

	// Use the download URL for large binary files (Contents API has 1MB limit for content)
	content, _, _, err := g.client.Repositories.GetContents(ctx, owner, repoName, ref.RemotePath, nil)
	if err != nil {
		return nil, fmt.Errorf("download chunk: %w", err)
	}

	downloadURL := content.GetDownloadURL()
	if downloadURL == "" {
		return nil, fmt.Errorf("no download url for %s", ref.RemotePath)
	}

	req, err := http.NewRequestWithContext(ctx, "GET", downloadURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create download request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download file: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download returned status %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read download body: %w", err)
	}

	return data, nil
}

func (g *GithubAdapter) Delete(ctx context.Context, ref types.ChunkRef) error {
	owner := g.owner
	repoName := repoNameFromFull(ref.Repo)
	if parts := strings.SplitN(ref.Repo, "/", 2); len(parts) == 2 {
		owner = parts[0]
		repoName = parts[1]
	}

	// Get the file SHA first
	content, _, _, err := g.client.Repositories.GetContents(ctx, owner, repoName, ref.RemotePath, nil)
	if err != nil {
		return fmt.Errorf("get file for delete: %w", err)
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
	owner := g.owner
	repoName := repoNameFromFull(repo)
	if parts := strings.SplitN(repo, "/", 2); len(parts) == 2 {
		owner = parts[0]
		repoName = parts[1]
	}

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

	_, dirContent, _, err := g.client.Repositories.GetContents(ctx, owner, repoName, "", nil)
	if err != nil {
		return nil, fmt.Errorf("list contents: %w", err)
	}

	var refs []types.ChunkRef
	for _, item := range dirContent {
		name := item.GetName()
		if strings.HasSuffix(name, ".bin") {
			refs = append(refs, types.ChunkRef{
				Platform:   "github",
				Repo:       repo,
				RemotePath: name,
				Size:       int64(item.GetSize()),
			})
		}
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
