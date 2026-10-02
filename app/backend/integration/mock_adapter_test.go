//go:build integration

package integration_test

import (
	"context"
	"fmt"
	"sync"

	"github.com/zcrypt/zcrypt/adapters"
	"github.com/zcrypt/zcrypt/types"
)

// mockAdapter is an in-memory PlatformAdapter for integration tests. Unlike a
// pure no-op, it keeps a blob store keyed by repo+remote_path so a test can
// ASSERT that a chunk actually landed on (and later left) the "platform".
// Upload records the blob, Delete removes it, and ListChunks enumerates a repo,
// which is exactly what the purge round-trip and the reconciliation sweep need
// to verify. It is safe for concurrent use so the background workers can drive
// it too, though tests generally drive it synchronously.
type mockAdapter struct {
	mu              sync.Mutex
	blobs           map[string]types.ChunkRef // key: blobKey(repo, remotePath)
	data            map[string][]byte         // key: blobKey(repo, remotePath); actual ciphertext bytes, for round-trip verification
	deleteCalls     int
	failDeletes     bool // when true, Delete returns an error (exercise the retry lane)
	listChunksCalls int
	failCreateRepo  bool

	// uploadFailMsg, when non-empty, makes Upload fail with this message instead
	// of succeeding. uploadFailCount, if > 0, decrements per failing call and
	// clears uploadFailMsg once it hits zero (simulating a transient failure
	// that then recovers); left at 0 with uploadFailMsg set, the failure is
	// permanent until explicitly cleared.
	uploadFailMsg   string
	uploadFailCount int

	// uploadEntered/uploadGate let a test synchronize with an in-flight Upload:
	// Upload signals uploadEntered (non-blocking) the instant it's called, then
	// blocks on uploadGate until the test closes it. Both nil is the default,
	// fast, non-blocking path.
	uploadEntered chan struct{}
	uploadGate    chan struct{}
}

func newMockAdapter() *mockAdapter {
	return &mockAdapter{blobs: make(map[string]types.ChunkRef), data: make(map[string][]byte)}
}

func blobKey(repo, remotePath string) string { return repo + "\x00" + remotePath }

func (m *mockAdapter) PlatformName() string { return "mock" }

func (m *mockAdapter) CreateRepo(ctx context.Context, name string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failCreateRepo {
		return "", fmt.Errorf("mock: simulated create-repo failure")
	}
	return "mock://" + name, nil
}

// setFailCreateRepo makes every subsequent CreateRepo call fail, simulating the
// platform rejecting new repo creation (e.g. rate-limited, quota exhausted).
func (m *mockAdapter) setFailCreateRepo(v bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.failCreateRepo = v
}

// setFailUploadsTransient makes the next n Upload calls fail with a generic
// transient error, then automatically recover (succeed) from the (n+1)th call
// onward. n<=0 clears any upload failure injection.
func (m *mockAdapter) setFailUploadsTransient(n int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if n <= 0 {
		m.uploadFailMsg = ""
		m.uploadFailCount = 0
		return
	}
	m.uploadFailMsg = "simulated transient upload failure"
	m.uploadFailCount = n
}

// setFailUploadsPermanent makes every subsequent Upload call fail with msg
// until cleared via setFailUploadsTransient(0). Used both for a platform that
// never recovers, and (with msg containing "repository not found") to drive
// isRepoNotFound's self-heal path.
func (m *mockAdapter) setFailUploadsPermanent(msg string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.uploadFailMsg = msg
	m.uploadFailCount = 0
}

// setUploadGate arms Upload to signal entered (non-blocking send) the instant
// it's invoked, then block until gate is closed. Pass nil, nil to disarm.
func (m *mockAdapter) setUploadGate(entered, gate chan struct{}) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.uploadEntered = entered
	m.uploadGate = gate
}

func (m *mockAdapter) Upload(ctx context.Context, repo string, chunk types.Chunk) (types.ChunkRef, error) {
	m.mu.Lock()
	entered, gate := m.uploadEntered, m.uploadGate
	m.mu.Unlock()

	if entered != nil {
		select {
		case entered <- struct{}{}:
		default:
		}
	}
	if gate != nil {
		select {
		case <-gate:
		case <-ctx.Done():
			return types.ChunkRef{}, ctx.Err()
		}
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.uploadFailMsg != "" {
		msg := m.uploadFailMsg
		if m.uploadFailCount > 0 {
			m.uploadFailCount--
			if m.uploadFailCount == 0 {
				m.uploadFailMsg = ""
			}
		}
		return types.ChunkRef{}, fmt.Errorf("mock: %s", msg)
	}

	ref := types.ChunkRef{
		Platform:   "mock",
		Account:    "testacct",
		Repo:       repo,
		RemotePath: chunk.Ref.RemotePath,
		Size:       chunk.Ref.Size,
		SHA256:     chunk.Ref.SHA256,
	}
	key := blobKey(repo, chunk.Ref.RemotePath)
	m.blobs[key] = ref
	m.data[key] = append([]byte(nil), chunk.Data...)
	return ref, nil
}

// blobPaths returns the remote paths of every blob currently stored, across all
// repos, for tests that need to locate a randomly-disguised path after the fact.
func (m *mockAdapter) blobPaths() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]string, 0, len(m.blobs))
	for _, b := range m.blobs {
		out = append(out, b.RemotePath)
	}
	return out
}

func (m *mockAdapter) Download(ctx context.Context, ref types.ChunkRef) ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	data, ok := m.data[blobKey(ref.Repo, ref.RemotePath)]
	if !ok {
		return nil, fmt.Errorf("mock: chunk not found at %s: %w", ref.RemotePath, adapters.ErrNotFound)
	}
	return data, nil
}

func (m *mockAdapter) Delete(ctx context.Context, ref types.ChunkRef) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.deleteCalls++
	if m.failDeletes {
		return fmt.Errorf("mock: simulated delete failure")
	}
	key := blobKey(ref.Repo, ref.RemotePath)
	delete(m.blobs, key)
	delete(m.data, key)
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
	m.listChunksCalls++
	var out []types.ChunkRef
	for _, b := range m.blobs {
		if b.Repo == repo {
			out = append(out, b)
		}
	}
	return out, nil
}

// listChunksCallCount returns how many times ListChunks has been invoked, so a
// test can prove a code path did (or deliberately did NOT) re-verify the
// platform tree.
func (m *mockAdapter) listChunksCallCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.listChunksCalls
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
