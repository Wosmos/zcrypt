//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/png"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func (ts *testServer) putJSON(path string, body interface{}, token string) *http.Response {
	ts.t.Helper()
	data, err := json.Marshal(body)
	require.NoError(ts.t, err)
	req, err := http.NewRequest(http.MethodPut, ts.URL+path, bytes.NewReader(data))
	require.NoError(ts.t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	return resp
}

func wrappedMK(fill byte) string {
	return base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{fill}, 60))
}

func TestMasterKeyStorage(t *testing.T) {
	ts := setupTestServer(t)
	ts.registerAndLogin("mk-admin@example.com", "SecurePass@123!")
	user := ts.registerAndLogin("mk-user@example.com", "SecurePass@123!")

	t.Run("404 before a keypair exists", func(t *testing.T) {
		requireStatus(t, ts.putJSON("/api/keys/master", map[string]string{"wrapped_master_key": wrappedMK(1)}, user), http.StatusNotFound)
	})

	requireStatus(t, ts.POST("/api/keys", publishKeyBody(), user), http.StatusOK)

	t.Run("validation", func(t *testing.T) {
		for _, v := range []string{"", "not base64!!", base64.StdEncoding.EncodeToString(make([]byte, 59)), base64.StdEncoding.EncodeToString(make([]byte, 201))} {
			requireStatus(t, ts.putJSON("/api/keys/master", map[string]string{"wrapped_master_key": v}, user), http.StatusBadRequest)
		}
	})

	t.Run("set once, second write is 409 and value unchanged", func(t *testing.T) {
		first := wrappedMK(1)
		requireStatus(t, ts.putJSON("/api/keys/master", map[string]string{"wrapped_master_key": first}, user), http.StatusOK)
		body := requireStatus(t, ts.putJSON("/api/keys/master", map[string]string{"wrapped_master_key": wrappedMK(2)}, user), http.StatusConflict)
		var r struct {
			Stored bool   `json:"stored"`
			Error  string `json:"error"`
		}
		require.NoError(t, json.Unmarshal(body, &r))
		assert.False(t, r.Stored)
		assert.Equal(t, "master key already set", r.Error)

		var me struct {
			WrappedMasterKey string `json:"wrapped_master_key"`
			MasterKeyWrites  bool   `json:"master_key_writes"`
		}
		decodeJSON(t, ts.GET("/api/keys/me", user), &me)
		assert.Equal(t, first, me.WrappedMasterKey)
		assert.False(t, me.MasterKeyWrites)
	})

	t.Run("republishing the keypair keeps the master key", func(t *testing.T) {
		requireStatus(t, ts.POST("/api/keys", publishKeyBody(), user), http.StatusOK)
		var me struct {
			WrappedMasterKey string `json:"wrapped_master_key"`
		}
		decodeJSON(t, ts.GET("/api/keys/me", user), &me)
		assert.Equal(t, wrappedMK(1), me.WrappedMasterKey)
	})

	t.Run("admin toggle", func(t *testing.T) {
		ts.makeAdmin(context.Background(), "mk-admin@example.com")
		adminTok := ts.loginToken("mk-admin@example.com", "SecurePass@123!")
		requireStatus(t, ts.putJSON("/api/admin/settings/master-key-writes", map[string]bool{"enabled": true}, user), http.StatusForbidden)
		requireStatus(t, ts.putJSON("/api/admin/settings/master-key-writes", map[string]bool{"enabled": true}, adminTok), http.StatusOK)
		var me struct {
			MasterKeyWrites bool `json:"master_key_writes"`
		}
		decodeJSON(t, ts.GET("/api/keys/me", user), &me)
		assert.True(t, me.MasterKeyWrites)
	})
}

func pngDataURI(t *testing.T) (uri string, raw []byte) {
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 4, 4))))
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes()), buf.Bytes()
}

func TestAvatarByURL(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("av-owner@example.com", "SecurePass@123!")
	mate := ts.registerAndLogin("av-mate@example.com", "SecurePass@123!")
	stranger := ts.registerAndLogin("av-stranger@example.com", "SecurePass@123!")
	ownerID := ts.userID(owner)

	t.Run("404 without an avatar", func(t *testing.T) {
		requireStatus(t, ts.GET("/api/users/"+ownerID+"/avatar", owner), http.StatusNotFound)
	})

	uri, raw := pngDataURI(t)
	requireStatus(t, ts.PATCH("/api/auth/profile", map[string]string{"display_name": "Owner", "avatar_url": uri}, owner), http.StatusOK)

	var me struct {
		AvatarURL     string `json:"avatar_url"`
		HasAvatar     bool   `json:"has_avatar"`
		AvatarVersion string `json:"avatar_version"`
	}
	decodeJSON(t, ts.GET("/api/auth/me", owner), &me)
	assert.Equal(t, uri, me.AvatarURL)
	assert.True(t, me.HasAvatar)
	assert.Len(t, me.AvatarVersion, 16)

	t.Run("owner fetches own avatar with caching headers and 304", func(t *testing.T) {
		resp := ts.GET("/api/users/"+ownerID+"/avatar", owner)
		body := requireStatus(t, resp, http.StatusOK)
		assert.Equal(t, raw, body)
		assert.Equal(t, "image/png", resp.Header.Get("Content-Type"))
		assert.Equal(t, "private, max-age=3600", resp.Header.Get("Cache-Control"))
		assert.Equal(t, "nosniff", resp.Header.Get("X-Content-Type-Options"))
		assert.Equal(t, "default-src 'none'", resp.Header.Get("Content-Security-Policy"))
		etag := resp.Header.Get("ETag")
		assert.Equal(t, `"`+me.AvatarVersion+`"`, etag)

		req, _ := http.NewRequest("GET", ts.URL+"/api/users/"+ownerID+"/avatar", nil)
		req.Header.Set("Authorization", "Bearer "+owner)
		req.Header.Set("If-None-Match", etag)
		req.Header.Set("X-Forwarded-For", uniqueTestIP())
		r2, err := http.DefaultClient.Do(req)
		require.NoError(t, err)
		r2.Body.Close()
		assert.Equal(t, http.StatusNotModified, r2.StatusCode)
	})

	t.Run("stranger gets 404", func(t *testing.T) {
		requireStatus(t, ts.GET("/api/users/"+ownerID+"/avatar", stranger), http.StatusNotFound)
		requireStatus(t, ts.GET("/api/users/not-a-uuid/avatar", stranger), http.StatusNotFound)
	})

	t.Run("space mate can fetch and sees avatar fields on members", func(t *testing.T) {
		id := ts.createSpace(owner, "Avatars", 0)
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
			"email": "av-mate@example.com", "role": "viewer", "wrapped_space_key": b64("k"),
		}, owner), http.StatusCreated)
		body := requireStatus(t, ts.GET("/api/users/"+ownerID+"/avatar", mate), http.StatusOK)
		assert.Equal(t, raw, body)

		var detail struct {
			Members []struct {
				UserID        string `json:"user_id"`
				HasAvatar     bool   `json:"has_avatar"`
				AvatarVersion string `json:"avatar_version"`
			} `json:"members"`
		}
		decodeJSON(t, ts.GET("/api/shared-vaults/"+id, mate), &detail)
		require.Len(t, detail.Members, 2)
		for _, m := range detail.Members {
			if m.UserID == ownerID {
				assert.True(t, m.HasAvatar)
				assert.Equal(t, me.AvatarVersion, m.AvatarVersion)
			} else {
				assert.False(t, m.HasAvatar)
				assert.Equal(t, "", m.AvatarVersion)
			}
		}
	})
}
