//go:build integration

package integration_test

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The space key, per-member key grants and per-file wrapped CEKs are all opaque
// to the server (it never decrypts them), so integration tests pass arbitrary
// base64 blobs for them. The crypto correctness of these envelopes is covered by
// the frontend unit tests (__tests__/lib/keys-spaces.test.ts); here we assert the
// server's authorization + storage behavior around them.
func b64(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }

// createSpace creates a shared vault owned by the caller and returns its id.
func (ts *testServer) createSpace(token, name string, sizeLimit int64) string {
	ts.t.Helper()
	resp := ts.POST("/api/shared-vaults", map[string]interface{}{
		"name":              name,
		"description":       "test space",
		"wrapped_space_key": b64("space-key-sealed-to-owner"),
		"size_limit_bytes":  sizeLimit,
	}, token)
	body := requireStatus(ts.t, resp, http.StatusCreated)
	var v struct {
		ID string `json:"id"`
	}
	require.NoError(ts.t, json.Unmarshal(body, &v))
	require.NotEmpty(ts.t, v.ID)
	return v.ID
}

// uploadReadyFile runs the full init → chunk → complete cycle and returns the
// file id. The caller must have mock storage enabled. size is the file's
// declared original size (metadata only; the chunk body is a fixed 40 bytes).
func (ts *testServer) uploadReadyFile(token, filename string, size int64) string {
	ts.t.Helper()
	initResp := ts.POST("/api/upload/init", map[string]interface{}{
		"filename":      filename,
		"original_size": size,
		"sha256":        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		"salt":          validSalt,
		"chunk_count":   1,
	}, token)
	body := requireStatus(ts.t, initResp, http.StatusOK)
	var init struct {
		SessionID string `json:"session_id"`
		FileID    string `json:"file_id"`
	}
	require.NoError(ts.t, json.Unmarshal(body, &init))

	chunkResp := ts.PUT("/api/upload/"+init.SessionID+"/chunk/0",
		[]byte("encrypted-chunk-payload-0123456789ABCDEF"), token)
	requireStatus(ts.t, chunkResp, http.StatusOK)

	completeResp := ts.POST("/api/upload/"+init.SessionID+"/complete", map[string]interface{}{}, token)
	requireStatus(ts.t, completeResp, http.StatusOK)
	return init.FileID
}

