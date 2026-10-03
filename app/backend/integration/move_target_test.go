//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/types"
)

func (ts *testServer) PATCH(path string, body interface{}, token string) *http.Response {
	ts.t.Helper()
	data, err := json.Marshal(body)
	require.NoError(ts.t, err)
	req, err := http.NewRequest(http.MethodPatch, ts.URL+path, bytes.NewReader(data))
	require.NoError(ts.t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	return resp
}

func (ts *testServer) createFolder(token string, parent *string) string {
	ts.t.Helper()
	var f struct {
		ID string `json:"id"`
	}
	decodeJSON(ts.t, ts.POST("/api/folders", map[string]interface{}{"encrypted_name": "bmFtZQ==", "parent_id": parent}, token), &f)
	require.NotEmpty(ts.t, f.ID)
	return f.ID
}

func (ts *testServer) insertOwnedFile(email string) string {
	ts.t.Helper()
	ctx := context.Background()
	user, err := ts.db.GetUserByEmail(ctx, email)
	require.NoError(ts.t, err)
	id := uuid.New().String()
	require.NoError(ts.t, ts.db.InsertFile(ctx, user.ID, &types.FileMetadata{
		ID: id, OriginalSize: 10, ChunkCount: 1, SHA256: "x", Salt: make([]byte, 32), IV: []byte{}, Status: "complete",
	}))
	return id
}

func TestMoveAndPinValidateTarget(t *testing.T) {
	ts := setupTestServer(t)
	const ownerEmail, otherEmail = "move-owner@example.com", "move-other@example.com"
	owner := ts.registerAndLogin(ownerEmail, newTestPassword())
	other := ts.registerAndLogin(otherEmail, newTestPassword())

	ownFolder := ts.createFolder(owner, nil)
	foreignFolder := ts.createFolder(other, nil)
	fileID := ts.insertOwnedFile(ownerEmail)
	foreignFile := ts.insertOwnedFile(otherEmail)

	t.Run("file into another user's folder is refused", func(t *testing.T) {
		requireStatus(t, ts.PATCH("/api/files/"+fileID+"/move", map[string]string{"folder_id": foreignFolder}, owner), 404)
	})
	t.Run("file into a missing folder is refused", func(t *testing.T) {
		requireStatus(t, ts.PATCH("/api/files/"+fileID+"/move", map[string]string{"folder_id": uuid.New().String()}, owner), 404)
	})
	t.Run("non-uuid ids are a 400, not a 500", func(t *testing.T) {
		requireStatus(t, ts.PATCH("/api/files/"+fileID+"/move", map[string]string{"folder_id": "nope"}, owner), 400)
		requireStatus(t, ts.PATCH("/api/folders/"+ownFolder+"/move", map[string]string{"parent_id": "nope"}, owner), 400)
	})
	t.Run("someone else's file cannot be moved", func(t *testing.T) {
		requireStatus(t, ts.PATCH("/api/files/"+foreignFile+"/move", map[string]interface{}{"folder_id": nil}, owner), 404)
	})
	t.Run("own file into own folder and back to root works", func(t *testing.T) {
		requireStatus(t, ts.PATCH("/api/files/"+fileID+"/move", map[string]string{"folder_id": ownFolder}, owner), 200)
		requireStatus(t, ts.PATCH("/api/files/"+fileID+"/move", map[string]interface{}{"folder_id": nil}, owner), 200)
	})
	t.Run("a trashed file cannot be moved", func(t *testing.T) {
		trashedFile := ts.insertOwnedFile(ownerEmail)
		requireStatus(t, ts.DELETE("/api/files/"+trashedFile, owner), 200)
		requireStatus(t, ts.PATCH("/api/files/"+trashedFile+"/move", map[string]string{"folder_id": ownFolder}, owner), 404)
	})
	t.Run("folder into another user's folder is refused", func(t *testing.T) {
		requireStatus(t, ts.PATCH("/api/folders/"+ownFolder+"/move", map[string]string{"parent_id": foreignFolder}, owner), 404)
	})
	t.Run("folder into a trashed folder is refused", func(t *testing.T) {
		trashed := ts.createFolder(owner, nil)
		requireStatus(t, ts.DELETE("/api/folders/"+trashed, owner), 200)
		requireStatus(t, ts.PATCH("/api/folders/"+ownFolder+"/move", map[string]string{"parent_id": trashed}, owner), 404)
	})
	t.Run("concurrent swaps cannot create a cycle", func(t *testing.T) {
		a := ts.createFolder(owner, nil)
		b := ts.createFolder(owner, nil)
		var wg sync.WaitGroup
		codes := make([]int, 2)
		for i, pair := range [][2]string{{a, b}, {b, a}} {
			wg.Add(1)
			go func(i int, pair [2]string) {
				defer wg.Done()
				resp := ts.PATCH("/api/folders/"+pair[0]+"/move", map[string]string{"parent_id": pair[1]}, owner)
				resp.Body.Close()
				codes[i] = resp.StatusCode
			}(i, pair)
		}
		wg.Wait()
		assert.ElementsMatch(t, []int{200, 400}, codes, "exactly one of two opposing moves may win")
	})
	t.Run("pinning someone else's file is refused", func(t *testing.T) {
		requireStatus(t, ts.POST("/api/offline", map[string]string{"file_id": foreignFile, "device_id": "d1"}, owner), 404)
		requireStatus(t, ts.POST("/api/offline", map[string]string{"file_id": fileID, "device_id": "d1"}, owner), 201)
	})
}
