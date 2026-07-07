package adapters

import (
	"io"
	"net/http"
	"strings"
)

// rtFunc adapts a function to an http.RoundTripper so tests can inject a fake
// HTTP transport and return canned responses without any real network I/O.
type rtFunc func(*http.Request) (*http.Response, error)

func (f rtFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

// jsonResp builds an *http.Response with the given status code and body. Extra
// headers (e.g. a Link header for pagination) can be supplied via hdr.
func jsonResp(status int, body string, hdr http.Header) *http.Response {
	h := hdr
	if h == nil {
		h = http.Header{}
	}
	return &http.Response{
		StatusCode: status,
		Status:     http.StatusText(status),
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     h,
	}
}
