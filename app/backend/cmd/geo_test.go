package cmd

import (
	"net/http/httptest"
	"testing"
)

func TestVisitorCountry(t *testing.T) {
	cases := []struct {
		headers map[string]string
		want    string
	}{
		{map[string]string{"CF-IPCountry": "ae"}, "AE"},
		{map[string]string{"X-Vercel-IP-Country": "PK"}, "PK"},
		{map[string]string{"CF-IPCountry": "DE", "X-Vercel-IP-Country": "US"}, "DE"},
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
