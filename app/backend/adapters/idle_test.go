package adapters

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/zcrypt/zcrypt/transport"
	"github.com/zcrypt/zcrypt/types"
)

const testIdle = 150 * time.Millisecond

func redirectTo(srv *httptest.Server) rtFunc {
	u, _ := url.Parse(srv.URL)
	return func(r *http.Request) (*http.Response, error) {
		r2 := r.Clone(r.Context())
		r2.URL.Scheme, r2.URL.Host = u.Scheme, u.Host
		return http.DefaultTransport.RoundTrip(r2)
	}
}

func idleClient(srv *httptest.Server) *http.Client {
	return &http.Client{Transport: transport.Wrap(redirectTo(srv), testIdle)}
}

// 20 bytes at 40ms apart takes 800ms, far over the 150ms idle limit.
func trickleHandler(w http.ResponseWriter, r *http.Request) {
	f := w.(http.Flusher)
	w.WriteHeader(200)
	for i := 0; i < 20; i++ {
		_, _ = w.Write([]byte("x"))
		f.Flush()
		time.Sleep(40 * time.Millisecond)
	}
}

func stallHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(200)
	_, _ = w.Write([]byte("x"))
	w.(http.Flusher).Flush()
	select {
	case <-r.Context().Done():
	case <-time.After(5 * time.Second):
	}
}

type downloader interface {
	Download(context.Context, types.ChunkRef) ([]byte, error)
}

func checkIdleDownload(t *testing.T, mk func(c *http.Client) downloader, ref types.ChunkRef) {
	t.Helper()
	slow := httptest.NewServer(http.HandlerFunc(trickleHandler))
	defer slow.Close()
	data, err := mk(idleClient(slow)).Download(context.Background(), ref)
	if err != nil || len(data) != 20 {
		t.Fatalf("slow but moving download: %d bytes, err %v", len(data), err)
	}

	stuck := httptest.NewServer(http.HandlerFunc(stallHandler))
	defer stuck.Close()
	start := time.Now()
	_, err = mk(idleClient(stuck)).Download(context.Background(), ref)
	if !transport.IsStalled(err) && !strings.Contains(strings.ToLower(errString(err)), "stalled") {
		t.Fatalf("stalled download: want stalled error, got %v", err)
	}
	if time.Since(start) > 2*time.Second {
		t.Fatalf("stalled download took %v", time.Since(start))
	}
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func TestGithubDownloadIdleRule(t *testing.T) {
	checkIdleDownload(t, func(c *http.Client) downloader {
		return &GithubAdapter{owner: "a", token: "t", raw: c}
	}, types.ChunkRef{Repo: "a/r", RemotePath: "02/x.bin"})
}

func TestGitlabDownloadIdleRule(t *testing.T) {
	checkIdleDownload(t, func(c *http.Client) downloader {
		return &GitlabAdapter{token: "t", client: c}
	}, types.ChunkRef{Repo: "a/r", RemotePath: "02/x.bin"})
}

func TestHuggingFaceDownloadIdleRule(t *testing.T) {
	checkIdleDownload(t, func(c *http.Client) downloader {
		return &HuggingFaceAdapter{token: "t", username: "a", client: c}
	}, types.ChunkRef{Repo: "a/r", RemotePath: "02/x.bin"})
}

func TestTelegramDownloadIdleRule(t *testing.T) {
	mk := func(h http.HandlerFunc) (*TelegramAdapter, func()) {
		mux := http.NewServeMux()
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			if strings.HasSuffix(r.URL.Path, "/getFile") {
				_, _ = w.Write([]byte(`{"ok":true,"result":{"file_path":"documents/x"}}`))
				return
			}
			h(w, r)
		})
		srv := httptest.NewServer(mux)
		return &TelegramAdapter{botToken: "T", chatID: "1", apiBase: srv.URL,
			client: &http.Client{Transport: transport.Wrap(http.DefaultTransport, testIdle)}}, srv.Close
	}
	ref := types.ChunkRef{RemotePath: "1:A"}

	slow, closeSlow := mk(trickleHandler)
	defer closeSlow()
	data, err := slow.Download(context.Background(), ref)
	if err != nil || len(data) != 20 {
		t.Fatalf("slow but moving download: %d bytes, err %v", len(data), err)
	}

	stuck, closeStuck := mk(stallHandler)
	defer closeStuck()
	start := time.Now()
	_, err = stuck.Download(context.Background(), ref)
	if err == nil || !strings.Contains(err.Error(), "stalled") {
		t.Fatalf("want stalled error, got %v", err)
	}
	if time.Since(start) > 2*time.Second {
		t.Fatalf("took %v", time.Since(start))
	}
}

func TestGitlabUploadSlowBodySucceedsAndRetriesTransient(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&calls, 1) == 1 {
			http.Error(w, "boom", http.StatusServiceUnavailable)
			return
		}
		time.Sleep(300 * time.Millisecond)
		_, _ = w.Write([]byte(`{"file_path":"02/x.bin"}`))
	}))
	defer srv.Close()
	g := &GitlabAdapter{token: "t", client: &http.Client{Transport: transport.Wrap(redirectTo(srv), 2*time.Second)}}
	ref, err := g.Upload(context.Background(), "a/r", types.Chunk{Ref: types.ChunkRef{RemotePath: "02/x.bin"}, Data: []byte("d")})
	if err != nil || ref.RemotePath != "02/x.bin" {
		t.Fatalf("upload: %v %v", ref, err)
	}
	if atomic.LoadInt32(&calls) != 2 {
		t.Fatalf("calls = %d, want 2 (one retry on 503)", calls)
	}
}

func TestGitlabUploadStalledServerFails(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(5 * time.Second):
		}
	}))
	defer srv.Close()
	g := &GitlabAdapter{token: "t", client: idleClient(srv)}
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	_, err := g.Upload(ctx, "a/r", types.Chunk{Data: []byte("d")})
	if err == nil {
		t.Fatal("expected failure")
	}
}

func TestTelegramMissingFileMapsToErrNotFound(t *testing.T) {
	for _, status := range []int{http.StatusBadRequest, http.StatusNotFound} {
		tg := newTelegramTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(status)
			_, _ = w.Write([]byte(`{"ok":false,"error_code":400,"description":"Bad Request: wrong file_id or the file is temporarily unavailable"}`))
		})
		_, err := tg.Download(context.Background(), types.ChunkRef{RemotePath: "1:A"})
		if !isNotFound(err) {
			t.Fatalf("status %d: want ErrNotFound, got %v", status, err)
		}
	}
}

func TestTelegramAuthFailureIsNotErrNotFound(t *testing.T) {
	tg := newTelegramTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"ok":false,"error_code":401,"description":"Unauthorized"}`))
	})
	_, err := tg.Download(context.Background(), types.ChunkRef{RemotePath: "1:A"})
	if err == nil || isNotFound(err) {
		t.Fatalf("got %v", err)
	}
}

func isNotFound(err error) bool { return errors.Is(err, ErrNotFound) }
