//go:build integration

package integration_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// getShared issues an unauthenticated public GET with an optional share password
// header (the public folder-link endpoints take no bearer token).
func (ts *testServer) getShared(path, password string) *http.Response {
	ts.t.Helper()
	req, err := http.NewRequest("GET", ts.URL+path, nil)
	require.NoError(ts.t, err)
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
	if password != "" {
		req.Header.Set("X-Share-Password", password)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	return resp
}

func createFolderShareBody(name string, fileIDs []string) map[string]interface{} {
	files := make([]map[string]string, 0, len(fileIDs))
	for _, id := range fileIDs {
		files = append(files, map[string]string{"file_id": id, "wrapped_cek": b64("cek-under-folder-key-" + id)})
	}
	return map[string]interface{}{"name": name, "files": files}
}

func TestFolderShare(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("fshare-owner@example.com", "SecurePass@123!")
	ts.enableMockStorage("fshare-owner@example.com")
	f1 := ts.uploadReadyFile(owner, "alpha.txt", 40)
	f2 := ts.uploadReadyFile(owner, "beta.txt", 40)

	// A file owned by someone else — must not be shareable by `owner`.
	other := ts.registerAndLogin("fshare-other@example.com", "SecurePass@123!")
	ts.enableMockStorage("fshare-other@example.com")
	foreign := ts.uploadReadyFile(other, "not-yours.txt", 40)

	create := func(token string, body map[string]interface{}) *http.Response {
		return ts.POST("/api/folder-shares", body, token)
	}

	t.Run("creating a link for owned files returns a token", func(t *testing.T) {
		resp := create(owner, createFolderShareBody("My Folder", []string{f1, f2}))
		body := requireStatus(t, resp, http.StatusOK)
		var out struct{ ID, Token string }
		require.NoError(t, json.Unmarshal(body, &out))
		assert.NotEmpty(t, out.ID)
		assert.NotEmpty(t, out.Token)
	})

	t.Run("a link with no files is rejected", func(t *testing.T) {
		resp := create(owner, map[string]interface{}{"name": "empty", "files": []interface{}{}})
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("you cannot include a file you do not own", func(t *testing.T) {
		resp := create(owner, createFolderShareBody("Sneaky", []string{f1, foreign}))
		assert.Equal(t, http.StatusNotFound, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("creating requires authentication", func(t *testing.T) {
		resp := create("", createFolderShareBody("x", []string{f1}))
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("public info lists the files but never the wrapped CEKs; meta reveals the CEK", func(t *testing.T) {
		cbody := requireStatus(t, create(owner, createFolderShareBody("Public", []string{f1, f2})), http.StatusOK)
		var created struct{ Token string }
		require.NoError(t, json.Unmarshal(cbody, &created))

		infoResp := ts.getShared("/api/folder-share/"+created.Token, "")
		ibody := requireStatus(t, infoResp, http.StatusOK)
		var info struct {
			Valid       bool `json:"valid"`
			HasPassword bool `json:"has_password"`
			Files       []struct {
				FileID     string `json:"file_id"`
				Name       string `json:"name"`
				WrappedCEK string `json:"wrapped_cek"`
			} `json:"files"`
		}
		require.NoError(t, json.Unmarshal(ibody, &info))
		assert.True(t, info.Valid)
		assert.False(t, info.HasPassword)
		require.Len(t, info.Files, 2)
		for _, f := range info.Files {
			assert.NotEmpty(t, f.Name, "listing shows the file name")
			assert.Empty(t, f.WrappedCEK, "the listing must NOT leak per-file CEKs")
		}

		// The per-file meta endpoint returns the wrapped CEK we stored.
		metaResp := ts.getShared("/api/folder-share/"+created.Token+"/files/"+f1+"/meta", "")
		mbody := requireStatus(t, metaResp, http.StatusOK)
		var meta struct {
			ID         string `json:"id"`
			WrappedCEK string `json:"wrapped_cek"`
		}
		require.NoError(t, json.Unmarshal(mbody, &meta))
		assert.Equal(t, f1, meta.ID)
		assert.Equal(t, b64("cek-under-folder-key-"+f1), meta.WrappedCEK)
	})

	t.Run("meta for a file not in the link is 404", func(t *testing.T) {
		cbody := requireStatus(t, create(owner, createFolderShareBody("Scoped", []string{f1})), http.StatusOK)
		var created struct{ Token string }
		require.NoError(t, json.Unmarshal(cbody, &created))
		resp := ts.getShared("/api/folder-share/"+created.Token+"/files/"+f2+"/meta", "")
		assert.Equal(t, http.StatusNotFound, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("a nonexistent token is 404", func(t *testing.T) {
		resp := ts.getShared("/api/folder-share/does-not-exist", "")
		assert.Equal(t, http.StatusNotFound, resp.StatusCode)
		resp.Body.Close()
	})
}

func TestFolderSharePasswordAndLimits(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("fshare-pw@example.com", "SecurePass@123!")
	ts.enableMockStorage("fshare-pw@example.com")
	f1 := ts.uploadReadyFile(owner, "secret.txt", 40)

	tokenOf := func(body map[string]interface{}) string {
		resp := requireStatus(t, ts.POST("/api/folder-shares", body, owner), http.StatusOK)
		var out struct{ Token string }
		require.NoError(t, json.Unmarshal(resp, &out))
		return out.Token
	}

	t.Run("password gates the file listing and the per-file meta", func(t *testing.T) {
		body := createFolderShareBody("Protected", []string{f1})
		body["password"] = "hunter2"
		token := tokenOf(body)

		// Without the password: valid + flagged, but no file listing.
		infoResp := ts.getShared("/api/folder-share/"+token, "")
		ibody := requireStatus(t, infoResp, http.StatusOK)
		var info struct {
			Valid       bool          `json:"valid"`
			HasPassword bool          `json:"has_password"`
			Files       []interface{} `json:"files"`
		}
		require.NoError(t, json.Unmarshal(ibody, &info))
		assert.True(t, info.Valid)
		assert.True(t, info.HasPassword)
		assert.Empty(t, info.Files, "the listing is withheld until the password is supplied")

		// Wrong meta password → 401; correct → 200.
		assert.Equal(t, http.StatusUnauthorized,
			ts.getShared("/api/folder-share/"+token+"/files/"+f1+"/meta", "").StatusCode)
		assert.Equal(t, http.StatusOK,
			ts.getShared("/api/folder-share/"+token+"/files/"+f1+"/meta", "hunter2").StatusCode)

		// With the password, the listing is revealed.
		withPw := requireStatus(t, ts.getShared("/api/folder-share/"+token, "hunter2"), http.StatusOK)
		var opened struct {
			Files []interface{} `json:"files"`
		}
		require.NoError(t, json.Unmarshal(withPw, &opened))
		assert.Len(t, opened.Files, 1)
	})

	t.Run("max_downloads caps access across files", func(t *testing.T) {
		body := createFolderShareBody("Capped", []string{f1})
		body["max_downloads"] = 1
		token := tokenOf(body)

		// First meta fetch succeeds and counts as a download; the next is blocked.
		assert.Equal(t, http.StatusOK,
			ts.getShared("/api/folder-share/"+token+"/files/"+f1+"/meta", "").StatusCode)
		assert.Equal(t, http.StatusForbidden,
			ts.getShared("/api/folder-share/"+token+"/files/"+f1+"/meta", "").StatusCode)
	})

	t.Run("revoking a link kills access", func(t *testing.T) {
		token := tokenOf(createFolderShareBody("Revokable", []string{f1}))

		// Find its id via the owner's list, then revoke.
		listResp := requireStatus(t, ts.GET("/api/folder-shares", owner), http.StatusOK)
		var links []struct {
			ID        string `json:"id"`
			Token     string `json:"token"`
			FileCount int    `json:"file_count"`
		}
		require.NoError(t, json.Unmarshal(listResp, &links))
		var id string
		for _, l := range links {
			if l.Token == token {
				id = l.ID
				assert.Equal(t, 1, l.FileCount)
			}
		}
		require.NotEmpty(t, id)

		requireStatus(t, ts.DELETE("/api/folder-shares/"+id, owner), http.StatusOK)

		// Info now reports invalid; meta is forbidden.
		infoResp := requireStatus(t, ts.getShared("/api/folder-share/"+token, ""), http.StatusOK)
		var info struct {
			Valid bool `json:"valid"`
		}
		require.NoError(t, json.Unmarshal(infoResp, &info))
		assert.False(t, info.Valid)
		assert.Equal(t, http.StatusForbidden,
			ts.getShared("/api/folder-share/"+token+"/files/"+f1+"/meta", "").StatusCode)
	})
}
