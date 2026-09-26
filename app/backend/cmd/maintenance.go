package cmd

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"
)

// maintenanceToggleRequest is the body of POST /api/internal/maintenance.
type maintenanceToggleRequest struct {
	Enabled bool `json:"enabled"`
}

// HandleMaintenanceToggle flips maintenanceMode on/off. Authenticated by a
// static shared secret (X-Maintenance-Secret), not JWT: the rotation script
// that calls this has no admin session to spend, and the freeze window needs
// to start/end in a single fast HTTP call, not a login flow. Disabled by
// default: an empty MaintenanceSecret rejects every call, so this endpoint is
// inert unless an environment deliberately opts in.
func (s *Server) HandleMaintenanceToggle(w http.ResponseWriter, r *http.Request) {
	if s.cfg.MaintenanceSecret == "" {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	got := r.Header.Get("X-Maintenance-Secret")
	if subtle.ConstantTimeCompare([]byte(got), []byte(s.cfg.MaintenanceSecret)) != 1 {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	var req maintenanceToggleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	s.maintenanceMode.Store(req.Enabled)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"maintenance": req.Enabled})
}

// InMaintenanceMode reports the current maintenance-mode flag, read by the
// top-level maintenanceGate wrapper in main.go.
func (s *Server) InMaintenanceMode() bool {
	return s.maintenanceMode.Load()
}

// MaintenanceGate wraps next with the maintenance-mode 503 check: while
// maintenanceMode is set, every request except GET/HEAD/OPTIONS and the
// paths in maintenancePassthroughPaths gets rejected so writes stop cleanly
// during a Neon rotation's dump→cutover window (docs/DB_SCALING_100_PROJECTS.md
// §6.1). Reads still pass through: a read-only freeze is enough to guarantee
// no write lands on the old project after the dump snapshot, and blocking
// reads too would turn a rotation into a full outage for no extra safety.
func (s *Server) MaintenanceGate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.maintenanceMode.Load() || maintenancePassthroughPaths[r.URL.Path] {
			next.ServeHTTP(w, r)
			return
		}
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Retry-After", "30")
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`{"error":"database rotation in progress, please retry shortly"}`))
	})
}
