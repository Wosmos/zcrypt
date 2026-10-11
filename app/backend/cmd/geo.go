package cmd

import (
	"encoding/json"
	"net/http"
	"strings"
)

// HandleGeoCountry reports the visitor's country as seen by the edge in front
// of the backend (Cloudflare's CF-IPCountry, or Vercel's header when a request
// arrives through the site's /api proxy). The client only uses it to suggest a
// language, so a spoofed header costs nothing; the IP itself is never logged
// or returned.
// GET /api/geo/country
func (s *Server) HandleGeoCountry(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	_ = json.NewEncoder(w).Encode(map[string]string{"country": visitorCountry(r)})
}

func visitorCountry(r *http.Request) string {
	for _, h := range []string{"CF-IPCountry", "X-Vercel-IP-Country"} {
		c := strings.ToUpper(strings.TrimSpace(r.Header.Get(h)))
		if len(c) == 2 && c[0] >= 'A' && c[0] <= 'Z' && c[1] >= 'A' && c[1] <= 'Z' && c != "XX" && c != "T1" {
			return c
		}
	}
	return ""
}
