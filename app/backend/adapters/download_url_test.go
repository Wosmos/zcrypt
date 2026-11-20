package adapters

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/zcrypt/zcrypt/types"
)

func hfRedirect(status int, location string) rtFunc {
	return func(r *http.Request) (*http.Response, error) {
		h := http.Header{}
		if location != "" {
			h.Set("Location", location)
		}
		return &http.Response{StatusCode: status, Header: h, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
	}
}

func TestHFDownloadURLReturnsTheSignedCDNLinkWithoutFollowingIt(t *testing.T) {
	var auth, path string
	h := newHFFake(func(r *http.Request) (*http.Response, error) {
		auth, path = r.Header.Get("Authorization"), r.URL.Path
		return hfRedirect(http.StatusFound, "https://us.aws.cdn.hf.co/xet-bridge-us/abc?X-Amz-Signature=s")(r)
	})
	got, exp, err := h.DownloadURL(context.Background(), types.ChunkRef{Repo: "repo", RemotePath: "a/b.bin"})
	if err != nil {
		t.Fatal(err)
	}
	if got != "https://us.aws.cdn.hf.co/xet-bridge-us/abc?X-Amz-Signature=s" || exp.IsZero() {
		t.Errorf("got %q, %v", got, exp)
	}
	if auth != "Bearer t" || path != "/alice/repo/resolve/main/a/b.bin" {
		t.Errorf("auth %q path %q", auth, path)
	}
}

func TestHFDownloadURLRefusesAnythingButAnHFCDNRedirect(t *testing.T) {
	for name, rt := range map[string]rtFunc{
		"inline 200":        hfRedirect(http.StatusOK, ""),
		"relative redirect": hfRedirect(http.StatusFound, "/api/resolve-cache/x"),
		"foreign host":      hfRedirect(http.StatusFound, "https://evil.example/x"),
		"lookalike host":    hfRedirect(http.StatusFound, "https://hf.co.evil.example/x"),
		"plain http":        hfRedirect(http.StatusFound, "http://us.aws.cdn.hf.co/x"),
	} {
		if _, _, err := newHFFake(rt).DownloadURL(context.Background(), types.ChunkRef{Repo: "u/r", RemotePath: "p"}); err == nil {
			t.Errorf("%s: want an error, got a link", name)
		}
	}
}

func TestHFDownloadURLReportsAMissingChunk(t *testing.T) {
	_, _, err := newHFFake(hfRedirect(http.StatusNotFound, "")).DownloadURL(context.Background(), types.ChunkRef{Repo: "u/r", RemotePath: "p"})
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}
