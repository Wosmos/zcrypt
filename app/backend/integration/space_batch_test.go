//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type batchAddResult struct {
	Added    int      `json:"added"`
	Skipped  []string `json:"skipped"`
	Rejected []struct {
		FileID string `json:"file_id"`
		Reason string `json:"reason"`
	} `json:"rejected"`
}

func batchFiles(ids ...string) map[string]interface{} {
	files := make([]map[string]string, 0, len(ids))
	for _, id := range ids {
		files = append(files, map[string]string{"file_id": id, "wrapped_cek": b64("cek-" + id), "wrapped_name": b64("name-" + id)})
	}
	return map[string]interface{}{"files": files}
}

func TestBatchFileMeta(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("bm-owner@example.com", "SecurePass@123!")
	ts.enableMockStorage("bm-owner@example.com")
	other := ts.registerAndLogin("bm-other@example.com", "SecurePass@123!")
	ts.enableMockStorage("bm-other@example.com")

	mine1 := ts.uploadReadyFile(owner, "a.txt", 40)
	mine2 := ts.uploadReadyFile(owner, "b.txt", 40)
	theirs := ts.uploadReadyFile(other, "c.txt", 40)

	type metaResp struct {
		Files []struct {
			ID         string `json:"id"`
			WrappedCEK string `json:"wrapped_cek"`
		} `json:"files"`
	}

	t.Run("returns owned files and omits foreign and unknown ids", func(t *testing.T) {
		body := requireStatus(t, ts.POST("/api/files/meta", map[string]interface{}{
			"ids": []string{mine1, mine2, theirs, uuid.NewString()},
		}, owner), http.StatusOK)
		var got metaResp
		require.NoError(t, json.Unmarshal(body, &got))
		ids := []string{}
		for _, f := range got.Files {
			ids = append(ids, f.ID)
		}
		assert.ElementsMatch(t, []string{mine1, mine2}, ids)
	})

	t.Run("matches the single-file meta shape", func(t *testing.T) {
		single := requireStatus(t, ts.GET("/api/files/"+mine1+"/meta", owner), http.StatusOK)
		var want map[string]interface{}
		require.NoError(t, json.Unmarshal(single, &want))
		body := requireStatus(t, ts.POST("/api/files/meta", map[string]interface{}{"ids": []string{mine1}}, owner), http.StatusOK)
		var got struct {
			Files []map[string]interface{} `json:"files"`
		}
		require.NoError(t, json.Unmarshal(body, &got))
		require.Len(t, got.Files, 1)
		assert.Equal(t, want, got.Files[0])
	})

	t.Run("a space member gets the space-wrapped CEK", func(t *testing.T) {
		space := ts.createSpace(owner, "BatchMetaSpace", 0)
		requireStatus(t, ts.POST("/api/keys", publishKeyBody(), other), http.StatusOK)
		requireStatus(t, ts.POST("/api/shared-vaults/"+space+"/members", map[string]interface{}{
			"email": "bm-other@example.com", "role": "viewer", "wrapped_space_key": b64("k"),
		}, owner), http.StatusCreated)
		requireStatus(t, ts.POST("/api/shared-vaults/"+space+"/files", map[string]interface{}{
			"file_id": mine1, "wrapped_cek": b64("space-cek"),
		}, owner), http.StatusCreated)

		body := requireStatus(t, ts.POST("/api/files/meta", map[string]interface{}{"ids": []string{mine1, mine2}}, other), http.StatusOK)
		var got metaResp
		require.NoError(t, json.Unmarshal(body, &got))
		require.Len(t, got.Files, 1)
		assert.Equal(t, mine1, got.Files[0].ID)
		assert.Equal(t, b64("space-cek"), got.Files[0].WrappedCEK)
	})

	t.Run("rejects empty, oversized and malformed id lists", func(t *testing.T) {
		requireStatus(t, ts.POST("/api/files/meta", map[string]interface{}{"ids": []string{}}, owner), http.StatusBadRequest)
		many := make([]string, 201)
		for i := range many {
			many[i] = uuid.NewString()
		}
		requireStatus(t, ts.POST("/api/files/meta", map[string]interface{}{"ids": many}, owner), http.StatusBadRequest)
		requireStatus(t, ts.POST("/api/files/meta", map[string]interface{}{"ids": []string{"nope"}}, owner), http.StatusBadRequest)
		resp := ts.POST("/api/files/meta", map[string]interface{}{"ids": []string{mine1}}, "")
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		resp.Body.Close()
	})
}

