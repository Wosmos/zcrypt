//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// requestWith sends a JSON request carrying extra headers (edge geo headers).
func (ts *testServer) requestWith(method, path string, body interface{}, token string, headers map[string]string) *http.Response {
	ts.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		require.NoError(ts.t, json.NewEncoder(&buf).Encode(body))
	}
	req, err := http.NewRequest(method, ts.URL+path, &buf)
	require.NoError(ts.t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	return resp
}

func (ts *testServer) adminGet(path, token string, want int, out interface{}) {
	ts.t.Helper()
	resp := ts.GET(path, token)
	body := requireStatus(ts.t, resp, want)
	if out != nil {
		require.NoError(ts.t, json.Unmarshal(body, out), string(body))
	}
}

type adminUserRow struct {
	ID            string  `json:"id"`
	Email         string  `json:"email"`
	SignupCountry string  `json:"signup_country"`
	SignupCity    string  `json:"signup_city"`
	LastCountry   string  `json:"last_country"`
	LastRegion    string  `json:"last_region"`
	LastCity      string  `json:"last_city"`
	LastIPPrefix  string  `json:"last_ip_prefix"`
	LastSeenAt    *string `json:"last_seen_at"`
	LastDevice    string  `json:"last_device"`
	SessionCount  int     `json:"session_count"`
	FileCount     int     `json:"file_count"`
}

type adminUsersPage struct {
	Users  []adminUserRow `json:"users"`
	Total  int            `json:"total"`
	Limit  int            `json:"limit"`
	Offset int            `json:"offset"`
}

// adminOverhaulFixture is an admin plus three users signed up from known
// places, all sharing a unique email tag so searches isolate this test's rows.
func adminOverhaulFixture(t *testing.T) (*testServer, string, string, string) {
	ts := setupTestServer(t)
	ctx := context.Background()
	tag := uuid.NewString()[:8]
	const pass = "SecurePass@123!"
	adminEmail := fmt.Sprintf("ov-admin-%s@example.com", tag)
	ts.registerAndLogin(adminEmail, pass)
	ts.makeAdmin(ctx, adminEmail)
	adminToken := ts.loginToken(adminEmail, pass)

	places := []map[string]string{
		{"X-Vercel-IP-Country": "DE", "X-Vercel-IP-Country-Region": "BE", "X-Vercel-IP-City": "Berlin"},
		{"CF-IPCountry": "PK", "CF-IPCity": "Lahore"},
		{},
	}
	for i, h := range places {
		email := fmt.Sprintf("ov-user%d-%s@example.com", i, tag)
		resp := ts.requestWith("POST", "/api/auth/register", map[string]interface{}{
			"email": email, "password": pass, "username": fmt.Sprintf("ov%d_%s", i, tag), "force": true,
		}, "", h)
		resp.Body.Close()
		resp = ts.requestWith("POST", "/api/auth/login", map[string]string{"email": email, "password": pass}, "", h)
		requireStatus(t, resp, http.StatusOK)
	}
	return ts, adminToken, tag, pass
}

func TestAdminUsersListPagingSearchLocation(t *testing.T) {
	ts, adminToken, tag, _ := adminOverhaulFixture(t)

	var page adminUsersPage
	ts.adminGet("/api/admin/users?q=ov-user&limit=2&sort=email&order=asc&q="+tag, adminToken, http.StatusOK, &page)
	assert.Equal(t, 3, page.Total)
	assert.Equal(t, 2, page.Limit)
	require.Len(t, page.Users, 2)
	assert.Contains(t, page.Users[0].Email, "ov-user0-")
	assert.Equal(t, "DE", page.Users[0].SignupCountry)
	assert.Equal(t, "Berlin", page.Users[0].SignupCity)
	assert.Equal(t, "DE", page.Users[0].LastCountry)
	assert.Equal(t, "BE", page.Users[0].LastRegion)
	assert.NotNil(t, page.Users[0].LastSeenAt)
	assert.Equal(t, 1, page.Users[0].SessionCount)
	assert.Regexp(t, `^10\.\d+\.\d+\.0$`, page.Users[0].LastIPPrefix, "only the /24 prefix is stored")
	assert.NotEmpty(t, page.Users[0].LastDevice)

	ts.adminGet("/api/admin/users?limit=2&offset=2&sort=email&order=asc&q="+tag+"&role=user", adminToken, http.StatusOK, &page)
	require.Len(t, page.Users, 1, "the last page holds the remainder")
	assert.Equal(t, 2, page.Offset)

	ts.adminGet("/api/admin/users?offset=50&q="+tag, adminToken, http.StatusOK, &page)
	assert.Empty(t, page.Users)
	assert.Equal(t, 4, page.Total, "total is reported even past the last page")

	ts.adminGet("/api/admin/users?country=pk&q="+tag, adminToken, http.StatusOK, &page)
	require.Len(t, page.Users, 1)
	assert.Equal(t, "Lahore", page.Users[0].LastCity)

	ts.adminGet("/api/admin/users?country=unknown&q=ov-user2-"+tag, adminToken, http.StatusOK, &page)
	assert.Len(t, page.Users, 1)

	ts.adminGet("/api/admin/users?q=100%25_"+tag, adminToken, http.StatusOK, &page)
	assert.Zero(t, page.Total, "LIKE wildcards in the search are literal")

	for _, bad := range []string{"sort=password_hash", "order=up", "country=Germany", "role=root", "limit=x", "offset=-3"} {
		resp := ts.GET("/api/admin/users?"+bad, adminToken)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode, bad)
		resp.Body.Close()
	}

	var countries struct {
		Countries []struct {
			Country string `json:"country"`
			Count   int    `json:"count"`
		} `json:"countries"`
	}
	ts.adminGet("/api/admin/users/countries", adminToken, http.StatusOK, &countries)
	seen := map[string]bool{}
	for _, c := range countries.Countries {
		seen[c.Country] = true
	}
	assert.True(t, seen["DE"] && seen["PK"])
}

