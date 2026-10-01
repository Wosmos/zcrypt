//go:build integration

package integration_test

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestReviews(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	_, err := ts.db.Pool().Exec(ctx, `DELETE FROM reviews`)
	require.NoError(t, err)

	const adminEmail = "review-admin@example.com"
	const adminPass = "SecurePass@123!"
	ts.registerAndLogin(adminEmail, adminPass)
	ts.makeAdmin(ctx, adminEmail)
	adminToken := ts.loginToken(adminEmail, adminPass)
	userToken := ts.registerAndLogin("review-user@example.com", "SecurePass@123!")
	otherToken := ts.registerAndLogin("review-other@example.com", "SecurePass@123!")

	type publicList struct {
		Reviews []struct {
			DisplayName string `json:"display_name"`
			Rating      int    `json:"rating"`
			Quote       string `json:"quote"`
		} `json:"reviews"`
	}
	type adminList struct {
		Reviews []struct {
			ID     string `json:"id"`
			Status string `json:"status"`
		} `json:"reviews"`
		Total int `json:"total"`
	}

	t.Run("submit requires auth", func(t *testing.T) {
		requireStatus(t, ts.POST("/api/reviews", map[string]interface{}{"rating": 5, "quote": "x", "display_name": "A"}, ""), http.StatusUnauthorized)
		requireStatus(t, ts.GET("/api/reviews/me", ""), http.StatusUnauthorized)
	})

	t.Run("validation", func(t *testing.T) {
		post := func(body map[string]interface{}) *http.Response { return ts.POST("/api/reviews", body, userToken) }
		requireStatus(t, post(map[string]interface{}{"rating": 0, "quote": "x", "display_name": "A"}), http.StatusBadRequest)
		requireStatus(t, post(map[string]interface{}{"rating": 6, "quote": "x", "display_name": "A"}), http.StatusBadRequest)
		requireStatus(t, post(map[string]interface{}{"rating": 5, "quote": "   ", "display_name": "A"}), http.StatusBadRequest)
		requireStatus(t, post(map[string]interface{}{"rating": 5, "quote": strings.Repeat("q", 281), "display_name": "A"}), http.StatusBadRequest)
		requireStatus(t, post(map[string]interface{}{"rating": 5, "quote": "x", "display_name": ""}), http.StatusBadRequest)
		requireStatus(t, post(map[string]interface{}{"rating": 5, "quote": "x", "display_name": strings.Repeat("n", 41)}), http.StatusBadRequest)
	})

	t.Run("no review yet", func(t *testing.T) {
		var out struct {
			Review *struct{} `json:"review"`
		}
		decodeJSON(t, ts.GET("/api/reviews/me", userToken), &out)
		assert.Nil(t, out.Review)
	})

	var reviewID string
	t.Run("submit is pending and not public", func(t *testing.T) {
		resp := ts.POST("/api/reviews", map[string]interface{}{
			"rating": 5, "quote": "  Finally storage I trust  ", "display_name": "Sam", "public_ok": true,
		}, userToken)
		require.Equal(t, http.StatusOK, resp.StatusCode)
		var out struct {
			ID     string `json:"id"`
			Status string `json:"status"`
			Quote  string `json:"quote"`
		}
		decodeJSON(t, resp, &out)
		assert.Equal(t, "pending", out.Status)
		assert.Equal(t, "Finally storage I trust", out.Quote)
		reviewID = out.ID

		var pub publicList
		decodeJSON(t, ts.GET("/api/reviews/public", ""), &pub)
		assert.Empty(t, pub.Reviews)
	})

	t.Run("upsert keeps one row per user", func(t *testing.T) {
		requireStatus(t, ts.POST("/api/reviews", map[string]interface{}{
			"rating": 4, "quote": "Still great", "display_name": "Sam", "public_ok": true,
		}, userToken), http.StatusOK)
		assert.Equal(t, 1, ts.countScalar(`SELECT count(*) FROM reviews WHERE id=$1`, reviewID))
		assert.Equal(t, 1, ts.countScalar(`SELECT count(*) FROM reviews WHERE rating=4 AND quote='Still great'`))
	})

	t.Run("admin endpoints reject non-admins", func(t *testing.T) {
		requireStatus(t, ts.GET("/api/admin/reviews", ""), http.StatusUnauthorized)
		requireStatus(t, ts.GET("/api/admin/reviews", userToken), http.StatusForbidden)
		requireStatus(t, ts.patchJSON("/api/admin/reviews/"+reviewID, map[string]string{"status": "approved"}, userToken), http.StatusForbidden)
	})

	t.Run("admin list, filter and validation", func(t *testing.T) {
		var out adminList
		decodeJSON(t, ts.GET("/api/admin/reviews?status=pending", adminToken), &out)
		require.Equal(t, 1, out.Total)
		assert.Equal(t, reviewID, out.Reviews[0].ID)
		requireStatus(t, ts.GET("/api/admin/reviews?status=bogus", adminToken), http.StatusBadRequest)
		requireStatus(t, ts.patchJSON("/api/admin/reviews/"+reviewID, map[string]string{"status": "nope"}, adminToken), http.StatusBadRequest)
		requireStatus(t, ts.patchJSON("/api/admin/reviews/not-a-uuid", map[string]string{"status": "approved"}, adminToken), http.StatusBadRequest)
		requireStatus(t, ts.patchJSON("/api/admin/reviews/00000000-0000-0000-0000-000000000000", map[string]string{"status": "approved"}, adminToken), http.StatusNotFound)
	})

	t.Run("approved and consented review goes public with cache header", func(t *testing.T) {
		requireStatus(t, ts.patchJSON("/api/admin/reviews/"+reviewID, map[string]string{"status": "approved"}, adminToken), http.StatusOK)
		resp := ts.GET("/api/reviews/public", "")
		require.Equal(t, http.StatusOK, resp.StatusCode)
		assert.Equal(t, "public, max-age=300", resp.Header.Get("Cache-Control"))
		var pub publicList
		decodeJSON(t, resp, &pub)
		require.Len(t, pub.Reviews, 1)
		assert.Equal(t, "Sam", pub.Reviews[0].DisplayName)
		assert.Equal(t, 4, pub.Reviews[0].Rating)
		assert.Equal(t, "Still great", pub.Reviews[0].Quote)
	})

	t.Run("editing resets to pending and hides it again", func(t *testing.T) {
		requireStatus(t, ts.POST("/api/reviews", map[string]interface{}{
			"rating": 5, "quote": "Edited", "display_name": "Sam", "public_ok": true,
		}, userToken), http.StatusOK)
		var pub publicList
		decodeJSON(t, ts.GET("/api/reviews/public", ""), &pub)
		assert.Empty(t, pub.Reviews)
	})

	t.Run("approved without consent stays private", func(t *testing.T) {
		requireStatus(t, ts.POST("/api/reviews", map[string]interface{}{
			"rating": 3, "quote": "Private thoughts", "display_name": "Kim", "public_ok": false,
		}, otherToken), http.StatusOK)
		_, err := ts.db.Pool().Exec(ctx, `UPDATE reviews SET status='approved'`)
		require.NoError(t, err)
		var pub publicList
		decodeJSON(t, ts.GET("/api/reviews/public", ""), &pub)
		for _, r := range pub.Reviews {
			assert.NotEqual(t, "Kim", r.DisplayName)
		}
	})

	t.Run("reject hides a public review", func(t *testing.T) {
		requireStatus(t, ts.patchJSON("/api/admin/reviews/"+reviewID, map[string]string{"status": "rejected"}, adminToken), http.StatusOK)
		var pub publicList
		decodeJSON(t, ts.GET("/api/reviews/public", ""), &pub)
		for _, r := range pub.Reviews {
			assert.NotEqual(t, "Sam", r.DisplayName)
		}
	})
}