func TestSharedVaultBatchAdd(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("sb-owner@example.com", "SecurePass@123!")
	ts.enableMockStorage("sb-owner@example.com")
	editor := ts.registerAndLogin("sb-editor@example.com", "SecurePass@123!")
	ts.enableMockStorage("sb-editor@example.com")
	viewer := ts.registerAndLogin("sb-viewer@example.com", "SecurePass@123!")

	spaceFileIDs := func(space string) []string {
		body := requireStatus(t, ts.GET("/api/shared-vaults/"+space, owner), http.StatusOK)
		var d struct {
			FileIDs []string `json:"file_ids"`
			Files   []struct {
				FileID string `json:"file_id"`
			} `json:"files"`
		}
		require.NoError(t, json.Unmarshal(body, &d))
		assert.Len(t, d.Files, len(d.FileIDs))
		return d.FileIDs
	}

	f := make([]string, 4)
	for i := range f {
		f[i] = ts.uploadReadyFile(owner, fmt.Sprintf("f%d.txt", i), 40)
	}

	t.Run("one call adds many files and skips duplicates", func(t *testing.T) {
		space := ts.createSpace(owner, "Batch", 0)
		var res batchAddResult
		body := requireStatus(t, ts.POST("/api/shared-vaults/"+space+"/files/batch", batchFiles(f[0], f[1], f[2]), owner), http.StatusCreated)
		require.NoError(t, json.Unmarshal(body, &res))
		assert.Equal(t, 3, res.Added)
		assert.Empty(t, res.Skipped)
		assert.Empty(t, res.Rejected)
		assert.ElementsMatch(t, f[:3], spaceFileIDs(space))

		body = requireStatus(t, ts.POST("/api/shared-vaults/"+space+"/files/batch", batchFiles(f[1], f[2], f[3]), owner), http.StatusCreated)
		res = batchAddResult{}
		require.NoError(t, json.Unmarshal(body, &res))
		assert.Equal(t, 1, res.Added)
		assert.ElementsMatch(t, []string{f[1], f[2]}, res.Skipped)
		assert.ElementsMatch(t, f, spaceFileIDs(space))
	})

	t.Run("a file the caller does not own rejects the whole batch", func(t *testing.T) {
		space := ts.createSpace(owner, "BatchOwnership", 0)
		requireStatus(t, ts.POST("/api/keys", publishKeyBody(), editor), http.StatusOK)
		requireStatus(t, ts.POST("/api/shared-vaults/"+space+"/members", map[string]interface{}{
			"email": "sb-editor@example.com", "role": "editor", "wrapped_space_key": b64("k"),
		}, owner), http.StatusCreated)
		mine := ts.uploadReadyFile(editor, "mine.txt", 40)

		body := requireStatus(t, ts.POST("/api/shared-vaults/"+space+"/files/batch", batchFiles(mine, f[0]), editor), http.StatusForbidden)
		var res batchAddResult
		require.NoError(t, json.Unmarshal(body, &res))
		require.Len(t, res.Rejected, 1)
		assert.Equal(t, f[0], res.Rejected[0].FileID)
		assert.Empty(t, spaceFileIDs(space), "nothing is added when any file is rejected")
	})

	t.Run("viewers and non-members cannot batch add", func(t *testing.T) {
		space := ts.createSpace(owner, "BatchViewer", 0)
		requireStatus(t, ts.POST("/api/keys", publishKeyBody(), viewer), http.StatusOK)
		requireStatus(t, ts.POST("/api/shared-vaults/"+space+"/members", map[string]interface{}{
			"email": "sb-viewer@example.com", "role": "viewer", "wrapped_space_key": b64("k"),
		}, owner), http.StatusCreated)
		requireStatus(t, ts.POST("/api/shared-vaults/"+space+"/files/batch", batchFiles(f[0]), viewer), http.StatusForbidden)
		requireStatus(t, ts.POST("/api/shared-vaults/"+space+"/files/batch", batchFiles(f[0]), editor), http.StatusForbidden)
	})

	t.Run("the space size limit applies to the whole batch", func(t *testing.T) {
		space := ts.createSpace(owner, "BatchQuota", 100)
		requireStatus(t, ts.POST("/api/shared-vaults/"+space+"/files/batch", batchFiles(f[0], f[1], f[2]), owner), http.StatusRequestEntityTooLarge)
		assert.Empty(t, spaceFileIDs(space))
		requireStatus(t, ts.POST("/api/shared-vaults/"+space+"/files/batch", batchFiles(f[0], f[1]), owner), http.StatusCreated)
		requireStatus(t, ts.POST("/api/shared-vaults/"+space+"/files/batch", batchFiles(f[2]), owner), http.StatusRequestEntityTooLarge)
	})
}

