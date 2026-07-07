//go:build integration

package integration_test

import (
	"context"
	"fmt"
	"sync"

	"github.com/zcrypt/zcrypt/types"
)

// mockAdapter is an in-memory PlatformAdapter for integration tests. Unlike a
// pure no-op, it keeps a blob store keyed by repo+remote_path so a test can
// ASSERT that a chunk actually landed on — and later left — the "platform".
// Upload records the blob, Delete removes it, and ListChunks enumerates a repo,
// which is exactly what the purge round-trip and the reconciliation sweep need
// to verify. It is safe for concurrent use so the background workers can drive
// it too, though tests generally drive it synchronously.
type mockAdapter struct {
	mu          sync.Mutex
	blobs       map[string]types.ChunkRef // key: blobKey(repo, remotePath)
	deleteCalls int
	failDeletes bool // when true, Delete returns an error (exercise the retry lane)
}

func newMockAdapter() *mockAdapter {
	return &mockAdapter{blobs: make(map[string]types.ChunkRef)}
}

func blobKey(repo, remotePath string) string { return repo + "\x00" + remotePath }

func (m *mockAdapter) PlatformName() string { return "mock" }

func (m *mockAdapter) CreateRepo(ctx context.Context, name string) (string, error) {
	return "mock://" + name, nil
}

func (m *mockAdapter) Upload(ctx context.Context, repo string, chunk types.Chunk) (types.ChunkRef, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ref := types.ChunkRef{
		Platform:   "mock",
		Account:    "testacct",
		Repo:       repo,
		RemotePath: chunk.Ref.RemotePath,
		Size:       chunk.Ref.Size,
		SHA256:     chunk.Ref.SHA256,
	}
	m.blobs[blobKey(repo, chunk.Ref.RemotePath)] = ref
	return ref, nil
}

func (m *mockAdapter) Download(ctx context.Context, ref types.ChunkRef) ([]byte, error) {
	return nil, nil
}

func (m *mockAdapter) Delete(ctx context.Context, ref types.ChunkRef) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.deleteCalls++
	if m.failDeletes {
		return fmt.Errorf("mock: simulated delete failure")
	}
	delete(m.blobs, blobKey(ref.Repo, ref.RemotePath))
	return nil
}

func (m *mockAdapter) GetRepoSize(ctx context.Context, repo string) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var total int64
	for _, b := range m.blobs {
		if b.Repo == repo {
			total += b.Size
		}
	}
	return total, nil
}

func (m *mockAdapter) ListChunks(ctx context.Context, repo string) ([]types.ChunkRef, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []types.ChunkRef
	for _, b := range m.blobs {
		if b.Repo == repo {
			out = append(out, b)
		}
	}
	return out, nil
}

// blobCount returns how many blobs are currently "stored on the platform".
func (m *mockAdapter) blobCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.blobs)
}

// deleteCount returns how many times Delete has been invoked.
func (m *mockAdapter) deleteCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.deleteCalls
}

// setFailDeletes toggles simulated delete failures so a test can exercise the
// retry lane, then flip the platform back to healthy.
func (m *mockAdapter) setFailDeletes(v bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.failDeletes = v
}

// seedOrphan plants a blob on the "platform" that no DB row references, simulating
// a historical orphan (e.g. a pre-fix crash-window leak) so the reconciliation
// sweep has something to find.
func (m *mockAdapter) seedOrphan(repo, remotePath string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.blobs[blobKey(repo, remotePath)] = types.ChunkRef{
		Platform:   "mock",
		Account:    "testacct",
		Repo:       repo,
		RemotePath: remotePath,
	}
}