func TestSharedVaultLifecycle(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("space-owner@example.com", "SecurePass@123!")

	t.Run("create returns the vault with the owner as its admin member", func(t *testing.T) {
		id := ts.createSpace(owner, "Design Docs", 0)

		resp := ts.GET("/api/shared-vaults/"+id, owner)
		body := requireStatus(t, resp, http.StatusOK)
		var detail struct {
			OwnerID string `json:"owner_id"`
			Role    string `json:"role"`
			Members []struct {
				Role string `json:"role"`
			} `json:"members"`
			Files []interface{} `json:"files"`
		}
		require.NoError(t, json.Unmarshal(body, &detail))
		assert.Equal(t, "admin", detail.Role, "creator's own role is admin")
		require.Len(t, detail.Members, 1, "the only member is the owner")
		assert.Equal(t, "admin", detail.Members[0].Role)
		assert.Empty(t, detail.Files, "a new space has no shared files")
	})

	t.Run("list includes the caller's own sealed space-key grant", func(t *testing.T) {
		ts.createSpace(owner, "Listable", 0)
		resp := ts.GET("/api/shared-vaults", owner)
		body := requireStatus(t, resp, http.StatusOK)
		var vaults []struct {
			WrappedSpaceKey string `json:"wrapped_space_key"`
			Role            string `json:"role"`
		}
		require.NoError(t, json.Unmarshal(body, &vaults))
		require.NotEmpty(t, vaults)
		assert.NotEmpty(t, vaults[0].WrappedSpaceKey, "each listed space carries the caller's key grant")
	})

	t.Run("owner can delete their space", func(t *testing.T) {
		id := ts.createSpace(owner, "Disposable", 0)
		requireStatus(t, ts.DELETE("/api/shared-vaults/"+id, owner), http.StatusOK)
		// A member GET on the deleted vault is now a 404 (no membership row).
		resp := ts.GET("/api/shared-vaults/"+id, owner)
		assert.Equal(t, http.StatusNotFound, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("a non-member cannot read a space they don't belong to", func(t *testing.T) {
		id := ts.createSpace(owner, "Private", 0)
		stranger := ts.registerAndLogin("space-stranger@example.com", "SecurePass@123!")
		resp := ts.GET("/api/shared-vaults/"+id, stranger)
		assert.Equal(t, http.StatusNotFound, resp.StatusCode, "non-members get an indistinguishable 404")
		resp.Body.Close()
	})

	t.Run("a non-owner cannot delete someone else's space", func(t *testing.T) {
		id := ts.createSpace(owner, "Owner Only", 0)
		other := ts.registerAndLogin("space-other-deleter@example.com", "SecurePass@123!")
		resp := ts.DELETE("/api/shared-vaults/"+id, other)
		assert.Equal(t, http.StatusForbidden, resp.StatusCode)
		resp.Body.Close()
		getResp := ts.GET("/api/shared-vaults/"+id, owner)
		assert.Equal(t, http.StatusOK, getResp.StatusCode, "owner's space survives a non-owner delete")
		getResp.Body.Close()
	})

	t.Run("create with an empty name is rejected", func(t *testing.T) {
		resp := ts.POST("/api/shared-vaults", map[string]interface{}{"name": ""}, owner)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
		resp.Body.Close()
	})
}

func TestSharedVaultMembership(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("mem-owner@example.com", "SecurePass@123!")
	member := ts.registerAndLogin("mem-invitee@example.com", "SecurePass@123!")

	t.Run("owner adds a member by email", func(t *testing.T) {
		id := ts.createSpace(owner, "Team", 0)
		resp := ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
			"email":             "mem-invitee@example.com",
			"role":              "editor",
			"wrapped_space_key": b64("space-key-sealed-to-member"),
		}, owner)
		requireStatus(t, resp, http.StatusCreated)

		// The invited member now sees the space in their own list.
		listResp := ts.GET("/api/shared-vaults", member)
		body := requireStatus(t, listResp, http.StatusOK)
		var vaults []struct {
			ID   string `json:"id"`
			Role string `json:"role"`
		}
		require.NoError(t, json.Unmarshal(body, &vaults))
		found := false
		for _, v := range vaults {
			if v.ID == id {
				found = true
				assert.Equal(t, "editor", v.Role)
			}
		}
		assert.True(t, found, "invited member sees the shared space")
	})

	t.Run("an editor cannot add other members", func(t *testing.T) {
		id := ts.createSpace(owner, "No Escalation", 0)
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
			"email":             "mem-invitee@example.com",
			"role":              "editor",
			"wrapped_space_key": b64("k"),
		}, owner), http.StatusCreated)

		// Register the target so the request fails at the authorization check, not
		// at email lookup.
		_ = ts.registerAndLogin("mem-third@example.com", "SecurePass@123!")
		resp := ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
			"email":             "mem-third@example.com",
			"role":              "viewer",
			"wrapped_space_key": b64("k"),
		}, member)
		assert.Equal(t, http.StatusForbidden, resp.StatusCode, "editors may not add members")
		resp.Body.Close()
	})

	t.Run("an invalid role is rejected", func(t *testing.T) {
		id := ts.createSpace(owner, "Roles", 0)
		resp := ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
			"email":             "mem-invitee@example.com",
			"role":              "superuser",
			"wrapped_space_key": b64("k"),
		}, owner)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("adding a member without an email is rejected", func(t *testing.T) {
		id := ts.createSpace(owner, "NoEmail", 0)
		resp := ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
			"role": "viewer", "wrapped_space_key": b64("k"),
		}, owner)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("the owner cannot be re-added as a lesser-role member (demotion attack)", func(t *testing.T) {
		id := ts.createSpace(owner, "OwnerGuard", 0)
		resp := ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
			"email":             "mem-owner@example.com", // the owner's own email
			"role":              "viewer",
			"wrapped_space_key": b64("k"),
		}, owner)
		// The insert targets no row (owner is excluded), so the handler reports a
		// failure rather than silently demoting the owner.
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
		resp.Body.Close()

		// The owner's role is still admin.
		detailResp := ts.GET("/api/shared-vaults/"+id, owner)
		dbody := requireStatus(t, detailResp, http.StatusOK)
		var d struct {
			Role string `json:"role"`
		}
		require.NoError(t, json.Unmarshal(dbody, &d))
		assert.Equal(t, "admin", d.Role, "owner keeps admin role")
	})

	t.Run("owner removes a member; the member loses the space", func(t *testing.T) {
		id := ts.createSpace(owner, "Removable", 0)
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
			"email": "mem-invitee@example.com", "role": "viewer", "wrapped_space_key": b64("k"),
		}, owner), http.StatusCreated)

		// Resolve the member's user id from the detail view.
		detail := ts.GET("/api/shared-vaults/"+id, owner)
		dbody := requireStatus(t, detail, http.StatusOK)
		var d struct {
			Members []struct {
				UserID string `json:"user_id"`
				Email  string `json:"email"`
			} `json:"members"`
		}
		require.NoError(t, json.Unmarshal(dbody, &d))
		var memberUID string
		for _, m := range d.Members {
			if m.Email == "mem-invitee@example.com" {
				memberUID = m.UserID
			}
		}
		require.NotEmpty(t, memberUID)

		requireStatus(t, ts.DELETE("/api/shared-vaults/"+id+"/members/"+memberUID, owner), http.StatusOK)
		// The removed member no longer sees the space.
		resp := ts.GET("/api/shared-vaults/"+id, member)
		assert.Equal(t, http.StatusNotFound, resp.StatusCode, "removed member loses access")
		resp.Body.Close()
	})

	t.Run("an editor cannot remove members", func(t *testing.T) {
		id := ts.createSpace(owner, "RemoveGuard", 0)
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
			"email": "mem-invitee@example.com", "role": "editor", "wrapped_space_key": b64("k"),
		}, owner), http.StatusCreated)
		detail := ts.GET("/api/shared-vaults/"+id, owner)
		dbody := requireStatus(t, detail, http.StatusOK)
		var d struct {
			Members []struct {
				UserID string `json:"user_id"`
				Email  string `json:"email"`
			} `json:"members"`
		}
		require.NoError(t, json.Unmarshal(dbody, &d))
		var memberUID string
		for _, m := range d.Members {
			if m.Email == "mem-owner@example.com" {
				memberUID = m.UserID
			}
		}
		require.NotEmpty(t, memberUID)

		resp := ts.DELETE("/api/shared-vaults/"+id+"/members/"+memberUID, member)
		assert.Equal(t, http.StatusForbidden, resp.StatusCode)
		resp.Body.Close()
	})
}

