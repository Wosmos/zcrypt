//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/adapters"
	"github.com/zcrypt/zcrypt/types"
)

type keepAdapter struct {
	adapters.PlatformAdapter
	mu   sync.Mutex
	data map[string][]byte
}

func newKeepAdapter() *keepAdapter { return &keepAdapter{data: map[string][]byte{}} }

func (k *keepAdapter) PlatformName() string { return "mock" }

func (k *keepAdapter) CreateRepo(_ context.Context, name string) (string, error) {
	return "mock-keep/" + name, nil
}

func (k *keepAdapter) Upload(_ context.Context, repo string, c types.Chunk) (types.ChunkRef, error) {
	k.mu.Lock()
	defer k.mu.Unlock()
	ref := c.Ref
	ref.Platform, ref.Account, ref.Repo = "mock", "acct", repo
	k.data[repo+"|"+ref.RemotePath] = append([]byte(nil), c.Data...)
	return ref, nil
}

func (k *keepAdapter) Download(_ context.Context, ref types.ChunkRef) ([]byte, error) {
	k.mu.Lock()
	defer k.mu.Unlock()
	return k.data[ref.Repo+"|"+ref.RemotePath], nil
}

func (ts *testServer) sendInit(size, chunks int, burn bool) (int, string, string) {
	ts.t.Helper()
	resp := ts.POST("/api/send/init", map[string]interface{}{
		"filename":        "note.txt",
		"original_size":   size,
		"sha256":          strings.Repeat("a", 64),
		"salt":            base64.StdEncoding.EncodeToString(make([]byte, 32)),
		"chunk_count":     chunks,
		"burn_after_read": burn,
	}, "")
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var out struct {
		SessionID string `json:"session_id"`
		Token     string `json:"token"`
	}
	_ = json.Unmarshal(raw, &out)
	return resp.StatusCode, out.SessionID, out.Token
}

func (ts *testServer) sendGet(path string) int {
	ts.t.Helper()
	req, err := http.NewRequest(http.MethodGet, ts.URL+path, nil)
	require.NoError(ts.t, err)
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	defer resp.Body.Close()
	return resp.StatusCode
}

func TestBurnAfterReadSendCanBeDownloadedOnce(t *testing.T) {
	ts := setupTestServer(t)
	ts.srv.InjectGlobalTestAdapter("mock:acct", newKeepAdapter())

	payload := make([]byte, 64)
	_, _ = rand.Read(payload)
	sum := sha256.Sum256(payload)

	status, sid, token := ts.sendInit(len(payload), 1, true)
	require.Equal(t, http.StatusOK, status)

	req, err := http.NewRequest(http.MethodPut, ts.URL+"/api/send/"+sid+"/chunk/0", bytes.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("X-Chunk-SHA256", hex.EncodeToString(sum[:]))
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	requireStatus(t, ts.POST("/api/send/"+sid+"/complete", map[string]interface{}{}, ""), http.StatusOK)

	assert.Equal(t, http.StatusOK, ts.sendGet("/api/send/"+token+"/meta"), "the first reader gets the metadata")
	assert.Equal(t, http.StatusOK, ts.sendGet("/api/send/"+token+"/chunks/0"), "and can fetch the chunks after claiming the link")
	assert.Equal(t, http.StatusGone, ts.sendGet("/api/send/"+token+"/meta"), "a second reader is refused")
	assert.Equal(t, http.StatusOK, ts.sendGet("/api/send/"+token+"/chunks/0"), "the first reader can still finish")
}

func TestSendOf45MBIsAccepted(t *testing.T) {
	ts := setupTestServer(t)
	ts.srv.InjectGlobalTestAdapter("mock:acct", newKeepAdapter())

	status, _, _ := ts.sendInit(45*1024*1024, 5, false)
	assert.Equal(t, http.StatusOK, status, "a 45 MB file in 10 MiB chunks is 5 chunks and must be accepted")

	status, _, _ = ts.sendInit(10, 1000, false)
	assert.Equal(t, http.StatusBadRequest, status, "an absurd chunk count is still refused")
}