func TestAdminEndpointsRequireAdmin(t *testing.T) {
	ts, adminToken, tag, pass := adminOverhaulFixture(t)
	userToken := ts.loginToken(fmt.Sprintf("ov-user0-%s@example.com", tag), pass)
	var page adminUsersPage
	ts.adminGet("/api/admin/users?q=ov-user0-"+tag, adminToken, http.StatusOK, &page)
	require.Len(t, page.Users, 1)
	id := page.Users[0].ID

	for _, path := range []string{
		"/api/admin/users", "/api/admin/users/countries", "/api/admin/users/" + id,
		"/api/admin/users/" + id + "/journey", "/api/admin/users/" + id + "/report",
		"/api/admin/overview", "/api/admin/emails", "/api/admin/feedback", "/api/admin/audit",
		"/api/admin/bug-reports", "/api/admin/reviews", "/api/admin/tokens",
	} {
		resp := ts.GET(path, userToken)
		assert.Equal(t, http.StatusForbidden, resp.StatusCode, path)
		resp.Body.Close()
	}
	resp := ts.DELETE("/api/admin/users/"+id+"/sessions/"+uuid.NewString(), userToken)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	resp.Body.Close()
}

func TestAdminUserJourneyReportAndSessions(t *testing.T) {
	ts, adminToken, tag, _ := adminOverhaulFixture(t)
	var page adminUsersPage
	ts.adminGet("/api/admin/users?q=ov-user0-"+tag, adminToken, http.StatusOK, &page)
	require.Len(t, page.Users, 1)
	id := page.Users[0].ID

	resp := ts.PUT("/api/admin/users/"+id+"/plan", []byte(`{"plan":"free","notify":false}`), adminToken)
	requireStatus(t, resp, http.StatusOK)

	type journey struct {
		Events []struct {
			Kind     string                 `json:"kind"`
			Family   string                 `json:"family"`
			Actor    string                 `json:"actor"`
			Device   string                 `json:"device"`
			Metadata map[string]interface{} `json:"metadata"`
		} `json:"events"`
		Total    int            `json:"total"`
		Families map[string]int `json:"families"`
	}
	var j journey
	require.Eventually(t, func() bool {
		ts.adminGet("/api/admin/users/"+id+"/journey", adminToken, http.StatusOK, &j)
		return j.Families["admin"] >= 1 && j.Families["auth"] >= 2
	}, 3*time.Second, 50*time.Millisecond)
	assert.Equal(t, j.Total, len(j.Events))
	for _, name := range []string{"auth", "security", "files", "sharing", "storage", "admin", "account"} {
		_, ok := j.Families[name]
		assert.True(t, ok, "family %s is always reported", name)
	}
	assert.Equal(t, "admin_plan_change", j.Events[0].Kind, "newest first")
	assert.Equal(t, "admin", j.Events[0].Family)
	assert.NotEmpty(t, j.Events[0].Actor, "admin actions name the admin")

	ts.adminGet("/api/admin/users/"+id+"/journey?kinds=auth&limit=1", adminToken, http.StatusOK, &j)
	require.Len(t, j.Events, 1)
	assert.Equal(t, "auth", j.Events[0].Family)
	assert.Equal(t, j.Families["auth"], j.Total)
	assert.Equal(t, "DE", j.Events[0].Metadata["country"], "sign-ins carry their country")

	resp = ts.GET("/api/admin/users/"+id+"/journey?kinds=auth,bogus", adminToken)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	resp.Body.Close()
	resp = ts.GET("/api/admin/users/"+uuid.NewString()+"/journey", adminToken)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	resp.Body.Close()

	var report struct {
		AccountAgeDays int `json:"account_age_days"`
		Stats          struct {
			Activity    []struct{ Date string } `json:"activity"`
			Countries7d []string                `json:"countries_7d"`
			DaysActive  int                     `json:"days_active"`
		} `json:"stats"`
		Sessions []struct {
			ID      string `json:"id"`
			Country string `json:"country"`
			City    string `json:"city"`
			Device  string `json:"device"`
		} `json:"sessions"`
		RiskFlags []struct {
			Code string `json:"code"`
		} `json:"risk_flags"`
		StorageGrowth []interface{} `json:"storage_growth"`
	}
	ts.adminGet("/api/admin/users/"+id+"/report", adminToken, http.StatusOK, &report)
	assert.Len(t, report.Stats.Activity, 30)
	assert.Equal(t, []string{"DE"}, report.Stats.Countries7d)
	assert.GreaterOrEqual(t, report.Stats.DaysActive, 1)
	require.Len(t, report.Sessions, 1)
	assert.Equal(t, "Berlin", report.Sessions[0].City)
	assert.NotNil(t, report.StorageGrowth)
	codes := map[string]bool{}
	for _, f := range report.RiskFlags {
		codes[f.Code] = true
	}
	assert.True(t, codes["no_2fa"])

	resp = ts.DELETE("/api/admin/users/"+id+"/sessions/"+report.Sessions[0].ID, adminToken)
	requireStatus(t, resp, http.StatusOK)
	resp = ts.DELETE("/api/admin/users/"+id+"/sessions/"+report.Sessions[0].ID, adminToken)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	resp.Body.Close()
	resp = ts.DELETE("/api/admin/users/"+id+"/sessions/not-a-uuid", adminToken)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	resp.Body.Close()
}

