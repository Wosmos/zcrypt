//go:build integration

package cmd

import (
	"context"
	"fmt"
	"net/http"
	"sync"

	"github.com/zcrypt/zcrypt/adapters"
	"github.com/zcrypt/zcrypt/types"
)

// POST /api/dev/mock-storage gives the caller an in-memory storage platform, and
// POST /api/dev/mock-global-storage backs anonymous /send the same way, so the
// Playwright e2e suite can drive real uploads and downloads. They exist only
// in a binary built with `-tags=integration` and only when DEV_MODE=true.
func init() {
	testRoutes = append(testRoutes, func(s *Server, mux *http.ServeMux) {
		if !s.devMode {
			return
		}
		mux.HandleFunc("POST /api/dev/mock-storage", s.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
			s.InjectTestAdapter(GetUserID(r), "mock", "e2e", newMemAdapter(), 10<<30)
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		}))
		mux.HandleFunc("POST /api/dev/mock-global-storage", s.AuthMiddleware(func(w http.ResponseWriter, _ *http.Request) {
			s.globalAdapterMu.Lock()
			if len(s.globalAdapterCache) == 0 {
				s.globalAdapterCache = map[string]adapters.PlatformAdapter{"mock:e2e-global": newMemAdapter()}
			}
			s.globalAdapterMu.Unlock()
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		}))
	})
}

type memAdapter struct {
	mu   sync.Mutex
	data map[string][]byte
}

func newMemAdapter() *memAdapter { return &memAdapter{data: make(map[string][]byte)} }

func (m *memAdapter) PlatformName() string { return "mock" }

func (m *memAdapter) CreateRepo(_ context.Context, name string) (string, error) {
	return "mock://" + name, nil
}

func (m *memAdapter) Upload(_ context.Context, repo string, chunk types.Chunk) (types.ChunkRef, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ref := chunk.Ref
	ref.Platform, ref.Account, ref.Repo = "mock", "e2e", repo
	m.data[repo+"\x00"+ref.RemotePath] = append([]byte(nil), chunk.Data...)
	return ref, nil
}

func (m *memAdapter) Download(_ context.Context, ref types.ChunkRef) ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	b, ok := m.data[ref.Repo+"\x00"+ref.RemotePath]
	if !ok {
		return nil, fmt.Errorf("mock: %s not found", ref.RemotePath)
	}
	return b, nil
}

func (m *memAdapter) Delete(_ context.Context, ref types.ChunkRef) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.data, ref.Repo+"\x00"+ref.RemotePath)
	return nil
}

func (m *memAdapter) GetRepoSize(_ context.Context, repo string) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var n int64
	for k, v := range m.data {
		if len(k) > len(repo) && k[:len(repo)+1] == repo+"\x00" {
			n += int64(len(v))
		}
	}
	return n, nil
}

func (m *memAdapter) ListChunks(_ context.Context, repo string) ([]types.ChunkRef, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var refs []types.ChunkRef
	for k, v := range m.data {
		if len(k) > len(repo) && k[:len(repo)+1] == repo+"\x00" {
			refs = append(refs, types.ChunkRef{Platform: "mock", Repo: repo, RemotePath: k[len(repo)+1:], Size: int64(len(v))})
		}
	}
	return refs, nil
}
