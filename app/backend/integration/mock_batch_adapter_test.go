//go:build integration

package integration_test

import (
	"context"
	"strings"
	"sync"

	"github.com/zcrypt/zcrypt/adapters"
	"github.com/zcrypt/zcrypt/types"
)

// mockBatchAdapter is a relay-style PlatformAdapter (chunks flow through Upload,
// like GitHub/GitLab) that ALSO implements BatchCommitter, so it can drive
// commitAndVerify's commit+re-list-verify logic in isolation from any
// presigned-URL mechanics. Real platforms don't combine relay+batch this way,
// but commitAndVerify only cares about the BatchCommitter type assertion, so
// this is a faithful, minimal way to test it directly.
type mockBatchAdapter struct {
	*mockAdapter

	mu        sync.Mutex
	committed map[string]bool // key: blobKey(repo, path); set by CommitChunks
	phantom   map[string]bool // key: blobKey(repo, path); committed but must NOT appear in ListChunks
}

func newMockBatchAdapter() *mockBatchAdapter {
	return &mockBatchAdapter{
		mockAdapter: newMockAdapter(),
		committed:   make(map[string]bool),
		phantom:     make(map[string]bool),
	}
}

func (m *mockBatchAdapter) FlushCommits(ctx context.Context, repo string) error { return nil }

func (m *mockBatchAdapter) CommitChunks(ctx context.Context, repo string, files []adapters.CommitFile) error {
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
func (m *mockBatchAdapter) setPhantom(repo, path string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.phantom[blobKey(repo, path)] = true
}

// ListChunks overrides the embedded mockAdapter's (which tracks real Upload
// calls) to instead reflect committed state, minus anything marked phantom —
// this is what makes commitAndVerify's re-list check meaningful to test.
func (m *mockBatchAdapter) ListChunks(ctx context.Context, repo string) ([]types.ChunkRef, error) {
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
