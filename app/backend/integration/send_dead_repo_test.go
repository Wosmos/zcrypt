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
	"errors"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/adapters"
	"github.com/zcrypt/zcrypt/types"
)

type deadRepoAdapter struct {
	adapters.PlatformAdapter
	deadRepo string
	mu       sync.Mutex
	uploaded []string
}

func (d *deadRepoAdapter) PlatformName() string { return "mock" }

func (d *deadRepoAdapter) CreateRepo(_ context.Context, name string) (string, error) {
	return "mock-fresh/" + name, nil
}

func (d *deadRepoAdapter) Upload(_ context.Context, repo string, c types.Chunk) (types.ChunkRef, error) {
	if repo == d.deadRepo {
		return types.ChunkRef{}, errors.New("lfs upload: lfs batch returned 404: Repository not found")
	}
	d.mu.Lock()
	d.uploaded = append(d.uploaded, repo)
	d.mu.Unlock()
	ref := c.Ref
	ref.Platform, ref.Account, ref.Repo = "mock", "acct", repo
	return ref, nil
}

func TestSendUploadSurvivesADeletedStoredRepo(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()

	dead := "mock-gone/send-repo"
	adapter := &deadRepoAdapter{deadRepo: dead}
	ts.srv.InjectGlobalTestAdapter("mock:acct", adapter)
	require.NoError(t, ts.db.SetSystemSetting(ctx, "send_repo_mock", dead))

	payload := make([]byte, 64)
	_, _ = rand.Read(payload)
	sum := sha256.Sum256(payload)

	initResp := ts.POST("/api/send/init", map[string]interface{}{
		"filename":      "note.txt",
		"original_size": len(payload),
		"sha256":        strings.Repeat("a", 64),
		"salt":          base64.StdEncoding.EncodeToString(make([]byte, 32)),
		"chunk_count":   1,
	}, "")
	var init struct {
		SessionID string `json:"session_id"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t, initResp, http.StatusOK), &init))

	req, err := http.NewRequest(http.MethodPut, ts.URL+"/api/send/"+init.SessionID+"/chunk/0", bytes.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("X-Chunk-SHA256", hex.EncodeToString(sum[:]))
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	adapter.mu.Lock()
	defer adapter.mu.Unlock()
	require.Len(t, adapter.uploaded, 1)
	assert.NotEqual(t, dead, adapter.uploaded[0], "the chunk must land in a fresh repo, not the deleted one")
	stored, err := ts.db.GetSystemSetting(ctx, "send_repo_mock")
	require.NoError(t, err)
	assert.Equal(t, adapter.uploaded[0], stored, "the replacement repo is remembered for the next send")
}
