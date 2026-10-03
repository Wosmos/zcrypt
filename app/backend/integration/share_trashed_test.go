//go:build integration

package integration_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestShareLinksFollowTrash(t *testing.T) {
	ts := setupTestServer(t)
	const email = "share-trash@example.com"
	owner := ts.registerAndLogin(email, newTestPassword())
	ts.enableMockStorage(email)
	fileID := ts.uploadReadyFile(owner, "gone.txt", 40)

	var link struct{ Token string }
	require.NoError(t, json.Unmarshal(requireStatus(t, ts.POST("/api/shares", map[string]interface{}{
		"file_id": fileID, "wrapped_cek": b64("cek"), "name": sealedShareName,
	}, owner), http.StatusOK), &link))
	var folderLink struct{ Token string }
	require.NoError(t, json.Unmarshal(requireStatus(t, ts.POST("/api/folder-shares",
		createFolderShareBody("Folder", []string{fileID}), owner), http.StatusOK), &folderLink))

	fileRoutes := []string{
		"/api/share/" + link.Token,
		"/api/share/" + link.Token + "/meta",
		"/api/share/" + link.Token + "/chunks/0",
		"/api/folder-share/" + folderLink.Token + "/files/" + fileID + "/meta",
	}
	for _, p := range fileRoutes {
		requireStatus(t, ts.getShared(p, ""), http.StatusOK)
	}

	requireStatus(t, ts.DELETE("/api/files/"+fileID, owner), http.StatusOK)
	for _, p := range fileRoutes {
		requireStatus(t, ts.getShared(p, ""), http.StatusNotFound)
	}
	var info struct {
		Files []struct {
			FileID string `json:"file_id"`
		} `json:"files"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t, ts.getShared("/api/folder-share/"+folderLink.Token, ""), http.StatusOK), &info))
	require.Empty(t, info.Files, "a trashed file must drop out of the folder link listing")

	requireStatus(t, ts.POST("/api/files/"+fileID+"/restore", map[string]interface{}{}, owner), http.StatusOK)
	for _, p := range fileRoutes {
		requireStatus(t, ts.getShared(p, ""), http.StatusOK)
	}
}
