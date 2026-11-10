package cmd

import (
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
)

func TestRefreshTokenCandidatesPreferTheBodyOverEveryCookie(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", strings.NewReader(`{"refresh_token":"from-body"}`))
	req.Header.Add("Cookie", refreshCookieName+"=stale-host-only; "+refreshCookieName+"=site-wide")

	if got := refreshTokenCandidates(req); !slices.Equal(got, []string{"from-body"}) {
		t.Fatalf("candidates = %v, want only the body token", got)
	}
}

func TestRefreshTokenCandidatesTryAtMostTwoCookies(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", strings.NewReader(``))
	req.Header.Add("Cookie", refreshCookieName+"=a; "+refreshCookieName+"=b; "+refreshCookieName+"=c")

	if got := refreshTokenCandidates(req); !slices.Equal(got, []string{"a", "b"}) {
		t.Fatalf("candidates = %v, want [a b]", got)
	}
}

func TestLogoutTokenCandidatesEndEveryTokenPresented(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", strings.NewReader(`{"refresh_token":"from-body"}`))
	req.Header.Add("Cookie", refreshCookieName+"=a; "+refreshCookieName+"=from-body")

	if got := logoutTokenCandidates(req); !slices.Equal(got, []string{"a", "from-body"}) {
		t.Fatalf("logout candidates = %v", got)
	}
}

func TestRefreshTokenCandidatesDropsDuplicatesAndEmpties(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", strings.NewReader(`{"refresh_token":"same"}`))
	req.Header.Add("Cookie", refreshCookieName+"=same; "+refreshCookieName+"=")

	if got := refreshTokenCandidates(req); !slices.Equal(got, []string{"same"}) {
		t.Fatalf("candidates = %v, want [same]", got)
	}
}

func TestRefreshTokenCandidatesEmptyWhenNeitherPresent(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", strings.NewReader(``))

	if got := refreshTokenCandidates(req); len(got) != 0 {
		t.Fatalf("expected no candidates, got %v", got)
	}
}

func TestSetRefreshCookieHostOnlyWithoutDomain(t *testing.T) {
	w := httptest.NewRecorder()
	setRefreshCookie(w, "", "my-refresh-token")

	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected exactly 1 cookie, got %d", len(cookies))
	}
	c := cookies[0]
	if c.Name != refreshCookieName || c.Value != "my-refresh-token" {
		t.Errorf("cookie = %s=%q", c.Name, c.Value)
	}
	if c.Domain != "" {
		t.Errorf("Domain = %q, want host-only", c.Domain)
	}
	if !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteNoneMode {
		t.Errorf("want HttpOnly, Secure, SameSite=None; got %v %v %v", c.HttpOnly, c.Secure, c.SameSite)
	}
	if c.Path != "/api/auth" {
		t.Errorf("Path = %q, want /api/auth (scoped, not sent on every request)", c.Path)
	}
	if c.MaxAge <= 0 {
		t.Errorf("MaxAge = %d, want a positive value", c.MaxAge)
	}
}

func TestSetRefreshCookieSiteWideExpiresTheHostOnlyCopy(t *testing.T) {
	w := httptest.NewRecorder()
	setRefreshCookie(w, "example.com", "my-refresh-token")

	cookies := w.Result().Cookies()
	if len(cookies) != 2 {
		t.Fatalf("expected an expiry plus the site cookie, got %d", len(cookies))
	}
	if cookies[0].Domain != "" || cookies[0].MaxAge >= 0 {
		t.Errorf("first cookie should expire the host-only copy, got Domain=%q MaxAge=%d", cookies[0].Domain, cookies[0].MaxAge)
	}
	if cookies[1].Domain != "example.com" || cookies[1].Value != "my-refresh-token" || cookies[1].MaxAge <= 0 {
		t.Errorf("second cookie should be the live site-wide one, got Domain=%q Value=%q MaxAge=%d", cookies[1].Domain, cookies[1].Value, cookies[1].MaxAge)
	}
}

func TestClearRefreshCookieExpiresBothForms(t *testing.T) {
	w := httptest.NewRecorder()
	clearRefreshCookie(w, "example.com")

	cookies := w.Result().Cookies()
	if len(cookies) != 2 {
		t.Fatalf("expected 2 expiring cookies, got %d", len(cookies))
	}
	domains := []string{cookies[0].Domain, cookies[1].Domain}
	if !slices.Equal(domains, []string{"", "example.com"}) {
		t.Errorf("domains = %v, want host-only and site-wide", domains)
	}
	for _, c := range cookies {
		if c.MaxAge >= 0 || c.Value != "" {
			t.Errorf("cookie Domain=%q not expired: MaxAge=%d Value=%q", c.Domain, c.MaxAge, c.Value)
		}
	}
}

func TestViaOwnSite(t *testing.T) {
	for header, want := range map[string]bool{"same-origin": true, "same-site": true, "cross-site": false, "": false} {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", nil)
		if header != "" {
			req.Header.Set("Sec-Fetch-Site", header)
		}
		if got := viaOwnSite(req); got != want {
			t.Errorf("Sec-Fetch-Site %q: viaOwnSite = %v, want %v", header, got, want)
		}
	}
}
