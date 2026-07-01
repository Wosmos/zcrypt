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
		// DeleteSharedVault is scoped by owner_id, so this matches no rows and is a
		// harmless no-op. The guarantee: the space still exists for the real owner.
		ts.DELETE("/api/shared-vaults/"+id, other).Body.Close()
		resp := ts.GET("/api/shared-vaults/"+id, owner)
		assert.Equal(t, http.StatusOK, resp.StatusCode, "owner's space survives a non-owner delete")
		resp.Body.Close()
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

	t.Run("a non-owner member cannot add other members", func(t *testing.T) {
		id := ts.createSpace(owner, "No Escalation", 0)
		// Add `member` as an admin — even admin is not owner.
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
			"email":             "mem-invitee@example.com",
			"role":              "admin",
			"wrapped_space_key": b64("k"),
		}, owner), http.StatusCreated)

		// Register the target so the request fails at the authorization check, not
		// at email lookup.
		_ = ts.registerAndLogin("mem-third@example.com", "SecurePass@123!")
		resp := ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
			"email":             "mem-third@example.com",
			"role":              "viewer",
			"wrapped_space_key": b64("k"),
		}, member) // member is only an admin, not the owner
		assert.Equal(t, http.StatusForbidden, resp.StatusCode, "only the owner may add members")
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

	t.Run("a non-owner cannot remove members", func(t *testing.T) {
		id := ts.createSpace(owner, "RemoveGuard", 0)
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
			"email": "mem-invitee@example.com", "role": "admin", "wrapped_space_key": b64("k"),
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
			if m.Email == "mem-invitee@example.com" {
				memberUID = m.UserID
			}
		}
		require.NotEmpty(t, memberUID)

		resp := ts.DELETE("/api/shared-vaults/"+id+"/members/"+memberUID, member) // member=admin, not owner
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
// using the space-wrapped CEK, while non-members must not — without ever
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
		id := ts.createSpace(owner, "RotatePartial", 0)
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
			"email": "rot-member@example.com", "role": "editor", "wrapped_space_key": b64("old"),
		}, owner), http.StatusCreated)

		// Supply a grant for ONLY the owner, deliberately omitting the member — this
		// would re-wrap files under a key the member never receives, locking them out.
		ownerID := memberIDs(owner, id)[0] // first is the owner (joined first)
		resp := ts.POST("/api/shared-vaults/"+id+"/rotate", map[string]interface{}{
			"members": []map[string]string{{"user_id": ownerID, "wrapped_space_key": b64("new")}},
			"files":   []interface{}{},
		}, owner)
		assert.Equal(t, http.StatusInternalServerError, resp.StatusCode,
			"the server refuses a partial re-key that would strand a member")
		resp.Body.Close()
	})

	t.Run("a non-owner cannot rotate the space key", func(t *testing.T) {
		id := ts.createSpace(owner, "RotateGuard", 0)
		requireStatus(t, ts.POST("/api/shared-vaults/"+id+"/members", map[string]interface{}{
			"email": "rot-member@example.com", "role": "admin", "wrapped_space_key": b64("old"),
		}, owner), http.StatusCreated)

		resp := ts.POST("/api/shared-vaults/"+id+"/rotate", map[string]interface{}{
			"members": []map[string]string{}, "files": []interface{}{},
		}, member) // admin, not owner
		assert.Equal(t, http.StatusForbidden, resp.StatusCode)
		resp.Body.Close()
	})
}
