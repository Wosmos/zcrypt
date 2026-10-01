//go:build integration

package integration_test

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/zcrypt/zcrypt/adapters"
	"github.com/zcrypt/zcrypt/types"
)

// mockDirectAdapter is a PlatformAdapter that also implements DirectUploader and
// BatchCommitter, mirroring HuggingFace's real capability set: the client
// uploads chunk bytes directly to the platform via a presigned URL (bypassing
// the server relay), and durability is established later by a DB-driven
// commit + re-list verify (commitAndVerify in cmd/commit.go), not by anything
// the server saw pass through Upload.
//
// Because the real client-to-platform PUT never happens in a test, ListChunks
// here reflects what CommitChunks was told is committed (mirroring the real
// contract: an object is trusted present once its commit is confirmed), rather
// than tracking actual bytes. setPhantom lets a test simulate the historical
// HuggingFace bug shape: CommitChunks succeeds but the object never actually
// lands, so ListChunks must omit it.
type mockDirectAdapter struct {
	*mockAdapter

	mu       sync.Mutex
	deadRepo string // GetUploadURL fails with "repository not found" for exactly this repo

	committed map[string]bool // key: blobKey(repo, path); set by CommitChunks
	phantom   map[string]bool // key: blobKey(repo, path); committed but must NOT appear in ListChunks
}

func newMockDirectAdapter() *mockDirectAdapter {
	return &mockDirectAdapter{
		mockAdapter: newMockAdapter(),
		committed:   make(map[string]bool),
		phantom:     make(map[string]bool),
	}
}

// setDeadRepo makes GetUploadURL fail with a "repository not found" error for
// exactly this repo (any other repo, including one created afterward, still
// works), simulating the platform having removed it out from under a session.
func (m *mockDirectAdapter) setDeadRepo(repo string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.deadRepo = repo
}

func (m *mockDirectAdapter) GetUploadURL(ctx context.Context, repo, oid string, size int64) (string, map[string]string, error) {
	m.mu.Lock()
	dead := m.deadRepo
	m.mu.Unlock()
	if repo == dead {
		return "", nil, fmt.Errorf("mock: repository not found")
	}
	return "https://mock.upload.example/" + repo + "/" + oid, map[string]string{}, nil
}

// RegisterUpload is the legacy in-memory-buffer path. It is never actually
// called by production code today (commitAndVerify is DB-driven instead, per
// adapters.BatchCommitter.CommitChunks's doc comment) so this is a no-op that
// only exists to satisfy the DirectUploader interface.
func (m *mockDirectAdapter) RegisterUpload(remotePath, oid string, size int64) {}

// FlushCommits is the legacy in-memory-buffer commit path, superseded by
// CommitChunks. No-op, kept only to satisfy BatchCommitter.
func (m *mockDirectAdapter) FlushCommits(ctx context.Context, repo string) error { return nil }

func (m *mockDirectAdapter) CommitChunks(ctx context.Context, repo string, files []adapters.CommitFile) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, f := range files {
		m.committed[blobKey(repo, f.Path)] = true
	}
	return nil
}

// setPhantom marks a path as "commit succeeds but the object never actually
// lands", so ListChunks omits it even though CommitChunks was called for it.
// Reproduces the historical "HuggingFace chunks marked synced but 404" bug
// shape for commitAndVerify to catch.
func (m *mockDirectAdapter) setPhantom(repo, path string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.phantom[blobKey(repo, path)] = true
}

// ListChunks overrides the embedded mockAdapter's (which tracks real Upload
// calls, never made on the direct-upload path) to instead reflect committed
// state, minus anything marked phantom.
func (m *mockDirectAdapter) ListChunks(ctx context.Context, repo string) ([]types.ChunkRef, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []types.ChunkRef
	prefix := repo + "\x00"
	for key := range m.committed {
		if m.phantom[key] {
			continue
		}
		if !strings.HasPrefix(key, prefix) {
			continue
		}
		out = append(out, types.ChunkRef{
			Platform:   "mock",
			Account:    "testacct",
			Repo:       repo,
			RemotePath: strings.TrimPrefix(key, prefix),
		})
	}
	return out, nil
}