func TestSharedVaultFiles(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("file-owner@example.com", "SecurePass@123!")
	ts.enableMockStorage("file-owner@example.com")
	editor := ts.registerAndLogin("file-editor@example.com", "SecurePass@123!")
	ts.enableMockStorage("file-editor@example.com") // the editor uploads their own files in some cases

	t.Run("owner shares a file they own into the space", func(t *testing.T) {
		id := ts.createSpace(owner, "Files", 0)
		fileID := ts.uploadReadyFile(owner, "report.pdf", 40)

		resp := ts.POST("/api/shared-vaults/"+id+"/files", map[string]interface{}{
			"file_id":     fileID,
			"wrapped_cek": b64("cek-wrapped-under-space-key"),
		}, owner)
		requireStatus(t, resp, http.StatusCreated)

		// The file now appears in the space detail with its opaque wrapped CEK.
		detailResp := ts.GET("/api/shared-vaults/"+id, owner)
		dbody := requireStatus(t, detailResp, http.StatusOK)
		var d struct {
			Files []struct {
				FileID     string `json:"file_id"`
				WrappedCEK string `json:"wrapped_cek"`
				Name       string `json:"name"`
				Size       int64  `json:"size"`
			} `json:"files"`
		}
		require.NoError(t, json.Unmarshal(dbody, &d))
		require.Len(t, d.Files, 1)
		assert.Equal(t, fileID, d.Files[0].FileID)
		assert.Equal(t, b64("cek-wrapped-under-space-key"), d.Files[0].WrappedCEK)
		assert.Equal(t, "report.pdf", d.Files[0].Name)
		assert.Equal(t, int64(40), d.Files[0].Size)
	})

	t.Run("a member cannot share a file they do not own", func(t *testing.T) {
		id := ts.createSpace(owner, "OwnershipCheck", 0)
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
			"email": "file-editor@example.com", "role": "editor", "wrapped_space_key": b64("k"),
		}, owner), http.StatusCreated)

		ownerFile := ts.uploadReadyFile(owner, "owned-by-owner.txt", 40)
		// Editor is authorized on the space but does NOT own the file.
		resp := ts.POST("/api/shared-vaults/"+id+"/files", map[string]interface{}{
			"file_id": ownerFile, "wrapped_cek": b64("x"),
		}, editor)
		assert.Equal(t, http.StatusNotFound, resp.StatusCode, "you can only share files you can decrypt")
		resp.Body.Close()
	})

	t.Run("a viewer cannot add files", func(t *testing.T) {
		id := ts.createSpace(owner, "ViewerReadOnly", 0)
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
			"email": "file-editor@example.com", "role": "viewer", "wrapped_space_key": b64("k"),
		}, owner), http.StatusCreated)
		fileID := ts.uploadReadyFile(editor, "editors-file.txt", 40) // editor owns it, but is a viewer here
		resp := ts.POST("/api/shared-vaults/"+id+"/files", map[string]interface{}{
			"file_id": fileID, "wrapped_cek": b64("x"),
		}, editor)
		assert.Equal(t, http.StatusForbidden, resp.StatusCode, "viewers are read-only")
		resp.Body.Close()
	})

	t.Run("a non-member cannot add files", func(t *testing.T) {
		id := ts.createSpace(owner, "NonMemberBlocked", 0)
		fileID := ts.uploadReadyFile(editor, "outsiders-file.txt", 40)
		resp := ts.POST("/api/shared-vaults/"+id+"/files", map[string]interface{}{
			"file_id": fileID, "wrapped_cek": b64("x"),
		}, editor)
		assert.Equal(t, http.StatusForbidden, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("missing file_id or wrapped_cek is rejected", func(t *testing.T) {
		id := ts.createSpace(owner, "Validation", 0)
		resp := ts.POST("/api/shared-vaults/"+id+"/files", map[string]interface{}{
			"file_id": "", "wrapped_cek": "",
		}, owner)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("a file exceeding the space size limit is rejected", func(t *testing.T) {
		id := ts.createSpace(owner, "Capped", 20) // 20-byte limit
		fileID := ts.uploadReadyFile(owner, "too-big.bin", 40)
		resp := ts.POST("/api/shared-vaults/"+id+"/files", map[string]interface{}{
			"file_id": fileID, "wrapped_cek": b64("x"),
		}, owner)
		assert.Equal(t, http.StatusRequestEntityTooLarge, resp.StatusCode, "size cap enforced")
		resp.Body.Close()
	})

	t.Run("a file within the size limit is accepted", func(t *testing.T) {
		id := ts.createSpace(owner, "Roomy", 100)
		fileID := ts.uploadReadyFile(owner, "fits.bin", 40)
		resp := ts.POST("/api/shared-vaults/"+id+"/files", map[string]interface{}{
			"file_id": fileID, "wrapped_cek": b64("x"),
		}, owner)
		assert.Equal(t, http.StatusCreated, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("removing a shared file drops it from the space", func(t *testing.T) {
		id := ts.createSpace(owner, "Unshare", 0)
		fileID := ts.uploadReadyFile(owner, "temp.txt", 40)
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/files", map[string]interface{}{
			"file_id": fileID, "wrapped_cek": b64("x"),
		}, owner), http.StatusCreated)

		requireStatus(t, ts.DELETE("/api/shared-vaults/"+id+"/files/"+fileID, owner), http.StatusOK)

		detailResp := ts.GET("/api/shared-vaults/"+id, owner)
		dbody := requireStatus(t, detailResp, http.StatusOK)
		var d struct {
			Files []interface{} `json:"files"`
		}
		require.NoError(t, json.Unmarshal(dbody, &d))
		assert.Empty(t, d.Files, "unshared file is gone")
	})
}

// TestSharedVaultCrossUserRead is the crux of the whole feature: a member who is
// NOT the file's owner must be able to read a shared file (metadata + chunks)
// using the space-wrapped CEK, while non-members must not, without ever
// loosening the owner-scoped chunk/token routing.
func TestSharedVaultCrossUserRead(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("read-owner@example.com", "SecurePass@123!")
	ts.enableMockStorage("read-owner@example.com")
	member := ts.registerAndLogin("read-member@example.com", "SecurePass@123!")
	stranger := ts.registerAndLogin("read-stranger@example.com", "SecurePass@123!")

	// Owner uploads a file, creates a space, invites the member, and shares the
	// file with a distinct space-wrapped CEK.
	fileID := ts.uploadReadyFile(owner, "shared.bin", 40)
	spaceID := ts.createSpace(owner, "ReadSpace", 0)
	requireStatus(t, ts.POST("/api/shared-vaults/"+spaceID+"/members", map[string]interface{}{
		"email": "read-member@example.com", "role": "viewer", "wrapped_space_key": b64("member-grant"),
	}, owner), http.StatusCreated)
	const spaceCEK = "the-space-wrapped-cek"
	requireStatus(t, ts.POST("/api/shared-vaults/"+spaceID+"/files", map[string]interface{}{
		"file_id": fileID, "wrapped_cek": b64(spaceCEK),
	}, owner), http.StatusCreated)

	t.Run("member gets file metadata with the SPACE-wrapped CEK", func(t *testing.T) {
		resp := ts.GET("/api/files/"+fileID+"/meta", member)
		body := requireStatus(t, resp, http.StatusOK)
		var meta struct {
			ID         string `json:"id"`
			WrappedCEK string `json:"wrapped_cek"`
		}
		require.NoError(t, json.Unmarshal(body, &meta))
		assert.Equal(t, fileID, meta.ID)
		assert.Equal(t, b64(spaceCEK), meta.WrappedCEK,
			"member receives the space-wrapped CEK, not the owner's vault-wrapped one")
	})

	t.Run("member can download a chunk (routed through the owner's storage)", func(t *testing.T) {
		resp := ts.GET("/api/files/"+fileID+"/chunks/0", member)
		body := requireStatus(t, resp, http.StatusOK)
		assert.Equal(t, "encrypted-chunk-payload-0123456789ABCDEF", string(body),
			"member reads the owner's staged chunk bytes verbatim")
	})

	t.Run("a non-member cannot read the file's metadata (IDOR)", func(t *testing.T) {
		resp := ts.GET("/api/files/"+fileID+"/meta", stranger)
		assert.Equal(t, http.StatusNotFound, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("a non-member cannot download a chunk", func(t *testing.T) {
		resp := ts.GET("/api/files/"+fileID+"/chunks/0", stranger)
		assert.Equal(t, http.StatusNotFound, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("unsharing the file revokes the member's read access", func(t *testing.T) {
		requireStatus(t, ts.DELETE("/api/shared-vaults/"+spaceID+"/files/"+fileID, owner), http.StatusOK)
		resp := ts.GET("/api/files/"+fileID+"/meta", member)
		assert.Equal(t, http.StatusNotFound, resp.StatusCode, "grant is gone once the file is unshared")
		resp.Body.Close()

		// Sanity: the owner can still read their own file.
		ownerResp := ts.GET("/api/files/"+fileID+"/meta", owner)
		assert.Equal(t, http.StatusOK, ownerResp.StatusCode)
		ownerResp.Body.Close()
	})
}

func TestSharedVaultRotation(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("rot-owner@example.com", "SecurePass@123!")
	member := ts.registerAndLogin("rot-member@example.com", "SecurePass@123!")

	// helper: current member user ids for a space
	memberIDs := func(token, spaceID string) []string {
		resp := ts.GET("/api/shared-vaults/"+spaceID, token)
		body := requireStatus(t, resp, http.StatusOK)
		var d struct {
			Members []struct {
				UserID string `json:"user_id"`
			} `json:"members"`
		}
		require.NoError(t, json.Unmarshal(body, &d))
		ids := make([]string, 0, len(d.Members))
		for _, m := range d.Members {
			ids = append(ids, m.UserID)
		}
		return ids
	}

	t.Run("owner rotates with a grant for every current member", func(t *testing.T) {
		id := ts.createSpace(owner, "RotateOK", 0)
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
			"email": "rot-member@example.com", "role": "editor", "wrapped_space_key": b64("old"),
		}, owner), http.StatusCreated)

		grants := []map[string]string{}
		for _, uid := range memberIDs(owner, id) {
			grants = append(grants, map[string]string{"user_id": uid, "wrapped_space_key": b64("new-" + uid)})
		}
		resp := ts.POST("/api/shared-vaults/"+id+"/rotate", map[string]interface{}{
			"members": grants,
			"files":   []interface{}{},
		}, owner)
		requireStatus(t, resp, http.StatusOK)
	})

	t.Run("rotation that omits a current member is rejected (anti-lockout)", func(t *testing.T) {
		requireStatus(t, ts.POST("/api/keys", publishKeyBody(), member), http.StatusOK)
		id := ts.createSpace(owner, "RotatePartial", 0)
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
			"email": "rot-member@example.com", "role": "editor", "wrapped_space_key": b64("old"),
		}, owner), http.StatusCreated)

		// Supply a grant for ONLY the owner, deliberately omitting the member, this
		// would re-wrap files under a key the member never receives, locking them out.
		ownerID := memberIDs(owner, id)[0] // first is the owner (joined first)
		resp := ts.POST("/api/shared-vaults/"+id+"/rotate", map[string]interface{}{
			"members": []map[string]string{{"user_id": ownerID, "wrapped_space_key": b64("new")}},
			"files":   []interface{}{},
		}, owner)
		assert.Equal(t, http.StatusConflict, resp.StatusCode,
			"the server refuses a partial re-key that would strand a member")
		resp.Body.Close()
	})

	t.Run("an editor cannot rotate the space key", func(t *testing.T) {
		id := ts.createSpace(owner, "RotateGuard", 0)
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
			"email": "rot-member@example.com", "role": "editor", "wrapped_space_key": b64("old"),
		}, owner), http.StatusCreated)

		resp := ts.POST("/api/shared-vaults/"+id+"/rotate", map[string]interface{}{
			"members": []map[string]string{}, "files": []interface{}{},
		}, member)
		assert.Equal(t, http.StatusForbidden, resp.StatusCode)
		resp.Body.Close()
	})
}

type spaceMember struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
}

