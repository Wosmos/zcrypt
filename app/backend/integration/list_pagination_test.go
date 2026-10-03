//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestListFilesKeysetPagination(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	const email = "listpage@example.com"
	token := ts.registerAndLogin(email, "SecurePass@123!")

	var userID string
	require.NoError(t, ts.db.Pool().QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&userID))

	_, err := ts.db.Pool().Exec(ctx, `
		INSERT INTO files (user_id, original_name, original_size, sha256, salt, status, created_at)
		SELECT $1, '', 1, 'x', '\x00', 'complete',
		       CASE WHEN g <= 3 THEN TIMESTAMPTZ '2026-01-01 00:00:00+00' ELSE NOW() - g * INTERVAL '1 second' END
		FROM generate_series(1, 7) AS g`, userID)
	require.NoError(t, err)

	seen := map[string]bool{}
	cursor := ""
	pages := 0
	for {
		path := "/api/files?limit=2"
		if cursor != "" {
			path += "&cursor=" + url.QueryEscape(cursor)
		}
		resp := ts.GET(path, token)
		next := resp.Header.Get("X-Next-Cursor")
		body := requireStatus(t, resp, http.StatusOK)
		var page []struct {
			ID string `json:"id"`
		}
		require.NoError(t, json.Unmarshal(body, &page))
		for _, f := range page {
			assert.False(t, seen[f.ID], "file %s repeated across pages", f.ID)
			seen[f.ID] = true
		}
		pages++
		if next == "" {
			break
		}
		require.Len(t, page, 2)
		cursor = next
	}
	assert.Len(t, seen, 7)
	assert.Equal(t, 4, pages)

	resp := ts.GET("/api/files?cursor=not-a-cursor", token)
	requireStatus(t, resp, http.StatusBadRequest)
}
