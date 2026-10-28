package cmd

import (
	"net/http/httptest"
	"strings"
	"testing"

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
	got := visitorLocation(r)
	if got.Country != "BR" || got.Region != "SP" || got.City != "São Paulo" {
		t.Fatalf("got %+v", got)
	}

	r = httptest.NewRequest("GET", "/", nil)
	r.Header.Set("CF-IPCountry", "DE")
	r.Header.Set("CF-Region", "Berlin")
	r.Header.Set("CF-IPCity", "Ber\x01lin\tMitte")
	got = visitorLocation(r)
	if got.Country != "DE" || got.Region != "Berlin" || got.City != "Berlin Mitte" {
		t.Fatalf("cloudflare: got %+v", got)
	}

	if got := visitorLocation(httptest.NewRequest("GET", "/", nil)); got != (types.GeoLocation{}) {
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
