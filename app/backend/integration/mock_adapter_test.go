//go:build integration

package integration_test

import (
	"context"

	"github.com/zcrypt/zcrypt/types"
)

// mockAdapter is an in-memory PlatformAdapter for integration tests. CreateRepo
// hands back a fake URL and every chunk operation is a no-op — which is all the
// upload pipeline needs to exercise the init → chunk → complete → list → delete
// path. Chunks are staged to disk by the handler; the real platform push is the
// job of the background sync worker, which is not started in tests.
type mockAdapter struct{}

func (m *mockAdapter) PlatformName() string { return "mock" }

func (m *mockAdapter) CreateRepo(ctx context.Context, name string) (string, error) {
	return "mock://" + name, nil
}

func (m *mockAdapter) Upload(ctx context.Context, repo string, chunk types.Chunk) (types.ChunkRef, error) {
	return types.ChunkRef{}, nil
}

func (m *mockAdapter) Download(ctx context.Context, ref types.ChunkRef) ([]byte, error) {
	return nil, nil
}

func (m *mockAdapter) Delete(ctx context.Context, ref types.ChunkRef) error { return nil }

func (m *mockAdapter) GetRepoSize(ctx context.Context, repo string) (int64, error) { return 0, nil }

func (m *mockAdapter) ListChunks(ctx context.Context, repo string) ([]types.ChunkRef, error) {
	return nil, nil
}
