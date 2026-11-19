package cmd

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func shortServer(h http.Handler) *httptest.Server {
	srv := httptest.NewUnstartedServer(h)
	srv.Config.ReadTimeout = 250 * time.Millisecond
	srv.Config.WriteTimeout = 250 * time.Millisecond
	srv.Start()
	return srv
}

type trickleBody struct{ n int }

func (b *trickleBody) Read(p []byte) (int, error) {
	if b.n == 0 {
		return 0, io.EOF
	}
	b.n--
	time.Sleep(100 * time.Millisecond)
	p[0] = 'u'
	return 1, nil
}

func setStreamIdle(t *testing.T, idle, window time.Duration) {
	oi, ow := streamIdle, streamResponseWindow
	streamIdle, streamResponseWindow = idle, window
	t.Cleanup(func() { streamIdle, streamResponseWindow = oi, ow })
}

func echoLen(w http.ResponseWriter, r *http.Request) {
	b, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	_, _ = w.Write([]byte{byte(len(b) & 0xff)})
}

func TestSlowChunkUploadSurvivesFlatServerReadTimeout(t *testing.T) {
	setStreamIdle(t, 400*time.Millisecond, time.Second)
	flat := shortServer(http.HandlerFunc(echoLen))
	defer flat.Close()
	ext := shortServer(idleStream(echoLen))
	defer ext.Close()

	do := func(url string) (int, error) {
		req, _ := http.NewRequest("PUT", url, &trickleBody{n: 8})
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return 0, err
		}
		defer func() { _ = resp.Body.Close() }()
		return resp.StatusCode, nil
	}
	if code, err := do(flat.URL); err == nil && code == 200 {
		t.Fatal("control: the flat server limit should cut a slow upload")
	}
	if code, err := do(ext.URL); err != nil || code != 200 {
		t.Fatalf("idle-extended upload: code %d err %v", code, err)
	}
}

func TestSlowChunkDownloadSurvivesFlatServerWriteTimeout(t *testing.T) {
	setStreamIdle(t, 400*time.Millisecond, time.Second)
	send := func(w http.ResponseWriter, _ *http.Request) {
		for i := 0; i < 8; i++ {
			_, _ = w.Write([]byte("x"))
			w.(http.Flusher).Flush()
			time.Sleep(100 * time.Millisecond)
		}
	}
	read := func(url string) int {
		resp, err := http.Get(url) //nolint:gosec // url is the local test server
		if err != nil {
			return 0
		}
		defer func() { _ = resp.Body.Close() }()
		b, _ := io.ReadAll(resp.Body)
		return len(b)
	}
	flat := shortServer(http.HandlerFunc(send))
	defer flat.Close()
	ext := shortServer(idleStream(send))
	defer ext.Close()
	if n := read(flat.URL); n == 8 {
		t.Fatal("control: the flat server limit should cut a slow download")
	}
	if n := read(ext.URL); n != 8 {
		t.Fatalf("idle-extended download delivered %d of 8 bytes", n)
	}
}

func TestStalledChunkUploadIsCutNearIdleLimit(t *testing.T) {
	setStreamIdle(t, 200*time.Millisecond, time.Second)
	srv := httptest.NewServer(idleStream(echoLen))
	defer srv.Close()
	pr, pw := io.Pipe()
	defer func() { _ = pw.Close() }()
	go func() { _, _ = pw.Write([]byte("a")) }()
	req, _ := http.NewRequest("PUT", srv.URL, pr)
	start := time.Now()
	resp, err := http.DefaultClient.Do(req)
	if err == nil {
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode == http.StatusOK {
			t.Fatal("stalled upload must not succeed")
		}
	}
	if time.Since(start) > 3*time.Second {
		t.Fatalf("took %v", time.Since(start))
	}
}

func TestSlowGetKeepsRequestContextPastIdleWindow(t *testing.T) {
	setStreamIdle(t, 150*time.Millisecond, 5*time.Second)
	slow := func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
			http.Error(w, "context canceled", http.StatusServiceUnavailable)
		case <-time.After(500 * time.Millisecond):
			_, _ = w.Write([]byte("ok"))
		}
	}
	srv := httptest.NewServer(idleStream(slow))
	defer srv.Close()

	resp, err := http.Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d: a GET working longer than the idle window lost its context", resp.StatusCode)
	}
}

func TestUploadBodyDeadlineClearsAfterEOF(t *testing.T) {
	setStreamIdle(t, 150*time.Millisecond, 5*time.Second)
	h := func(w http.ResponseWriter, r *http.Request) {
		if _, err := io.ReadAll(r.Body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		select {
		case <-r.Context().Done():
			http.Error(w, "context canceled", http.StatusServiceUnavailable)
		case <-time.After(500 * time.Millisecond):
			_, _ = w.Write([]byte("ok"))
		}
	}
	srv := httptest.NewServer(idleStream(h))
	defer srv.Close()

	req, _ := http.NewRequest("PUT", srv.URL, &trickleBody{n: 2})
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d: processing after the body ended lost its context", resp.StatusCode)
	}
}