func (ts *testServer) spaceMembers(token, id string) []spaceMember {
	ts.t.Helper()
	body := requireStatus(ts.t, ts.GET("/api/shared-vaults/"+id, token), http.StatusOK)
	var d struct {
		Members []spaceMember `json:"members"`
	}
	require.NoError(ts.t, json.Unmarshal(body, &d))
	return d.Members
}

func (ts *testServer) memberByEmail(token, id, email string) spaceMember {
	ts.t.Helper()
	for _, m := range ts.spaceMembers(token, id) {
		if m.Email == email {
			return m
		}
	}
	ts.t.Fatalf("member %s not found in space %s", email, id)
	return spaceMember{}
}

func (ts *testServer) invite(token, id, email, role string) *http.Response {
	ts.t.Helper()
	return ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
		"email": email, "role": role, "wrapped_space_key": b64("k-" + email),
	}, token)
}

func TestSharedVaultRoleParity(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("rp-owner@example.com", "SecurePass@123!")
	admin := ts.registerAndLogin("rp-admin@example.com", "SecurePass@123!")
	admin2 := ts.registerAndLogin("rp-admin2@example.com", "SecurePass@123!")
	editor := ts.registerAndLogin("rp-editor@example.com", "SecurePass@123!")
	viewer := ts.registerAndLogin("rp-viewer@example.com", "SecurePass@123!")
	_ = ts.registerAndLogin("rp-newbie@example.com", "SecurePass@123!")
	_ = admin2

	newSpace := func(name string) string {
		id := ts.createSpace(owner, name, 0)
		requireStatus(t, ts.invite(owner, id, "rp-admin@example.com", "admin"), http.StatusCreated)
		requireStatus(t, ts.invite(owner, id, "rp-admin2@example.com", "admin"), http.StatusCreated)
		requireStatus(t, ts.invite(owner, id, "rp-editor@example.com", "editor"), http.StatusCreated)
		requireStatus(t, ts.invite(owner, id, "rp-viewer@example.com", "viewer"), http.StatusCreated)
		return id
	}
	status := func(resp *http.Response) int {
		defer resp.Body.Close()
		return resp.StatusCode
	}

	t.Run("an admin can invite viewers and editors but not admins", func(t *testing.T) {
		id := newSpace("AdminInvites")
		assert.Equal(t, http.StatusCreated, status(ts.invite(admin, id, "rp-newbie@example.com", "viewer")))
		assert.Equal(t, http.StatusCreated, status(ts.invite(admin, id, "rp-newbie@example.com", "editor")))
		assert.Equal(t, http.StatusForbidden, status(ts.invite(admin, id, "rp-newbie@example.com", "admin")))
	})

	t.Run("an admin cannot demote an admin by re-inviting them", func(t *testing.T) {
		id := newSpace("NoReinviteDemote")
		assert.Equal(t, http.StatusForbidden, status(ts.invite(admin, id, "rp-admin2@example.com", "viewer")))
		assert.Equal(t, "admin", ts.memberByEmail(owner, id, "rp-admin2@example.com").Role)
	})

	t.Run("editors and viewers cannot invite", func(t *testing.T) {
		id := newSpace("NoInvite")
		assert.Equal(t, http.StatusForbidden, status(ts.invite(editor, id, "rp-newbie@example.com", "viewer")))
		assert.Equal(t, http.StatusForbidden, status(ts.invite(viewer, id, "rp-newbie@example.com", "viewer")))
	})

	t.Run("editors and viewers cannot remove members", func(t *testing.T) {
		id := newSpace("NoRemove")
		target := ts.memberByEmail(owner, id, "rp-viewer@example.com")
		assert.Equal(t, http.StatusForbidden, status(ts.DELETE("/api/shared-vaults/"+id+"/members/"+target.UserID, editor)))
		other := ts.memberByEmail(owner, id, "rp-editor@example.com")
		assert.Equal(t, http.StatusForbidden, status(ts.DELETE("/api/shared-vaults/"+id+"/members/"+other.UserID, viewer)))
	})

	t.Run("an admin can remove an editor but not an admin or the owner", func(t *testing.T) {
		id := newSpace("AdminRemoves")
		editorM := ts.memberByEmail(owner, id, "rp-editor@example.com")
		admin2M := ts.memberByEmail(owner, id, "rp-admin2@example.com")
		ownerM := ts.memberByEmail(owner, id, "rp-owner@example.com")
		assert.Equal(t, http.StatusForbidden, status(ts.DELETE("/api/shared-vaults/"+id+"/members/"+admin2M.UserID, admin)))
		assert.Equal(t, http.StatusForbidden, status(ts.DELETE("/api/shared-vaults/"+id+"/members/"+ownerM.UserID, admin)))
		assert.Equal(t, http.StatusOK, status(ts.DELETE("/api/shared-vaults/"+id+"/members/"+editorM.UserID, admin)))
	})

	t.Run("the owner can never be removed, even by themselves", func(t *testing.T) {
		id := newSpace("OwnerStays")
		ownerM := ts.memberByEmail(owner, id, "rp-owner@example.com")
		assert.Equal(t, http.StatusNotFound, status(ts.DELETE("/api/shared-vaults/"+id+"/members/"+ownerM.UserID, owner)))
	})

	t.Run("a member can leave a space on their own", func(t *testing.T) {
		id := newSpace("Leave")
		v := ts.memberByEmail(owner, id, "rp-viewer@example.com")
		assert.Equal(t, http.StatusOK, status(ts.DELETE("/api/shared-vaults/"+id+"/members/"+v.UserID, viewer)))
		assert.Equal(t, http.StatusNotFound, status(ts.GET("/api/shared-vaults/"+id, viewer)))
	})

	t.Run("role changes: admin manages editors and viewers, only owner manages admins", func(t *testing.T) {
		id := newSpace("Roles")
		editorM := ts.memberByEmail(owner, id, "rp-editor@example.com")
		viewerM := ts.memberByEmail(owner, id, "rp-viewer@example.com")
		admin2M := ts.memberByEmail(owner, id, "rp-admin2@example.com")
		path := func(uid string) string { return "/api/shared-vaults/" + id + "/members/" + uid }

		assert.Equal(t, http.StatusForbidden, status(ts.patchJSON(path(viewerM.UserID), map[string]string{"role": "editor"}, editor)))
		assert.Equal(t, http.StatusForbidden, status(ts.patchJSON(path(editorM.UserID), map[string]string{"role": "viewer"}, viewer)))

		assert.Equal(t, http.StatusOK, status(ts.patchJSON(path(viewerM.UserID), map[string]string{"role": "editor"}, admin)))
		assert.Equal(t, "editor", ts.memberByEmail(owner, id, "rp-viewer@example.com").Role)
		assert.Equal(t, http.StatusForbidden, status(ts.patchJSON(path(viewerM.UserID), map[string]string{"role": "admin"}, admin)))
		assert.Equal(t, http.StatusForbidden, status(ts.patchJSON(path(admin2M.UserID), map[string]string{"role": "viewer"}, admin)))
		assert.Equal(t, http.StatusBadRequest, status(ts.patchJSON(path(viewerM.UserID), map[string]string{"role": "root"}, owner)))

		assert.Equal(t, http.StatusOK, status(ts.patchJSON(path(editorM.UserID), map[string]string{"role": "admin"}, owner)))
		assert.Equal(t, http.StatusOK, status(ts.patchJSON(path(admin2M.UserID), map[string]string{"role": "viewer"}, owner)))
	})

	t.Run("the owner's role cannot be changed", func(t *testing.T) {
		id := newSpace("OwnerRole")
		ownerM := ts.memberByEmail(owner, id, "rp-owner@example.com")
		assert.Equal(t, http.StatusNotFound, status(ts.patchJSON("/api/shared-vaults/"+id+"/members/"+ownerM.UserID, map[string]string{"role": "viewer"}, owner)))
	})

	t.Run("rename: owner and admin yes, editor and viewer no", func(t *testing.T) {
		id := newSpace("Rename")
		path := "/api/shared-vaults/" + id
		assert.Equal(t, http.StatusForbidden, status(ts.patchJSON(path, map[string]string{"name": "x"}, editor)))
		assert.Equal(t, http.StatusForbidden, status(ts.patchJSON(path, map[string]string{"name": "x"}, viewer)))
		assert.Equal(t, http.StatusBadRequest, status(ts.patchJSON(path, map[string]string{"name": "  "}, admin)))
		assert.Equal(t, http.StatusOK, status(ts.patchJSON(path, map[string]string{"name": "Renamed"}, admin)))
		body := requireStatus(t, ts.GET(path, owner), http.StatusOK)
		var d struct {
			Name        string `json:"name"`
			Description string `json:"description"`
		}
		require.NoError(t, json.Unmarshal(body, &d))
		assert.Equal(t, "Renamed", d.Name)
		assert.Equal(t, "test space", d.Description, "untouched fields are kept")
		assert.Equal(t, http.StatusOK, status(ts.patchJSON(path, map[string]string{"name": "Again"}, owner)))
	})

	t.Run("only the owner can delete the space", func(t *testing.T) {
		id := newSpace("DeleteGuard")
		for _, tok := range []string{admin, editor, viewer} {
			assert.Equal(t, http.StatusForbidden, status(ts.DELETE("/api/shared-vaults/"+id, tok)))
		}
		assert.Equal(t, http.StatusOK, status(ts.GET("/api/shared-vaults/"+id, owner)))
		assert.Equal(t, http.StatusOK, status(ts.DELETE("/api/shared-vaults/"+id, owner)))
	})

	t.Run("only the owner can rotate the key; admins and editors cannot", func(t *testing.T) {
		id := newSpace("RotateRoles")
		grants := []map[string]string{}
		for _, m := range ts.spaceMembers(owner, id) {
			grants = append(grants, map[string]string{"user_id": m.UserID, "wrapped_space_key": b64("n-" + m.UserID)})
		}
		body := map[string]interface{}{"members": grants, "files": []interface{}{}}
		assert.Equal(t, http.StatusForbidden, status(ts.POST("/api/shared-vaults/"+id+"/rotate", body, editor)))
		assert.Equal(t, http.StatusForbidden, status(ts.POST("/api/shared-vaults/"+id+"/rotate", body, admin)))
		assert.Equal(t, http.StatusOK, status(ts.POST("/api/shared-vaults/"+id+"/rotate", body, owner)))
	})

	t.Run("editors can add and remove files, viewers cannot remove them", func(t *testing.T) {
		ts.enableMockStorage("rp-editor@example.com")
		id := newSpace("FileRoles")
		f := ts.uploadReadyFile(editor, "e.txt", 40)
		assert.Equal(t, http.StatusCreated, status(ts.POST("/api/shared-vaults/"+id+"/files", map[string]interface{}{"file_id": f, "wrapped_cek": b64("x")}, editor)))
		assert.Equal(t, http.StatusForbidden, status(ts.DELETE("/api/shared-vaults/"+id+"/files/"+f, viewer)))
		assert.Equal(t, http.StatusOK, status(ts.DELETE("/api/shared-vaults/"+id+"/files/"+f, editor)))
	})
}

