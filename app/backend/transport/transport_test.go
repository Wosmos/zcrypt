package transport

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func trickle(w http.ResponseWriter, n int, gap time.Duration) {
	f := w.(http.Flusher)
	w.WriteHeader(200)
	for i := 0; i < n; i++ {
		_, _ = w.Write([]byte("x"))
		f.Flush()
		time.Sleep(gap)
	}
}

func TestSlowButMovingDownloadSucceeds(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { trickle(w, 15, 20*time.Millisecond) }))
	defer srv.Close()
	c := NewClient(100 * time.Millisecond)
	start := time.Now()
	resp, err := c.Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	b, err := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if err != nil || len(b) != 15 {
		t.Fatalf("got %d bytes err %v", len(b), err)
	}
	if time.Since(start) < 250*time.Millisecond {
		t.Fatal("transfer should outlast the idle limit")
	}
}

func TestStalledDownloadFailsNearIdleLimit(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte("x"))
		w.(http.Flusher).Flush()
		select {
		case <-r.Context().Done():
		case <-time.After(5 * time.Second):
		}
	}))
	defer srv.Close()
	c := NewClient(150 * time.Millisecond)
	start := time.Now()
	resp, err := c.Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	_, err = io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if !IsStalled(err) {
		t.Fatalf("want stalled error, got %v", err)
	}
	if d := time.Since(start); d > 2*time.Second {
		t.Fatalf("took %v", d)
	}
}

func TestStalledHeadersFail(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(5 * time.Second):
		}
	}))
	defer srv.Close()
	c := NewClient(150 * time.Millisecond)
	_, err := c.Get(srv.URL)
	if !IsStalled(err) {
		t.Fatalf("want stalled error, got %v", err)
	}
}

type slowReader struct {
	n   int
	gap time.Duration
}

func (s *slowReader) Read(p []byte) (int, error) {
	if s.n == 0 {
		return 0, io.EOF
	}
	time.Sleep(s.gap)
	s.n--
	p[0] = 'y'
	return 1, nil
}

func TestSlowButMovingUploadSucceeds(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		_, _ = w.Write([]byte(strings.Repeat("o", len(b))))
	}))
	defer srv.Close()
	c := NewClient(100 * time.Millisecond)
	req, _ := http.NewRequest("POST", srv.URL, &slowReader{n: 15, gap: 20 * time.Millisecond})
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if len(b) != 15 {
		t.Fatalf("got %d", len(b))
	}
}

func TestStalledUploadFails(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) { _, _ = io.Copy(io.Discard, r.Body) }))
	defer srv.Close()
	c := NewClient(150 * time.Millisecond)
	pr, pw := io.Pipe()
	defer func() { _ = pw.Close() }()
	go func() { _, _ = pw.Write([]byte("a")) }()
	req, _ := http.NewRequest("POST", srv.URL, pr)
	start := time.Now()
	_, err := c.Do(req)
	if !IsStalled(err) {
		t.Fatalf("want stalled error, got %v", err)
	}
	if time.Since(start) > 2*time.Second {
		t.Fatal("too slow")
	}
}

func TestCallerCancelStillWorks(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) { <-r.Context().Done() }))
	defer srv.Close()
	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(50 * time.Millisecond); cancel() }()
	req, _ := http.NewRequestWithContext(ctx, "GET", srv.URL, nil)
	_, err := NewClient(10 * time.Second).Do(req)
	if err == nil || IsStalled(err) {
		t.Fatalf("got %v", err)
	}
}

func TestRetryable(t *testing.T) {
	for s, want := range map[int]bool{200: false, 400: false, 404: false, 408: true, 429: true, 500: true, 503: true} {
		if Retryable(s) != want {
			t.Errorf("%d", s)
		}
	}
}
