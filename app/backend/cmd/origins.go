package cmd

import (
	"net"
	"net/http"
	"os"
	"strings"

	"github.com/zcrypt/zcrypt/config"
)

// tauriOrigins are the desktop and Android webview origins. macOS and Linux
// webviews use the tauri:// scheme; Windows (WebView2) uses http(s)://tauri.localhost.
var tauriOrigins = []string{"tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"}

// AllowedOrigins returns the browser origins allowed to call the API with
// credentials: ALLOWED_ORIGINS (comma-separated) and FRONTEND_URL, each with its
// www/apex twin since a site is served on both, the local dev defaults when
// neither is set, and the desktop (Tauri) webview origins.
func AllowedOrigins() map[string]bool {
	allowed := map[string]bool{}
	if origins := os.Getenv("ALLOWED_ORIGINS"); origins != "" {
		for _, o := range strings.Split(origins, ",") {
			if o = strings.TrimRight(strings.TrimSpace(o), "/"); o != "" {
				allowed[o] = true
			}
		}
	}
	if frontend := os.Getenv("FRONTEND_URL"); frontend != "" {
		allowed[strings.TrimRight(frontend, "/")] = true
	}
	for o := range allowed {
		if twin := wwwTwin(o); twin != "" {
			allowed[twin] = true
		}
	}
	if len(allowed) == 0 {
		allowed[config.DefaultFrontendURL] = true
		allowed[config.DefaultBackendURL] = true
	}
	for _, o := range tauriOrigins {
		allowed[o] = true
	}
	return allowed
}

// wwwTwin returns the https origin's www/apex counterpart (https://www.a.com for
// https://a.com and back), or "" for anything else, such as localhost, an IP, or
// a single-label host.
func wwwTwin(origin string) string {
	host, ok := strings.CutPrefix(origin, "https://")
	if !ok || strings.ContainsAny(host, ":/") {
		return ""
	}
	if apex, ok := strings.CutPrefix(host, "www."); ok {
		if strings.Contains(apex, ".") {
			return "https://" + apex
		}
		return ""
	}
	if !strings.Contains(host, ".") || net.ParseIP(host) != nil {
		return ""
	}
	return "https://www." + host
}

// refreshCookieCrossSite reports whether a request carrying the refresh cookie
// was sent by a page outside the allowed origins. The cookie is SameSite=None,
// so without this any site could make the browser refresh or log out the user.
// The web app reaches the API through its own same-origin proxy, so any page
// the browser marks same-origin or same-site is trusted whatever host served it;
// otherwise Origin must be allowlisted. Clients that send neither header are not
// browsers and hold the token themselves.
func (s *Server) refreshCookieCrossSite(r *http.Request) bool {
	if c, err := r.Cookie(refreshCookieName); err != nil || c.Value == "" {
		return false
	}
	switch r.Header.Get("Sec-Fetch-Site") {
	case "same-origin", "same-site":
		return false
	}
	if origin := r.Header.Get("Origin"); origin != "" {
		return !s.allowedOrigins[origin]
	}
	return r.Header.Get("Sec-Fetch-Site") == "cross-site"
}
