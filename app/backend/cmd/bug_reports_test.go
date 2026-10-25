package cmd

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/config"
)

func newBugServer() *Server {
	return &Server{
		cfg:                  &config.Config{},
		bugIPLimiter:         newRateLimiter(10, time.Hour),
		bugUserLimiter:       newRateLimiter(10, time.Hour),
		bugAnonIPLimiter:     newRateLimiter(5, time.Hour),
		bugAnonGlobalLimiter: newRateLimiter(200, 24*time.Hour),
	}
}

func submitBug(s *Server, body string, signedIn bool) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/feedback/bug", strings.NewReader(body))
	req.RemoteAddr = "198.51.100.7:1234"
	if signedIn {
		req = req.WithContext(context.WithValue(req.Context(), userContextKey, &auth.Claims{Sub: "11111111-1111-1111-1111-111111111111"}))
	}
	rec := httptest.NewRecorder()
	s.HandleSubmitBugReport(rec, req)
	return rec
}

func TestValidContactEmail(t *testing.T) {
	for _, ok := range []string{"", "  ", "a@b.co", " a@b.co ", "first.last+tag@example.com"} {
		_, err := validContactEmail(ok)
		assert.NoError(t, err, ok)
	}
	got, err := validContactEmail("  me@example.com ")
	require.NoError(t, err)
	assert.Equal(t, "me@example.com", got)

	long := strings.Repeat("a", 250) + "@b.co"
	for _, bad := range []string{"nope", "Bob <bob@example.com>", "a@b.co\r\nBcc: x@y.z", "a@b.co\nx", "a@", "@b.co", long, "a@b.co, c@d.co"} {
		_, err := validContactEmail(bad)
		assert.ErrorIs(t, err, errBadContactEmail, bad)
	}
}

func TestBugReportRejections(t *testing.T) {
	cases := []struct {
		name     string
		body     string
		signedIn bool
		want     int
		contains string
	}{
		{"invalid kind", `{"description":"x","kind":"spam","elapsed_ms":9000}`, false, 400, "invalid kind"},
		{"invalid kind signed in", `{"description":"x","kind":"nope"}`, true, 400, "invalid kind"},
		{"bad email", `{"description":"x","contact_email":"Bob <b@x.co>","elapsed_ms":9000}`, false, 400, "invalid email"},
		{"anonymous screenshot", `{"description":"x","screenshot":"abcd","elapsed_ms":9000}`, false, 400, "sign in to attach a screenshot"},
		{"anonymous empty description", `{"description":"  ","elapsed_ms":9000}`, false, 400, "description is required"},
		{"signed in ignores bad contact email", `{"description":" ","contact_email":"not an email"}`, true, 400, "description is required"},
		{"bad json", `{`, false, 400, "invalid request"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := submitBug(newBugServer(), c.body, c.signedIn)
			assert.Equal(t, c.want, rec.Code)
			assert.Contains(t, rec.Body.String(), c.contains)
		})
	}
}

func TestBugReportAnonymousLimiters(t *testing.T) {
	s := newBugServer()
	body := `{"description":" ","elapsed_ms":9000}`
	for i := 0; i < 5; i++ {
		assert.Equal(t, http.StatusBadRequest, submitBug(s, body, false).Code)
	}
	assert.Equal(t, http.StatusTooManyRequests, submitBug(s, body, false).Code)

	s = newBugServer()
	s.bugAnonGlobalLimiter = newRateLimiter(2, 24*time.Hour)
	s.bugAnonIPLimiter = newRateLimiter(100, time.Hour)
	s.bugIPLimiter = newRateLimiter(100, time.Hour)
	assert.Equal(t, http.StatusBadRequest, submitBug(s, body, false).Code)
	assert.Equal(t, http.StatusBadRequest, submitBug(s, body, false).Code)
	assert.Equal(t, http.StatusTooManyRequests, submitBug(s, body, false).Code)

	s = newBugServer()
	s.bugAnonIPLimiter = newRateLimiter(1, time.Hour)
	for i := 0; i < 3; i++ {
		assert.Equal(t, http.StatusBadRequest, submitBug(s, `{"description":" "}`, true).Code, "signed-in is not subject to the anonymous limiter")
	}
}
