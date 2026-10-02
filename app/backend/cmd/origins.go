package cmd

import (
	"net/http"
	"os"
	"strings"
)

// AllowedOrigins returns the browser origins allowed to call the API with
// credentials: ALLOWED_ORIGINS (comma-separated) and FRONTEND_URL, the local
// dev defaults when neither is set, and the desktop (Tauri) webview origins.
// macOS/Linux webviews use the tauri:// scheme; Windows (WebView2) uses
// http(s)://tauri.localhost.
func AllowedOrigins() map[string]bool {
	allowed := map[string]bool{}
	if origins := os.Getenv("ALLOWED_ORIGINS"); origins != "" {
		for _, o := range strings.Split(origins, ",") {
			allowed[strings.TrimSpace(o)] = true
		}
	}
	if frontend := os.Getenv("FRONTEND_URL"); frontend != "" {
		allowed[strings.TrimRight(frontend, "/")] = true
	}
	if len(allowed) == 0 {
		allowed["http://localhost:3000"] = true
		allowed["http://localhost:8080"] = true
	}
	for _, o := range []string{"tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"} {
		allowed[o] = true
	}
	return allowed
}

// refreshCookieCrossSite reports whether a request carrying the refresh cookie
// was sent by a page outside the allowed origins. The cookie is SameSite=None,
// so without this any site could make the browser refresh or log out the user.
// Browsers always send Origin (or at least Sec-Fetch-Site) on such requests;
// clients that send neither are not browsers and hold the token themselves.
func (s *Server) refreshCookieCrossSite(r *http.Request) bool {
	if c, err := r.Cookie(refreshCookieName); err != nil || c.Value == "" {
		return false
	}
	if origin := r.Header.Get("Origin"); origin != "" {
		return !s.allowedOrigins[origin]
	}
	return r.Header.Get("Sec-Fetch-Site") == "cross-site"
}
