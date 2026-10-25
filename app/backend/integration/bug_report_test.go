//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/jpeg"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func tinyJPEG(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	require.NoError(t, jpeg.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 4, 4)), nil))
	return buf.Bytes()
}

func (ts *testServer) patchJSON(path string, body interface{}, token string) *http.Response {
	ts.t.Helper()
	data, err := json.Marshal(body)
	require.NoError(ts.t, err)
	req, err := http.NewRequest("PATCH", ts.URL+path, bytes.NewReader(data))
	require.NoError(ts.t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	return resp
}

func TestBugReports(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	_, err := ts.db.Pool().Exec(ctx, `DELETE FROM bug_reports`)
	require.NoError(t, err)

	const adminEmail = "bug-admin@example.com"
	const adminPass = "SecurePass@123!"
	ts.registerAndLogin(adminEmail, adminPass)
	ts.makeAdmin(ctx, adminEmail)
	adminToken := ts.loginToken(adminEmail, adminPass)
	userToken := ts.registerAndLogin("bug-user@example.com", "SecurePass@123!")

	shot := base64.StdEncoding.EncodeToString(tinyJPEG(t))

	var withShotID string
	t.Run("signed-in submit with screenshot", func(t *testing.T) {
		resp := ts.POST("/api/feedback/bug", map[string]string{
			"description": "  Upload hangs at 99%  ",
			"screenshot":  "data:image/jpeg;base64," + shot,
			"app_version": "0.1.6",
			"platform":    "web",
			"route":       "/dashboard",
			"user_agent":  "test-agent",
		}, userToken)
		var out struct {
			ID string `json:"id"`
		}
		require.Equal(t, http.StatusCreated, resp.StatusCode)
		decodeJSON(t, resp, &out)
		require.NotEmpty(t, out.ID)
		withShotID = out.ID
		assert.Equal(t, 1, ts.countScalar(
			`SELECT count(*) FROM bug_reports WHERE id=$1 AND user_id IS NOT NULL AND description='Upload hangs at 99%' AND status='open'`, out.ID))
	})

	t.Run("anonymous submit is accepted", func(t *testing.T) {
		resp := ts.POST("/api/feedback/bug", map[string]interface{}{"description": "Cannot log in", "elapsed_ms": 9000}, "")
		requireStatus(t, resp, http.StatusCreated)
		assert.Equal(t, 1, ts.countScalar(`SELECT count(*) FROM bug_reports WHERE description='Cannot log in' AND user_id IS NULL`))
	})

	t.Run("kind and contact email", func(t *testing.T) {
		anon := func(extra map[string]interface{}) *http.Response {
			body := map[string]interface{}{"description": "an idea worth keeping", "elapsed_ms": 9000}
			for k, v := range extra {
				body[k] = v
			}
			return ts.POST("/api/feedback/bug", body, "")
		}
		requireStatus(t, anon(map[string]interface{}{"kind": "idea", "contact_email": "  reply@example.com "}), http.StatusCreated)
		requireStatus(t, anon(map[string]interface{}{"kind": "nonsense"}), http.StatusBadRequest)
		requireStatus(t, anon(map[string]interface{}{"contact_email": "Bob <bob@example.com>"}), http.StatusBadRequest)
		requireStatus(t, anon(map[string]interface{}{"screenshot": "data:image/jpeg;base64," + shot}), http.StatusBadRequest)
		assert.Equal(t, 1, ts.countScalar(`SELECT count(*) FROM bug_reports WHERE kind='idea' AND contact_email='reply@example.com' AND user_id IS NULL`))
		assert.Equal(t, 0, ts.countScalar(`SELECT count(*) FROM bug_reports WHERE description='an idea worth keeping' AND kind='bug'`))

		requireStatus(t, ts.POST("/api/feedback/bug", map[string]interface{}{"description": "signed in default kind", "contact_email": "ignored@example.com"}, userToken), http.StatusCreated)
		assert.Equal(t, 1, ts.countScalar(`SELECT count(*) FROM bug_reports WHERE description='signed in default kind' AND kind='bug' AND contact_email='' AND user_id IS NOT NULL`))
	})

	t.Run("honeypot and too-fast anonymous reports are silently dropped", func(t *testing.T) {
		for _, body := range []map[string]interface{}{
			{"description": "bot honeypot", "website": "http://spam.example", "elapsed_ms": 9000},
			{"description": "bot too fast", "elapsed_ms": 500},
			{"description": "bot no timing"},
		} {
			resp := ts.POST("/api/feedback/bug", body, "")
			requireStatus(t, resp, http.StatusCreated)
		}
		assert.Equal(t, 0, ts.countScalar(`SELECT count(*) FROM bug_reports WHERE description LIKE 'bot %'`))
		requireStatus(t, ts.POST("/api/feedback/bug", map[string]interface{}{"description": "signed in is not timed", "elapsed_ms": 0}, userToken), http.StatusCreated)
		assert.Equal(t, 1, ts.countScalar(`SELECT count(*) FROM bug_reports WHERE description='signed in is not timed'`))
	})

	t.Run("admin list returns kind and contact email", func(t *testing.T) {
		var out struct {
			Reports []struct {
				Kind         string `json:"kind"`
				ContactEmail string `json:"contact_email"`
			} `json:"reports"`
		}
		decodeJSON(t, ts.GET("/api/admin/bug-reports?limit=100", adminToken), &out)
		var found bool
		for _, r := range out.Reports {
			if r.Kind == "idea" && r.ContactEmail == "reply@example.com" {
				found = true
			}
		}
		assert.True(t, found)
	})

	t.Run("anonymous per-IP limit is 5 per hour", func(t *testing.T) {
		post := func() int {
			data, _ := json.Marshal(map[string]interface{}{"description": "anon spam", "elapsed_ms": 9000})
			req, err := http.NewRequest("POST", ts.URL+"/api/feedback/bug", bytes.NewReader(data))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Forwarded-For", "203.0.113.88")
			resp, err := http.DefaultClient.Do(req)
			require.NoError(t, err)
			resp.Body.Close()
			return resp.StatusCode
		}
		for i := 0; i < 5; i++ {
			require.Equal(t, http.StatusCreated, post())
		}
		assert.Equal(t, http.StatusTooManyRequests, post())
	})

	t.Run("validation", func(t *testing.T) {
		requireStatus(t, ts.POST("/api/feedback/bug", map[string]string{"description": "   "}, userToken), http.StatusBadRequest)
		requireStatus(t, ts.POST("/api/feedback/bug", map[string]string{"description": strings.Repeat("a", 5001)}, userToken), http.StatusBadRequest)
		requireStatus(t, ts.POST("/api/feedback/bug", map[string]string{"description": "x", "route": strings.Repeat("r", 513)}, userToken), http.StatusBadRequest)
		requireStatus(t, ts.POST("/api/feedback/bug", map[string]string{"description": "x", "screenshot": "not-base64!!"}, userToken), http.StatusBadRequest)
		notImage := base64.StdEncoding.EncodeToString([]byte("<svg onload=alert(1)></svg>"))
		requireStatus(t, ts.POST("/api/feedback/bug", map[string]string{"description": "x", "screenshot": notImage}, userToken), http.StatusBadRequest)
		big := base64.StdEncoding.EncodeToString(append(tinyJPEG(t), make([]byte, 2<<20)...))
		requireStatus(t, ts.POST("/api/feedback/bug", map[string]string{"description": "x", "screenshot": big}, userToken), http.StatusBadRequest)
	})

	t.Run("per-IP rate limit", func(t *testing.T) {
		post := func() int {
			data, _ := json.Marshal(map[string]string{"description": "spam"})
			req, err := http.NewRequest("POST", ts.URL+"/api/feedback/bug", bytes.NewReader(data))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Forwarded-For", "203.0.113.77")
			resp, err := http.DefaultClient.Do(req)
			require.NoError(t, err)
			resp.Body.Close()
			return resp.StatusCode
		}
		var last int
		for i := 0; i < 11; i++ {
			last = post()
		}
		assert.Equal(t, http.StatusTooManyRequests, last)
	})

	t.Run("admin endpoints reject non-admins", func(t *testing.T) {
		requireStatus(t, ts.GET("/api/admin/bug-reports", ""), http.StatusUnauthorized)
		requireStatus(t, ts.GET("/api/admin/bug-reports", userToken), http.StatusForbidden)
		requireStatus(t, ts.patchJSON("/api/admin/bug-reports/"+withShotID, map[string]string{"status": "fixed"}, userToken), http.StatusForbidden)
		requireStatus(t, ts.GET("/api/admin/bug-reports/"+withShotID+"/screenshot", userToken), http.StatusForbidden)
	})

	t.Run("admin list and filter", func(t *testing.T) {
		var out struct {
			Reports []struct {
				ID            string `json:"id"`
				Email         string `json:"email"`
				HasScreenshot bool   `json:"has_screenshot"`
				Status        string `json:"status"`
			} `json:"reports"`
			Total int `json:"total"`
		}
		decodeJSON(t, ts.GET("/api/admin/bug-reports?status=open&limit=100", adminToken), &out)
		require.GreaterOrEqual(t, out.Total, 2)
		var found bool
		for _, r := range out.Reports {
			if r.ID == withShotID {
				found = true
				assert.True(t, r.HasScreenshot)
				assert.Equal(t, "bug-user@example.com", r.Email)
			}
		}
		assert.True(t, found)
		requireStatus(t, ts.GET("/api/admin/bug-reports?status=bogus", adminToken), http.StatusBadRequest)
	})

	t.Run("status change", func(t *testing.T) {
		requireStatus(t, ts.patchJSON("/api/admin/bug-reports/"+withShotID, map[string]string{"status": "nope"}, adminToken), http.StatusBadRequest)
		requireStatus(t, ts.patchJSON("/api/admin/bug-reports/"+withShotID, map[string]string{"status": "fixed"}, adminToken), http.StatusOK)
		assert.Equal(t, 1, ts.countScalar(`SELECT count(*) FROM bug_reports WHERE id=$1 AND status='fixed'`, withShotID))
		requireStatus(t, ts.patchJSON("/api/admin/bug-reports/00000000-0000-0000-0000-000000000000", map[string]string{"status": "fixed"}, adminToken), http.StatusNotFound)
		requireStatus(t, ts.patchJSON("/api/admin/bug-reports/not-a-uuid", map[string]string{"status": "fixed"}, adminToken), http.StatusBadRequest)
		var out struct {
			Total int `json:"total"`
		}
		decodeJSON(t, ts.GET("/api/admin/bug-reports?status=fixed", adminToken), &out)
		assert.Equal(t, 1, out.Total)
	})

	t.Run("screenshot served to admin", func(t *testing.T) {
		resp := ts.GET("/api/admin/bug-reports/"+withShotID+"/screenshot", adminToken)
		require.Equal(t, http.StatusOK, resp.StatusCode)
		assert.Equal(t, "image/jpeg", resp.Header.Get("Content-Type"))
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		assert.Equal(t, tinyJPEG(t), body)
		requireStatus(t, ts.GET("/api/admin/bug-reports/00000000-0000-0000-0000-000000000000/screenshot", adminToken), http.StatusNotFound)
	})
}
