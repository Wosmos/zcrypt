//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const sealedShareName = "enc1:c2VhbGVkLXVuZGVyLWxpbmsta2V5"

func TestShareCarriesSealedName(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("share-name@example.com", "SecurePass@123!")
	ts.enableMockStorage("share-name@example.com")
	fileID := ts.uploadReadyFile(owner, "report.pdf", 40)

	createShare := func(body map[string]interface{}) string {
		resp := requireStatus(t, ts.POST("/api/shares", body, owner), http.StatusOK)
		var out struct{ Token string }
		require.NoError(t, json.Unmarshal(resp, &out))
		require.NotEmpty(t, out.Token)
		return out.Token
	}

	t.Run("public info and meta return the sealed name", func(t *testing.T) {
		token := createShare(map[string]interface{}{
			"file_id":     fileID,
			"wrapped_cek": b64("cek"),
			"name":        sealedShareName,
		})

		var info struct {
			FileName string `json:"file_name"`
		}
		require.NoError(t, json.Unmarshal(requireStatus(t, ts.getShared("/api/share/"+token, ""), http.StatusOK), &info))
		assert.Equal(t, sealedShareName, info.FileName)

		var meta struct {
			OriginalName string `json:"original_name"`
		}
		require.NoError(t, json.Unmarshal(requireStatus(t, ts.getShared("/api/share/"+token+"/meta", ""), http.StatusOK), &meta))
		assert.Equal(t, sealedShareName, meta.OriginalName)
	})

	t.Run("a password-protected share withholds the name until the password is given", func(t *testing.T) {
		token := createShare(map[string]interface{}{
			"file_id":     fileID,
			"wrapped_cek": b64("cek"),
			"name":        sealedShareName,
			"password":    "hunter2",
		})

		var info map[string]json.RawMessage
		require.NoError(t, json.Unmarshal(requireStatus(t, ts.getShared("/api/share/"+token, ""), http.StatusOK), &info))
		_, hasName := info["file_name"]
		assert.False(t, hasName, "the name must not appear before the password step")

		resp := ts.getShared("/api/share/"+token+"/meta", "")
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		resp.Body.Close()

		var meta struct {
			OriginalName string `json:"original_name"`
		}
		require.NoError(t, json.Unmarshal(requireStatus(t, ts.getShared("/api/share/"+token+"/meta", "hunter2"), http.StatusOK), &meta))
		assert.Equal(t, sealedShareName, meta.OriginalName)
	})

	t.Run("a plaintext name is rejected", func(t *testing.T) {
		resp := ts.POST("/api/shares", map[string]interface{}{
			"file_id":     fileID,
			"wrapped_cek": b64("cek"),
			"name":        "report.pdf",
		}, owner)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("an older link without a name falls back to the file's stored name", func(t *testing.T) {
		var stored string
		require.NoError(t, ts.db.Pool().QueryRow(context.Background(),
			`SELECT original_name FROM files WHERE id = $1`, fileID).Scan(&stored))

		token := createShare(map[string]interface{}{"file_id": fileID, "wrapped_cek": b64("cek")})
		var meta struct {
			OriginalName string `json:"original_name"`
		}
		require.NoError(t, json.Unmarshal(requireStatus(t, ts.getShared("/api/share/"+token+"/meta", ""), http.StatusOK), &meta))
		assert.Equal(t, stored, meta.OriginalName)
	})
}

func TestFolderShareCarriesSealedNames(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("fshare-name@example.com", "SecurePass@123!")
	ts.enableMockStorage("fshare-name@example.com")
	f1 := ts.uploadReadyFile(owner, "one.png", 40)
	f2 := ts.uploadReadyFile(owner, "two.txt", 40)

	var stored string
	require.NoError(t, ts.db.Pool().QueryRow(context.Background(),
		`SELECT original_name FROM files WHERE id = $1`, f2).Scan(&stored))

	body := map[string]interface{}{
		"name": "enc1:Zm9sZGVy",
		"files": []map[string]string{
			{"file_id": f1, "wrapped_cek": b64("cek-1"), "name": sealedShareName},
			{"file_id": f2, "wrapped_cek": b64("cek-2")},
		},
	}
	cbody := requireStatus(t, ts.POST("/api/folder-shares", body, owner), http.StatusOK)
	var created struct{ Token string }
	require.NoError(t, json.Unmarshal(cbody, &created))

	t.Run("the listing returns each sealed name, legacy files fall back", func(t *testing.T) {
		var info struct {
			Files []struct {
				FileID string `json:"file_id"`
				Name   string `json:"name"`
			} `json:"files"`
		}
		require.NoError(t, json.Unmarshal(requireStatus(t, ts.getShared("/api/folder-share/"+created.Token, ""), http.StatusOK), &info))
		names := map[string]string{}
		for _, f := range info.Files {
			names[f.FileID] = f.Name
		}
		assert.Equal(t, sealedShareName, names[f1])
		assert.Equal(t, stored, names[f2])
	})

	t.Run("per-file meta returns the sealed name", func(t *testing.T) {
		var meta struct {
			OriginalName string `json:"original_name"`
		}
		path := "/api/folder-share/" + created.Token + "/files/" + f1 + "/meta"
		require.NoError(t, json.Unmarshal(requireStatus(t, ts.getShared(path, ""), http.StatusOK), &meta))
		assert.Equal(t, sealedShareName, meta.OriginalName)
	})

	t.Run("a plaintext per-file name is rejected", func(t *testing.T) {
		resp := ts.POST("/api/folder-shares", map[string]interface{}{
			"name":  "x",
			"files": []map[string]string{{"file_id": f1, "wrapped_cek": b64("cek-1"), "name": "one.png"}},
		}, owner)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
		resp.Body.Close()
	})
}