func TestSharedVaultRevocation(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("rv-owner@example.com", "SecurePass@123!")
	ts.enableMockStorage("rv-owner@example.com")
	member := ts.registerAndLogin("rv-member@example.com", "SecurePass@123!")
	keyless := ts.registerAndLogin("rv-keyless@example.com", "SecurePass@123!")
	_ = keyless
	requireStatus(t, ts.POST("/api/keys", publishKeyBody(), owner), http.StatusOK)
	requireStatus(t, ts.POST("/api/keys", publishKeyBody(), member), http.StatusOK)

	detail := func(id string) (needs bool, members []spaceMember) {
		body := requireStatus(t, ts.GET("/api/shared-vaults/"+id, owner), http.StatusOK)
		var d struct {
			NeedsRotation bool          `json:"needs_rotation"`
			Members       []spaceMember `json:"members"`
		}
		require.NoError(t, json.Unmarshal(body, &d))
		return d.NeedsRotation, d.Members
	}
	rotateBody := func(id string, omit string) map[string]interface{} {
		_, ms := detail(id)
		grants := []map[string]string{}
		for _, m := range ms {
			if m.UserID == omit {
				continue
			}
			grants = append(grants, map[string]string{"user_id": m.UserID, "wrapped_space_key": b64("n-" + m.UserID)})
		}
		return map[string]interface{}{"members": grants, "files": []map[string]string{}}
	}

	t.Run("removal blocks the member immediately and flags the space for rotation", func(t *testing.T) {
		fileID := ts.uploadReadyFile(owner, "secret.bin", 40)
		id := ts.createSpace(owner, "Revoke", 0)
		requireStatus(t, ts.invite(owner, id, "rv-member@example.com", "viewer"), http.StatusCreated)
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/files", map[string]interface{}{"file_id": fileID, "wrapped_cek": b64("c")}, owner), http.StatusCreated)
		resp := ts.GET("/api/files/"+fileID+"/chunks/0", member)
		require.Equal(t, http.StatusOK, resp.StatusCode)
		resp.Body.Close()

		m := ts.memberByEmail(owner, id, "rv-member@example.com")
		requireStatus(t, ts.DELETE("/api/shared-vaults/"+id+"/members/"+m.UserID, owner), http.StatusOK)

		for _, path := range []string{"/api/shared-vaults/" + id, "/api/files/" + fileID + "/meta", "/api/files/" + fileID + "/chunks/0"} {
			r := ts.GET(path, member)
			assert.Equal(t, http.StatusNotFound, r.StatusCode, path)
			r.Body.Close()
		}
		r := ts.GET("/api/shared-vaults", member)
		lb := requireStatus(t, r, http.StatusOK)
		assert.NotContains(t, string(lb), id)

		needs, _ := detail(id)
		assert.True(t, needs, "space is flagged until the key is rotated")
	})

	t.Run("new files are refused until an admin rotates, then writes resume", func(t *testing.T) {
		id := ts.createSpace(owner, "RotateGate", 0)
		requireStatus(t, ts.invite(owner, id, "rv-member@example.com", "editor"), http.StatusCreated)
		m := ts.memberByEmail(owner, id, "rv-member@example.com")
		requireStatus(t, ts.DELETE("/api/shared-vaults/"+id+"/members/"+m.UserID, owner), http.StatusOK)

		f := ts.uploadReadyFile(owner, "after.bin", 40)
		resp := ts.POST("/api/shared-vaults/"+id+"/files", map[string]interface{}{"file_id": f, "wrapped_cek": b64("c")}, owner)
		assert.Equal(t, http.StatusConflict, resp.StatusCode)
		resp.Body.Close()

		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/rotate", rotateBody(id, ""), owner), http.StatusOK)
		needs, _ := detail(id)
		assert.False(t, needs, "rotation clears the flag")
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/files", map[string]interface{}{"file_id": f, "wrapped_cek": b64("c")}, owner), http.StatusCreated)
	})

	t.Run("rotation must re-wrap every shared file", func(t *testing.T) {
		id := ts.createSpace(owner, "RotateFiles", 0)
		f := ts.uploadReadyFile(owner, "w.bin", 40)
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/files", map[string]interface{}{"file_id": f, "wrapped_cek": b64("c")}, owner), http.StatusCreated)
		resp := ts.POST("/api/shared-vaults/"+id+"/rotate", rotateBody(id, ""), owner)
		assert.Equal(t, http.StatusConflict, resp.StatusCode, "omitting a file would strand it on the old key")
		resp.Body.Close()

		body := rotateBody(id, "")
		body["files"] = []map[string]string{{"file_id": f, "wrapped_cek": b64("new"), "wrapped_name": ""}}
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/rotate", body, owner), http.StatusOK)
	})

	t.Run("a member without a published key may be omitted and loses their grant", func(t *testing.T) {
		id := ts.createSpace(owner, "RotateKeyless", 0)
		requireStatus(t, ts.invite(owner, id, "rv-keyless@example.com", "viewer"), http.StatusCreated)
		k := ts.memberByEmail(owner, id, "rv-keyless@example.com")
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/rotate", rotateBody(id, k.UserID), owner), http.StatusOK)

		body := requireStatus(t, ts.GET("/api/shared-vaults/"+id, keyless), http.StatusOK)
		var d struct {
			WrappedSpaceKey string `json:"wrapped_space_key"`
		}
		require.NoError(t, json.Unmarshal(body, &d))
		assert.Empty(t, d.WrappedSpaceKey, "the keyless member is not handed the new key")
	})

	t.Run("list carries card stats", func(t *testing.T) {
		id := ts.createSpace(owner, "Stats", 0)
		requireStatus(t, ts.invite(owner, id, "rv-member@example.com", "viewer"), http.StatusCreated)
		f := ts.uploadReadyFile(owner, "s.bin", 40)
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/files", map[string]interface{}{"file_id": f, "wrapped_cek": b64("c")}, owner), http.StatusCreated)
		body := requireStatus(t, ts.GET("/api/shared-vaults", owner), http.StatusOK)
		var vs []struct {
			ID            string `json:"id"`
			MemberCount   int    `json:"member_count"`
			FileCount     int    `json:"file_count"`
			UsedBytes     int64  `json:"used_bytes"`
			MemberPreview []struct {
				Username string `json:"username"`
			} `json:"member_preview"`
		}
		require.NoError(t, json.Unmarshal(body, &vs))
		for _, v := range vs {
			if v.ID == id {
				assert.Equal(t, 2, v.MemberCount)
				assert.Equal(t, 1, v.FileCount)
				assert.Equal(t, int64(40), v.UsedBytes)
				assert.Len(t, v.MemberPreview, 2)
				return
			}
		}
		t.Fatal("space missing from list")
	})
}
