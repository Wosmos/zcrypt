package cmd

import "net/http"

// decoyRule says how an authenticated route answers a decoy (duress) session.
// pass hands the request to a handler that reads IsDecoy itself or never
// touches vault data. Otherwise the canned body is written with status 200, so
// the app renders an ordinary, sparse account instead of an error page.
type decoyRule struct {
	pass bool
	body string
}

var decoyPass = decoyRule{pass: true}

func decoyEmpty(body string) decoyRule { return decoyRule{body: body} }

// decoyRoutes is the allowlist for decoy sessions, keyed by the exact
// RegisterRoutes pattern. Every authenticated route missing from it is denied
// (404 for reads, 403 for writes) before its handler runs, so a new route is
// isolated by default and only opens up by being listed here.
var decoyRoutes = map[string]decoyRule{
	"GET /api/auth/me":                  decoyPass,
	"GET /api/auth/activity":            decoyPass,
	"GET /api/files":                    decoyPass,
	"PATCH /api/files/{id}/name":        decoyPass,
	"GET /api/quota":                    decoyPass,
	"GET /api/platforms/status":         decoyPass,
	"GET /api/config":                   decoyPass,
	"GET /api/preferences":              decoyPass,
	"PUT /api/preferences":              decoyPass,
	"GET /api/analytics/summary":        decoyPass,
	"GET /api/analytics/timeseries":     decoyPass,
	"GET /api/analytics/storage-growth": decoyPass,
	"GET /api/analytics/file-types":     decoyPass,
	"POST /api/sse/ticket":              decoyPass,
	"GET /api/folders":                  decoyEmpty(`[]`),
	"GET /api/folders/tree":             decoyEmpty(`[]`),
	"GET /api/files/trash":              decoyEmpty(`[]`),
	"GET /api/shares":                   decoyEmpty(`[]`),
	"GET /api/folder-shares":            decoyEmpty(`[]`),
	"GET /api/notes":                    decoyEmpty(`[]`),
	"GET /api/vaults":                   decoyEmpty(`[]`),
	"GET /api/snapshots":                decoyEmpty(`[]`),
	"GET /api/integrity":                decoyEmpty(`[]`),
	"GET /api/integrity/changes":        decoyEmpty(`[]`),
	"GET /api/clipboard":                decoyEmpty(`[]`),
	"GET /api/sync/folders":             decoyEmpty(`[]`),
	"GET /api/offline":                  decoyEmpty(`[]`),
	"GET /api/shared-vaults":            decoyEmpty(`[]`),
	"GET /api/repos":                    decoyEmpty(`[]`),
	"GET /api/decoy/files":              decoyEmpty(`[]`),
	"GET /api/upload/incomplete":        decoyEmpty(`{"uploads":[]}`),
	"GET /api/changes":                  decoyEmpty(`{"changes":[],"cursor":0}`),
	"GET /api/auth/linked-accounts":     decoyEmpty(`{"providers":[],"has_password":true}`),
	"GET /api/feedback/status":          decoyEmpty(`{"submitted":false}`),
	"GET /api/reviews/me":               decoyEmpty(`{"review":null}`),
	"GET /api/deadman":                  decoyEmpty(`{"configured":false}`),
	"GET /api/decoy":                    decoyEmpty(`{"configured":false,"enabled":false,"file_count":0}`),
	"GET /api/keys/me":                  decoyEmpty(`null`),
	"POST /api/onboarding/complete":     decoyEmpty(`{"success":true}`),
	"POST /api/deadman/checkin":         decoyEmpty(`{"success":true}`),
}

// decoyGate enforces decoyRoutes for decoy sessions and is a no-op otherwise.
func decoyGate(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !IsDecoy(r) {
			next.ServeHTTP(w, r)
			return
		}
		rule, ok := decoyRoutes[r.Pattern]
		switch {
		case ok && rule.pass:
			next.ServeHTTP(w, r)
		case ok && rule.body != "":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(rule.body))
		case r.Method == http.MethodGet:
			writeError(w, http.StatusNotFound, "not found")
		default:
			writeError(w, http.StatusForbidden, "forbidden")
		}
	}
}
