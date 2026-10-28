package cmd

import (
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/geoip"
	"github.com/zcrypt/zcrypt/types"
)

func TestVisitorCountry(t *testing.T) {
	cases := []struct {
		headers map[string]string
		want    string
	}{
		{map[string]string{"CF-IPCountry": "ae"}, "AE"},
		{map[string]string{"X-Vercel-IP-Country": "PK"}, "PK"},
		{map[string]string{"CF-IPCountry": "US", "X-Vercel-IP-Country": "DE"}, "DE"},
		{map[string]string{"CF-IPCountry": "DE", "X-Vercel-IP-Country": "zz1"}, "DE"},
		{map[string]string{"CF-IPCountry": "XX"}, ""},
		{map[string]string{"CF-IPCountry": "T1"}, ""},
		{map[string]string{"CF-IPCountry": "<script>"}, ""},
		{map[string]string{}, ""},
	}
	for _, c := range cases {
		r := httptest.NewRequest("GET", "/api/geo/country", nil)
		for k, v := range c.headers {
			r.Header.Set(k, v)
		}
		if got := visitorCountry(r); got != c.want {
			t.Errorf("headers %v: got %q, want %q", c.headers, got, c.want)
		}
	}
}

func TestVisitorLocation(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("X-Vercel-IP-Country", "br")
	r.Header.Set("X-Vercel-IP-Country-Region", " SP ")
	r.Header.Set("X-Vercel-IP-City", "S%C3%A3o%20Paulo")
	got := edgeLocation(r)
	if got.Country != "BR" || got.Region != "SP" || got.City != "São Paulo" {
		t.Fatalf("got %+v", got)
	}

	r = httptest.NewRequest("GET", "/", nil)
	r.Header.Set("CF-IPCountry", "DE")
	r.Header.Set("CF-Region", "Berlin")
	r.Header.Set("CF-IPCity", "Ber\x01lin\tMitte")
	got = edgeLocation(r)
	if got.Country != "DE" || got.Region != "Berlin" || got.City != "Berlin Mitte" {
		t.Fatalf("cloudflare: got %+v", got)
	}

	if got := edgeLocation(httptest.NewRequest("GET", "/", nil)); got != (types.GeoLocation{}) {
		t.Fatalf("no headers: got %+v", got)
	}
}

func TestCleanGeoText(t *testing.T) {
	long := strings.Repeat("a", 100)
	cases := []struct{ in, want string }{
		{"", ""},
		{"  Lahore  ", "Lahore"},
		{"%E0%A4", ""},
		{"bad%zzescape", "bad%zzescape"},
		{"New\nYork", "New York"},
		{long, strings.Repeat("a", maxCityRunes)},
		{"\xff\xfe", ""},
	}
	for _, c := range cases {
		if got := cleanGeoText(c.in, maxCityRunes); got != c.want {
			t.Errorf("cleanGeoText(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestHeaderIP(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("X-Real-IP", " 203.0.113.9 ")
	if got := headerIP(r, "X-Real-IP"); got != "203.0.113.9" {
		t.Errorf("headerIP = %q", got)
	}
	if got := headerIP(r, ""); got != "" {
		t.Errorf("headerIP with no header configured = %q", got)
	}
	r.Header.Set("X-Real-IP", "not-an-ip")
	if got := headerIP(r, "X-Real-IP"); got != "" {
		t.Errorf("headerIP of garbage = %q", got)
	}
}

func TestServerClientIPPrefersEdgeHeader(t *testing.T) {
	s := &Server{cfg: &config.Config{ClientIPHeader: "X-Real-IP", TrustedProxyCount: 1}}
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "100.64.0.2:5000"
	r.Header.Set("X-Forwarded-For", "203.0.113.9, 152.233.68.98")
	r.Header.Set("X-Real-IP", "203.0.113.9")
	if got := s.clientIP(r); got != "203.0.113.9" {
		t.Errorf("clientIP = %q, want the X-Real-IP address", got)
	}
	r.Header.Del("X-Real-IP")
	if got := s.clientIP(r); got != "152.233.68.98" {
		t.Errorf("clientIP without header = %q, want the hop-count answer", got)
	}
}

func TestFirstForwarded(t *testing.T) {
	for in, want := range map[string]string{
		"":                         "",
		"203.0.113.9":              "203.0.113.9",
		" 203.0.113.9 , 10.0.0.1 ": "203.0.113.9",
		"junk, 203.0.113.9":        "",
	} {
		if got := firstForwarded(in); got != want {
			t.Errorf("firstForwarded(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestServerVisitorLocation(t *testing.T) {
	s := &Server{cfg: &config.Config{ClientIPHeader: "X-Real-IP"}}

	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("X-Vercel-IP-Country", "PK")
	r.Header.Set("X-Real-IP", "8.8.8.8")
	if got := s.visitorLocation(r); got.Country != "PK" {
		t.Errorf("edge header ignored: %+v", got)
	}

	r = httptest.NewRequest("GET", "/", nil)
	r.Header.Set("X-Real-IP", "8.8.8.8")
	if got := s.visitorLocation(r); got != (types.GeoLocation{}) {
		t.Errorf("no database should place nothing, got %+v", got)
	}

	path := os.Getenv("GEOIP_TEST_DB")
	if path == "" {
		t.Skip("GEOIP_TEST_DB not set")
	}
	db, err := geoip.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()
	s.geo = db

	if got := s.visitorLocation(r); got.Country != "US" {
		t.Errorf("8.8.8.8 placed in %+v, want US", got)
	}
	r.Header.Set("X-Vercel-Forwarded-For", "1.1.1.1")
	via := s.visitorLocation(r)
	direct := s.geo.Lookup("1.1.1.1")
	if via.Country != direct.Country {
		t.Errorf("proxied request placed in %+v, want %+v", via, direct)
	}
}
