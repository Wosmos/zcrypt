package cmd

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/zcrypt/zcrypt/types"
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

// visitorCountry prefers Vercel's header: it is only present when the request
// came through the site's /api proxy (the desktop and Android apps), and then
// Cloudflare's header describes Vercel's egress, not the person.
func visitorCountry(r *http.Request) string {
	for _, h := range []string{"X-Vercel-IP-Country", "CF-IPCountry"} {
		if c := strings.ToUpper(strings.TrimSpace(r.Header.Get(h))); isCountryCode(c) {
			return c
		}
	}
	return ""
}

const (
	maxRegionRunes = 48
	maxCityRunes   = 64
)

// visitorLocation reports the country, region and city the edge attached to
// the request. Vercel URL-encodes the city; Cloudflare sends these only with
// its visitor-location transform enabled. Region and city are free text from
// a header, so they are decoded, stripped of control characters and capped
// before anything stores them.
func visitorLocation(r *http.Request) types.GeoLocation {
	return types.GeoLocation{
		Country: visitorCountry(r),
		Region:  geoHeader(r, maxRegionRunes, "X-Vercel-IP-Country-Region", "CF-Region-Code", "CF-Region"),
		City:    geoHeader(r, maxCityRunes, "X-Vercel-IP-City", "CF-IPCity"),
	}
}

func geoHeader(r *http.Request, limit int, names ...string) string {
	for _, h := range names {
		if v := cleanGeoText(r.Header.Get(h), limit); v != "" {
			return v
		}
	}
	return ""
}

func cleanGeoText(v string, limit int) string {
	if dec, err := url.PathUnescape(v); err == nil {
		v = dec
	}
	if !utf8.ValidString(v) {
		return ""
	}
	v = strings.Map(func(c rune) rune {
		if unicode.IsSpace(c) {
			return ' '
		}
		if unicode.IsControl(c) || c == unicode.ReplacementChar {
			return -1
		}
		return c
	}, v)
	v = strings.Join(strings.Fields(v), " ")
	if utf8.RuneCountInString(v) > limit {
		v = strings.TrimSpace(string([]rune(v)[:limit]))
	}
	return v
}

// isCountryCode reports whether c is an upper-case two-letter code that names
// a real place (not Cloudflare's XX unknown or T1 Tor markers).
func isCountryCode(c string) bool {
	return len(c) == 2 && c[0] >= 'A' && c[0] <= 'Z' && c[1] >= 'A' && c[1] <= 'Z' && c != "XX" && c != "T1"
}

// deviceLabel is describeUserAgent for a stored agent, empty when none was
// recorded.
func deviceLabel(ua string) string {
	if ua == "" {
		return ""
	}
	return describeUserAgent(ua)
}
