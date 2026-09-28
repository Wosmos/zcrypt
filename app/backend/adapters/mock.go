package adapters

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/zcrypt/zcrypt/disguise"
	"github.com/zcrypt/zcrypt/types"
)

// defaultMockAdapterDir is used when MOCK_ADAPTER_DIR is unset.
const defaultMockAdapterDir = "/data/mock-storage"

// MockAdapter is a disk-backed PlatformAdapter used only by the Docker
// load-testing sandbox (docker-compose.loadtest.yml). It stores chunks as
// real files on a volume so data survives a container restart during a soak
// run, instead of vanishing like a pure in-memory fake would. It is a plain
// relay-style adapter (no BatchCommitter/DirectUploader), matching the
// GitHub/GitLab posture, so it exercises the sync_worker relay path the same
// way a real platform would.
//
// Reachability is gated at the single call site in cmd/server.go's
// createAdapter (ZCRYPT_ENABLE_MOCK_ADAPTER=true required) — this type has no
// gate of its own, since it must never be reachable in a real deployment
// regardless of who constructs it.
type MockAdapter struct {
	mu      sync.Mutex
	baseDir string
}

// NewMockAdapter creates a disk-backed mock adapter rooted at MOCK_ADAPTER_DIR
// (default /data/mock-storage). The token is accepted only to match the
// PlatformAdapter constructor shape used by createAdapter's switch; it is
// otherwise unused since there is nothing to authenticate against.
func NewMockAdapter(_ string) (*MockAdapter, error) {
	dir := os.Getenv("MOCK_ADAPTER_DIR")
	if dir == "" {
		dir = defaultMockAdapterDir
	}
	if err := os.MkdirAll(dir, 0o750); err != nil { //nolint:gosec // dir comes from an operator-set env var, not request input
		return nil, fmt.Errorf("mock adapter: create storage dir: %w", err)
	}
	return &MockAdapter{baseDir: dir}, nil
}

// PlatformName returns the name of this platform.
func (m *MockAdapter) PlatformName() string { return "mock" }

// GetUsername matches the GetUsername() convention the other adapters expose
// for cmd/server.go's getAdapterUsername switch.
func (m *MockAdapter) GetUsername() string { return "loadtest" }

// repoDir maps a repo identifier (e.g. "mock://zcrypt-loadtest-abc123") to a
// filesystem-safe directory name under baseDir.
func (m *MockAdapter) repoDir(repo string) string {
	safe := strings.NewReplacer("/", "_", ":", "_").Replace(repo)
	return filepath.Join(m.baseDir, safe)
}

// blobPath resolves the on-disk path for a chunk, rejecting anything that
// could escape baseDir. remotePath is always server-generated (disguise
// package), never user input, but this stays defensive regardless.
func (m *MockAdapter) blobPath(repo, remotePath string) (string, error) {
	if strings.Contains(remotePath, "..") {
		return "", fmt.Errorf("mock adapter: invalid remote path %q", remotePath)
	}
	return filepath.Join(m.repoDir(repo), filepath.Clean(remotePath)), nil
}

// CreateRepo creates a new repository on the platform.
func (m *MockAdapter) CreateRepo(_ context.Context, name string) (string, error) {
	repo := "mock://" + name
	if err := os.MkdirAll(m.repoDir(repo), 0o750); err != nil {
		return "", fmt.Errorf("mock adapter: create repo: %w", err)
	}
	return repo, nil
}

// Upload pushes a chunk to the platform and returns its reference.
func (m *MockAdapter) Upload(_ context.Context, repo string, chunk types.Chunk) (types.ChunkRef, error) {
	remotePath := chunk.Ref.RemotePath
	if remotePath == "" {
		var err error
		remotePath, err = disguise.ShardedChunkFilename()
		if err != nil {
			return types.ChunkRef{}, fmt.Errorf("mock adapter: generate filename: %w", err)
		}
	}

	path, err := m.blobPath(repo, remotePath)
	if err != nil {
		return types.ChunkRef{}, err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return types.ChunkRef{}, fmt.Errorf("mock adapter: mkdir: %w", err)
	}
	// Write to a temp file then rename, so a concurrent Download/ListChunks
	// never observes a partially-written blob.
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, chunk.Data, 0o600); err != nil {
		return types.ChunkRef{}, fmt.Errorf("mock adapter: write: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return types.ChunkRef{}, fmt.Errorf("mock adapter: finalize write: %w", err)
	}

	ref := chunk.Ref
	ref.Platform = "mock"
	ref.Account = "loadtest"
	ref.Repo = repo
	ref.RemotePath = remotePath
	ref.Size = int64(len(chunk.Data))
	return ref, nil
}

// Download fetches a chunk's data from the platform.
func (m *MockAdapter) Download(_ context.Context, ref types.ChunkRef) ([]byte, error) {
	path, err := m.blobPath(ref.Repo, ref.RemotePath)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path) //nolint:gosec // path is confined under baseDir/repoDir by blobPath, which rejects ".."
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("mock adapter: chunk not found: %s", ref.RemotePath)
		}
		return nil, fmt.Errorf("mock adapter: read: %w", err)
	}
	return data, nil
}

// Delete removes a chunk from the platform.
func (m *MockAdapter) Delete(_ context.Context, ref types.ChunkRef) error {
	path, err := m.blobPath(ref.Repo, ref.RemotePath)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("mock adapter: delete: %w", err)
	}
	return nil
}

// GetRepoSize returns the total bytes used in a repository.
func (m *MockAdapter) GetRepoSize(_ context.Context, repo string) (int64, error) {
	var total int64
	err := filepath.WalkDir(m.repoDir(repo), func(path string, d os.DirEntry, err error) error {
		if err != nil {
			if os.IsNotExist(err) {
				return nil
			}
			return err
		}
		if d.IsDir() || strings.HasSuffix(path, ".tmp") {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		total += info.Size()
		return nil
	})
	if err != nil {
		return 0, fmt.Errorf("mock adapter: get repo size: %w", err)
	}
	return total, nil
}

// ListChunks lists all chunk files in a repository.
func (m *MockAdapter) ListChunks(_ context.Context, repo string) ([]types.ChunkRef, error) {
	dir := m.repoDir(repo)
	var out []types.ChunkRef
	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			if os.IsNotExist(err) {
				return nil
			}
			return err
		}
		if d.IsDir() || strings.HasSuffix(path, ".tmp") {
			return nil
		}
		rel, err := filepath.Rel(dir, path)
		if err != nil {
			return err
		}
		data, err := os.ReadFile(path) //nolint:gosec // path comes from WalkDir traversing dir itself, not external input
		if err != nil {
			return err
		}
		sum := sha256.Sum256(data)
		out = append(out, types.ChunkRef{
			Platform:   "mock",
			Account:    "loadtest",
			Repo:       repo,
			RemotePath: rel,
			Size:       int64(len(data)),
			SHA256:     hex.EncodeToString(sum[:]),
		})
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("mock adapter: list chunks: %w", err)
	}
	return out, nil
}
