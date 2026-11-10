//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func (ts *testServer) putThumb(fileID string, body []byte, token string) int {
	ts.t.Helper()
	req, err := http.NewRequest(http.MethodPut, ts.URL+"/api/files/"+fileID+"/thumb", bytes.NewReader(body))
	require.NoError(ts.t, err)
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	resp.Body.Close()
	return resp.StatusCode
}

func TestFileThumbs(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	ownerEmail, otherEmail := uniqueEmail("thumbs-owner"), uniqueEmail("thumbs-other")
	owner := ts.registerAndLogin(ownerEmail, accountTestPassword)
	other := ts.registerAndLogin(otherEmail, accountTestPassword)
	fileID := ts.insertFile(ctx, ts.idOf(ownerEmail), "photo")
	bare := ts.insertFile(ctx, ts.idOf(ownerEmail), "notes")
	sealed := bytes.Repeat([]byte{7}, 4096)

	assert.Equal(t, http.StatusNoContent, ts.putThumb(fileID, sealed, owner))
	assert.Equal(t, http.StatusNotFound, ts.putThumb(fileID, sealed, other), "only the owner can set a preview")
	assert.Equal(t, http.StatusBadRequest, ts.putThumb(fileID, []byte("short"), owner))
	assert.Equal(t, http.StatusRequestEntityTooLarge, ts.putThumb(fileID, make([]byte, 64<<10+1), owner))
	assert.Equal(t, http.StatusBadRequest, ts.putThumb("not-a-uuid", sealed, owner))

	var got struct {
		Thumbs map[string]string `json:"thumbs"`
	}
	resp := ts.send(http.MethodPost, "/api/files/thumbs", map[string]any{"ids": []string{fileID, bare}}, owner)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	decodeJSON(t, resp, &got)
	require.Len(t, got.Thumbs, 1, "files without a preview are left out")
	assert.Equal(t, base64.StdEncoding.EncodeToString(sealed), got.Thumbs[fileID])

	var theirs struct {
		Thumbs map[string]string `json:"thumbs"`
	}
	resp = ts.send(http.MethodPost, "/api/files/thumbs", map[string]any{"ids": []string{fileID}}, other)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	decodeJSON(t, resp, &theirs)
	assert.Len(t, theirs.Thumbs, 0, "another user's preview is never returned")

	assert.Equal(t, http.StatusBadRequest, ts.send(http.MethodPost, "/api/files/thumbs", map[string]any{"ids": []string{}}, owner).StatusCode)
	assert.Equal(t, http.StatusBadRequest, ts.send(http.MethodPost, "/api/files/thumbs", map[string]any{"ids": []string{"x"}}, owner).StatusCode)
	assert.Equal(t, http.StatusUnauthorized, ts.send(http.MethodPost, "/api/files/thumbs", map[string]any{"ids": []string{fileID}}, "").StatusCode)
}