func TestSharedVaultBatchPlanLimit(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("sp-owner@example.com", "SecurePass@123!")
	ts.enableMockStorage("sp-owner@example.com")
	cfg := `{"plans":[{"id":"free","name":"Free","max_space_batch_files":2,"features":[]}]}`
	require.NoError(t, ts.db.SetSystemSetting(context.Background(), "plan_configs", cfg))

	f := []string{ts.uploadReadyFile(owner, "a.txt", 40), ts.uploadReadyFile(owner, "b.txt", 40), ts.uploadReadyFile(owner, "c.txt", 40)}
	space := ts.createSpace(owner, "BatchPlan", 0)
	requireStatus(t, ts.POST("/api/shared-vaults/"+space+"/files/batch", batchFiles(f...), owner), http.StatusRequestEntityTooLarge)
	requireStatus(t, ts.POST("/api/shared-vaults/"+space+"/files/batch", batchFiles(f[0], f[1]), owner), http.StatusCreated)

	var q struct {
		Max int `json:"max_space_batch_files"`
	}
	decodeJSON(t, ts.GET("/api/quota", owner), &q)
	assert.Equal(t, 2, q.Max)
}

func TestSharedVaultMemberPublicKey(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("pk-owner@example.com", "SecurePass@123!")
	member := ts.registerAndLogin("pk-member@example.com", "SecurePass@123!")
	body := publishKeyBody()
	requireStatus(t, ts.POST("/api/keys", body, member), http.StatusOK)

	space := ts.createSpace(owner, "PK", 0)
	requireStatus(t, ts.POST("/api/shared-vaults/"+space+"/members", map[string]interface{}{
		"email": "pk-member@example.com", "role": "viewer", "wrapped_space_key": b64("k"),
	}, owner), http.StatusCreated)

	var d struct {
		Members []struct {
			Email       string `json:"email"`
			PublicKey   string `json:"public_key"`
			Fingerprint string `json:"fingerprint"`
		} `json:"members"`
	}
	decodeJSON(t, ts.GET("/api/shared-vaults/"+space, owner), &d)
	found := false
	for _, m := range d.Members {
		if m.Email == "pk-member@example.com" {
			found = true
			assert.Equal(t, body["public_key"], m.PublicKey)
			assert.Equal(t, body["fingerprint"], m.Fingerprint)
		} else {
			assert.Empty(t, m.PublicKey, "a member without a keypair has no public key")
		}
	}
	assert.True(t, found)

	var lookup struct {
		PublicKey string `json:"public_key"`
	}
	decodeJSON(t, ts.GET("/api/keys/lookup?identifier=pk-member@example.com", owner), &lookup)
	assert.Equal(t, body["public_key"], lookup.PublicKey)
}

func TestSessionStoresCoarsenedIP(t *testing.T) {
	ts := setupTestServer(t)
	ts.registerAndLogin("ip-user@example.com", "SecurePass@123!")
	var ip string
	require.NoError(t, ts.db.Pool().QueryRow(context.Background(),
		`SELECT ip FROM refresh_tokens ORDER BY created_at DESC LIMIT 1`).Scan(&ip))
	assert.Regexp(t, `^\d+\.\d+\.\d+\.0$`, ip)
}
