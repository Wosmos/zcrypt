package cmd

import (
	"log"
	"net/http"
	"regexp"
	"strings"

	"github.com/zcrypt/zcrypt/types"
)

// ClientHeader names the app that sent a request: "web/0.2.3",
// "desktop-windows/0.2.3", "android/0.2.3". The web app, the desktop and
// Android webviews and the Rust engine all send it, so a session can be held to
// the kind of app that started it.
const ClientHeader = "X-Zcrypt-Client"

var clientMarkerPattern = regexp.MustCompile(`^[a-z][a-z0-9-]{1,31}/[0-9A-Za-z.+-]{1,24}$`)

// clientPlatforms are the apps zcrypt ships. Anything else is not a client we
// know, and is treated like a request that named none.
var clientPlatforms = map[string]string{
	"web":             "Web",
	"desktop-macos":   "Mac app",
	"desktop-windows": "Windows app",
	"desktop-linux":   "Linux app",
	"android":         "Android app",
}

// clientMarker returns the request's client marker, or "" when it sent none or
// one that is malformed or names an app zcrypt does not ship.
func clientMarker(r *http.Request) string {
	m := strings.TrimSpace(r.Header.Get(ClientHeader))
	if !clientMarkerPattern.MatchString(m) {
		return ""
	}
	if _, ok := clientPlatforms[clientPlatform(m)]; !ok {
		return ""
	}
	return m
}

// clientPlatform is the app part of a marker ("desktop-windows" for
// "desktop-windows/0.2.3").
func clientPlatform(marker string) string {
	p, _, _ := strings.Cut(marker, "/")
	return p
}

// isNativeClient reports a request from the desktop or Android app.
func isNativeClient(r *http.Request) bool {
	p := clientPlatform(clientMarker(r))
	return p != "" && p != "web"
}

// clientLabel describes a marker for the admin console: "Windows app 0.2.3".
func clientLabel(marker string) string {
	p, v, _ := strings.Cut(marker, "/")
	name, ok := clientPlatforms[p]
	if !ok {
		return ""
	}
	return name + " " + v
}

// endSwappedSession ends a session when a refresh comes from a different kind
// of app than the one that started it: a web sign-in driven on by a script, or
// a desktop session's token copied into another program. The legitimate apps
// always send the same marker for the life of a session (the desktop webview
// and its Rust engine both say desktop-<os>), so only a copied token trips it.
// A session from before the marker existed has none; its next refresh records
// one and the binding starts from there. Reports whether it answered.
func (s *Server) endSwappedSession(w http.ResponseWriter, r *http.Request, rt *types.RefreshToken) bool {
	started := clientPlatform(rt.Client)
	if started == "" {
		return false
	}
	now := clientPlatform(clientMarker(r))
	if now == started {
		return false
	}
	ctx := r.Context()
	if _, err := s.db.DeleteSession(ctx, rt.UserID, rt.SessionID); err != nil {
		internalError(w, "end swapped session", err)
		return true
	}
	s.revokeSessionIDs(rt.UserID, rt.SessionID)
	userID := rt.UserID
	s.audit(r, &userID, types.AuditSessionClientChanged, map[string]interface{}{
		"started_with": started,
		"refreshed_by": now,
	})
	log.Printf("security: session %s of user %s ended: started on %q, refreshed by %q", logSafe(rt.SessionID), logSafe(rt.UserID), started, logSafe(now)) // #nosec G706 -- control chars stripped via logSafe
	clearRefreshCookie(w, s.cfg.RefreshCookieDomain())
	writeJSON(w, http.StatusUnauthorized, map[string]string{
		"error": "This sign-in was used from a different app, so it was ended. Sign in again.",
		"code":  "session_client_changed",
	})
	return true
}
