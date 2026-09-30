//go:build integration

package integration_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func (ts *testServer) publicDo(method, path, ticket string, body []byte) *http.Response {
	ts.t.Helper()
	req, err := http.NewRequest(method, ts.URL+path, bytes.NewReader(body))
	require.NoError(ts.t, err)
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
	if ticket != "" {
		req.Header.Set("X-Download-Ticket", ticket)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	return resp
}

func (ts *testServer) linkTicket(metaPath string) string {
	ts.t.Helper()
	var meta struct {
		Ticket string `json:"download_ticket"`
	}
	require.NoError(ts.t, json.Unmarshal(requireStatus(ts.t, ts.getShared(metaPath, ""), http.StatusOK), &meta))
	require.NotEmpty(ts.t, meta.Ticket)
	return meta.Ticket
}

func (ts *testServer) completeLink(path, ticket string) *http.Response {
	payload, _ := json.Marshal(map[string]string{"ticket": ticket})
	return ts.publicDo("POST", path, "", payload)
}

func TestShareMaxDownloadsCountsOnCompletion(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("share-count@example.com", "SecurePass@123!")
	ts.enableMockStorage("share-count@example.com")
	fileID := ts.uploadReadyFile(owner, "once.bin", 40)

	resp := requireStatus(t, ts.POST("/api/shares", map[string]interface{}{
		"file_id": fileID, "wrapped_cek": b64("cek"), "max_downloads": 1,
	}, owner), http.StatusOK)
	var created struct{ Token string }
	require.NoError(t, json.Unmarshal(resp, &created))
	base := "/api/share/" + created.Token

	var lastTicket string
	t.Run("a single allowed download works end to end", func(t *testing.T) {
		ticket := ts.linkTicket(base + "/meta")
		lastTicket = ticket
		c := ts.publicDo("GET", base+"/chunks/0", ticket, nil)
		assert.Equal(t, http.StatusOK, c.StatusCode)
		c.Body.Close()
		r := ts.completeLink(base+"/complete", ticket)
		requireStatus(t, r, http.StatusOK)
	})

	t.Run("a retried completion does not count twice", func(t *testing.T) {
		requireStatus(t, ts.completeLink(base+"/complete", lastTicket), http.StatusOK)
		var n int
		require.NoError(t, ts.db.Pool().QueryRow(t.Context(),
			`SELECT download_count FROM shares WHERE token = $1`, created.Token).Scan(&n))
		assert.Equal(t, 1, n)
	})

	t.Run("the link is spent afterwards", func(t *testing.T) {
		assert.Equal(t, http.StatusForbidden, ts.getShared(base+"/meta", "").StatusCode)
		assert.Equal(t, http.StatusForbidden, ts.getShared(base+"/chunks/0", "").StatusCode)
	})
}

func TestShareReloadsAndRetriesDoNotBurnTheCount(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("share-retry@example.com", "SecurePass@123!")
	ts.enableMockStorage("share-retry@example.com")
	fileID := ts.uploadReadyFile(owner, "retry.bin", 40)

	resp := requireStatus(t, ts.POST("/api/shares", map[string]interface{}{
		"file_id": fileID, "wrapped_cek": b64("cek"), "max_downloads": 1,
	}, owner), http.StatusOK)
	var created struct{ Token string }
	require.NoError(t, json.Unmarshal(resp, &created))
	base := "/api/share/" + created.Token

	for i := 0; i < 3; i++ {
		ts.linkTicket(base + "/meta")
	}

	ticket := ts.linkTicket(base + "/meta")
	c := ts.publicDo("GET", base+"/chunks/0", ticket, nil)
	assert.Equal(t, http.StatusOK, c.StatusCode)
	c.Body.Close()

	requireStatus(t, ts.completeLink(base+"/complete", ticket), http.StatusOK)

	var counted struct {
		Counted bool `json:"counted"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t, ts.completeLink(base+"/complete", ticket), http.StatusOK), &counted))
	assert.False(t, counted.Counted, "a replayed completion must not count")

	t.Run("a redeemed ticket no longer opens a spent link", func(t *testing.T) {
		c := ts.publicDo("GET", base+"/chunks/0", ticket, nil)
		assert.Equal(t, http.StatusForbidden, c.StatusCode)
		c.Body.Close()
	})

	t.Run("a forged or foreign ticket is rejected", func(t *testing.T) {
		r := ts.completeLink(base+"/complete", "bogus.ticket")
		assert.Equal(t, http.StatusForbidden, r.StatusCode)
		r.Body.Close()
	})
}

func TestShareInFlightDownloadSurvivesRevocation(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("share-revoke@example.com", "SecurePass@123!")
	ts.enableMockStorage("share-revoke@example.com")
	fileID := ts.uploadReadyFile(owner, "revoke.bin", 40)

	resp := requireStatus(t, ts.POST("/api/shares", map[string]interface{}{
		"file_id": fileID, "wrapped_cek": b64("cek"), "max_downloads": 1,
	}, owner), http.StatusOK)
	var created struct{ Token string }
	require.NoError(t, json.Unmarshal(resp, &created))
	base := "/api/share/" + created.Token
	ticket := ts.linkTicket(base + "/meta")

	_, err := ts.db.Pool().Exec(t.Context(), `UPDATE shares SET revoked = TRUE WHERE token = $1`, created.Token)
	require.NoError(t, err)

	c := ts.publicDo("GET", base+"/chunks/0", ticket, nil)
	assert.Equal(t, http.StatusForbidden, c.StatusCode, "revocation still wins over a live ticket")
	c.Body.Close()
}

func TestFolderShareMaxDownloadsCountsOnCompletion(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("fshare-count@example.com", "SecurePass@123!")
	ts.enableMockStorage("fshare-count@example.com")
	f1 := ts.uploadReadyFile(owner, "a.bin", 40)
	f2 := ts.uploadReadyFile(owner, "b.bin", 40)

	body := createFolderShareBody("Capped", []string{f1, f2})
	body["max_downloads"] = 1
	resp := requireStatus(t, ts.POST("/api/folder-shares", body, owner), http.StatusOK)
	var created struct{ Token string }
	require.NoError(t, json.Unmarshal(resp, &created))
	base := "/api/folder-share/" + created.Token + "/files/"

	for i := 0; i < 3; i++ {
		ts.linkTicket(base + f1 + "/meta")
	}

	ticket := ts.linkTicket(base + f1 + "/meta")
	c := ts.publicDo("GET", base+f1+"/chunks/0", ticket, nil)
	assert.Equal(t, http.StatusOK, c.StatusCode)
	c.Body.Close()

	t.Run("a ticket is bound to its file", func(t *testing.T) {
		r := ts.completeLink(base+f2+"/complete", ticket)
		assert.Equal(t, http.StatusForbidden, r.StatusCode)
		r.Body.Close()
	})

	requireStatus(t, ts.completeLink(base+f1+"/complete", ticket), http.StatusOK)
	requireStatus(t, ts.completeLink(base+f1+"/complete", ticket), http.StatusOK)

	var n int
	require.NoError(t, ts.db.Pool().QueryRow(t.Context(),
		`SELECT download_count FROM folder_shares WHERE token = $1`, created.Token).Scan(&n))
	assert.Equal(t, 1, n)

	assert.Equal(t, http.StatusForbidden, ts.getShared(base+f1+"/meta", "").StatusCode)
	assert.Equal(t, http.StatusForbidden, ts.getShared(base+f2+"/meta", "").StatusCode)
}

func (ts *testServer) uploadReadyFileChunks(token, filename string, chunks int) string {
	ts.t.Helper()
	initResp := ts.POST("/api/upload/init", map[string]interface{}{
		"filename":      filename,
		"original_size": 40 * chunks,
		"sha256":        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		"salt":          validSalt,
		"chunk_count":   chunks,
	}, token)
	body := requireStatus(ts.t, initResp, http.StatusOK)
	var init struct {
		SessionID string `json:"session_id"`
		FileID    string `json:"file_id"`
	}
	require.NoError(ts.t, json.Unmarshal(body, &init))
	for i := 0; i < chunks; i++ {
		payload := []byte(fmt.Sprintf("encrypted-chunk-payload-%02d-0123456789ABCDEF", i))
		requireStatus(ts.t, ts.PUT(fmt.Sprintf("/api/upload/%s/chunk/%d", init.SessionID, i), payload, token), http.StatusOK)
	}
	requireStatus(ts.t, ts.POST("/api/upload/"+init.SessionID+"/complete", map[string]interface{}{}, token), http.StatusOK)
	return init.FileID
}

func (ts *testServer) linkCount(table, token string) int {
	ts.t.Helper()
	var n int
	require.NoError(ts.t, ts.db.Pool().QueryRow(ts.t.Context(),
		`SELECT download_count FROM `+table+` WHERE token = $1`, token).Scan(&n))
	return n
}

func TestShareCapIsEnforcedWithoutClientCompletion(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("share-server-count@example.com", "SecurePass@123!")
	ts.enableMockStorage("share-server-count@example.com")
	fileID := ts.uploadReadyFileChunks(owner, "three.bin", 3)

	newLink := func() string {
		resp := requireStatus(t, ts.POST("/api/shares", map[string]interface{}{
			"file_id": fileID, "wrapped_cek": b64("cek"), "max_downloads": 1,
		}, owner), http.StatusOK)
		var created struct{ Token string }
		require.NoError(t, json.Unmarshal(resp, &created))
		return created.Token
	}
	fetchAll := func(base, ticket string) []int {
		var codes []int
		for i := 0; i < 3; i++ {
			c := ts.publicDo("GET", fmt.Sprintf("%s/chunks/%d", base, i), ticket, nil)
			codes = append(codes, c.StatusCode)
			c.Body.Close()
		}
		return codes
	}

	t.Run("a ticket holder who never calls complete still spends the link", func(t *testing.T) {
		token := newLink()
		base := "/api/share/" + token
		ticket := ts.linkTicket(base + "/meta")
		assert.Equal(t, []int{200, 200, 200}, fetchAll(base, ticket))
		assert.Equal(t, 1, ts.linkCount("shares", token))
		assert.Equal(t, http.StatusForbidden, ts.getShared(base+"/meta", "").StatusCode)
		assert.Equal(t, http.StatusForbidden, ts.getShared(base+"/chunks/0", "").StatusCode)
	})

	t.Run("a ticketless client is counted when it fetches the last chunk", func(t *testing.T) {
		token := newLink()
		base := "/api/share/" + token
		assert.Equal(t, []int{200, 200, 200}, fetchAll(base, ""))
		assert.Equal(t, 1, ts.linkCount("shares", token))
		assert.Equal(t, http.StatusForbidden, ts.getShared(base+"/meta", "").StatusCode)
	})

	t.Run("an abandoned download does not burn the link", func(t *testing.T) {
		token := newLink()
		base := "/api/share/" + token
		ticket := ts.linkTicket(base + "/meta")
		for i := 0; i < 2; i++ {
			c := ts.publicDo("GET", fmt.Sprintf("%s/chunks/%d", base, i), ticket, nil)
			assert.Equal(t, http.StatusOK, c.StatusCode)
			c.Body.Close()
		}
		assert.Equal(t, 0, ts.linkCount("shares", token))
		assert.Equal(t, http.StatusOK, ts.getShared(base+"/meta", "").StatusCode)
	})

	t.Run("two tickets racing on a one-download link cannot both finish", func(t *testing.T) {
		token := newLink()
		base := "/api/share/" + token
		a := ts.linkTicket(base + "/meta")
		b := ts.linkTicket(base + "/meta")
		assert.Equal(t, []int{200, 200, 200}, fetchAll(base, a))
		assert.Equal(t, []int{200, 200, 403}, fetchAll(base, b), "the last chunk is withheld once the cap is met")
		assert.Equal(t, 1, ts.linkCount("shares", token))
	})

	t.Run("chunks can arrive in any order", func(t *testing.T) {
		token := newLink()
		base := "/api/share/" + token
		ticket := ts.linkTicket(base + "/meta")
		for _, i := range []int{2, 0, 1} {
			c := ts.publicDo("GET", fmt.Sprintf("%s/chunks/%d", base, i), ticket, nil)
			assert.Equal(t, http.StatusOK, c.StatusCode, "chunk %d", i)
			c.Body.Close()
		}
		assert.Equal(t, 1, ts.linkCount("shares", token))
	})
}

func TestFolderShareCapIsEnforcedWithoutClientCompletion(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("fshare-server-count@example.com", "SecurePass@123!")
	ts.enableMockStorage("fshare-server-count@example.com")
	f1 := ts.uploadReadyFileChunks(owner, "a3.bin", 3)

	body := createFolderShareBody("Capped", []string{f1})
	body["max_downloads"] = 1
	resp := requireStatus(t, ts.POST("/api/folder-shares", body, owner), http.StatusOK)
	var created struct{ Token string }
	require.NoError(t, json.Unmarshal(resp, &created))
	base := "/api/folder-share/" + created.Token + "/files/" + f1

	ticket := ts.linkTicket(base + "/meta")
	for i := 0; i < 3; i++ {
		c := ts.publicDo("GET", fmt.Sprintf("%s/chunks/%d", base, i), ticket, nil)
		assert.Equal(t, http.StatusOK, c.StatusCode)
		c.Body.Close()
	}
	assert.Equal(t, 1, ts.linkCount("folder_shares", created.Token))
	assert.Equal(t, http.StatusForbidden, ts.getShared(base+"/meta", "").StatusCode)
}