func TestAdminOverviewAndListShapes(t *testing.T) {
	ts, adminToken, _, _ := adminOverhaulFixture(t)

	var o struct {
		TotalUsers      int `json:"total_users"`
		SignupsThisWeek int `json:"signups_this_week"`
		Active7d        int `json:"active_7d"`
		Series          []struct {
			Date    string `json:"date"`
			Signups int    `json:"signups"`
		} `json:"series"`
		Countries []interface{} `json:"countries"`
		Recent    []interface{} `json:"recent"`
	}
	ts.adminGet("/api/admin/overview?days=90", adminToken, http.StatusOK, &o)
	assert.GreaterOrEqual(t, o.TotalUsers, 4)
	assert.GreaterOrEqual(t, o.SignupsThisWeek, 4)
	assert.GreaterOrEqual(t, o.Active7d, 4)
	require.Len(t, o.Series, 90)
	assert.Equal(t, time.Now().Format("2006-01-02"), o.Series[89].Date)
	assert.GreaterOrEqual(t, o.Series[89].Signups, 4)
	assert.NotEmpty(t, o.Countries)
	assert.NotEmpty(t, o.Recent)
	for _, bad := range []string{"days=3", "days=400", "days=x"} {
		resp := ts.GET("/api/admin/overview?"+bad, adminToken)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode, bad)
		resp.Body.Close()
	}

	for path, key := range map[string]string{
		"/api/admin/emails":      "campaigns",
		"/api/admin/feedback":    "feedback",
		"/api/admin/audit":       "events",
		"/api/admin/bug-reports": "reports",
		"/api/admin/reviews":     "reviews",
		"/api/admin/tokens":      "tokens",
	} {
		var body map[string]json.RawMessage
		ts.adminGet(path+"?limit=5&offset=0", adminToken, http.StatusOK, &body)
		for _, k := range []string{key, "total", "limit", "offset"} {
			_, ok := body[k]
			assert.True(t, ok, "%s returns %s", path, k)
		}
		assert.Equal(t, "5", string(body["limit"]), path)
		resp := ts.GET(path+"?sort=nope", adminToken)
		if path != "/api/admin/tokens" {
			assert.Equal(t, http.StatusBadRequest, resp.StatusCode, path)
		}
		resp.Body.Close()
	}

	resp := ts.GET("/api/admin/audit?user_id=not-a-uuid", adminToken)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	resp.Body.Close()

	resp = ts.PUT("/api/admin/users/"+uuid.NewString()+"/plan", []byte(`{"plan":"free","notify":false}`), adminToken)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode, "a missing user is not a silent success")
	resp.Body.Close()
	resp = ts.PUT("/api/admin/users/"+uuid.NewString()+"/quota", []byte(`{"quota_bytes":null,"notify":false}`), adminToken)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	resp.Body.Close()
}
