package cmd

import (
	"io"
	"net/http"
	"time"

	"github.com/zcrypt/zcrypt/transport"
)

// Chunk transfers use the idle rule instead of the server's flat read/write
// limits: a connection is cut only after streamIdle with no bytes moving, never
// for taking long overall.
var (
	streamIdle = transport.IdleTimeout
	// streamResponseWindow is how long the handler may work (fetching a chunk
	// from its platform, staging it) before its first response byte.
	streamResponseWindow = 5 * time.Minute
)

const streamWriteSlice = 64 * 1024

func idleStream(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rc := http.NewResponseController(w)
		_ = rc.SetWriteDeadline(time.Now().Add(streamResponseWindow))
		if r.Body != nil && r.Body != http.NoBody {
			_ = rc.SetReadDeadline(time.Now().Add(streamIdle))
			r.Body = &idleReadBody{ReadCloser: r.Body, rc: rc}
		} else {
			_ = rc.SetReadDeadline(time.Time{})
		}
		h(&idleWriter{ResponseWriter: w, rc: rc}, r)
	}
}

type idleReadBody struct {
	io.ReadCloser
	rc *http.ResponseController
	// done is set at EOF; the idle read deadline then no longer applies, or
	// the server's background reader would cancel the request context.
	done bool
}

func (b *idleReadBody) Read(p []byte) (int, error) {
	if b.done {
		return b.ReadCloser.Read(p)
	}
	now := time.Now()
	_ = b.rc.SetReadDeadline(now.Add(streamIdle))
	_ = b.rc.SetWriteDeadline(now.Add(streamResponseWindow))
	n, err := b.ReadCloser.Read(p)
	if err == io.EOF {
		b.done = true
		_ = b.rc.SetReadDeadline(time.Time{})
	}
	return n, err
}

type idleWriter struct {
	http.ResponseWriter
	rc *http.ResponseController
}

func (w *idleWriter) Write(p []byte) (int, error) {
	total := 0
	for {
		n := min(len(p), streamWriteSlice)
		_ = w.rc.SetWriteDeadline(time.Now().Add(streamIdle))
		m, err := w.ResponseWriter.Write(p[:n])
		total += m
		if err != nil || n == len(p) {
			return total, err
		}
		p = p[n:]
	}
}

func (w *idleWriter) Flush() { _ = w.rc.Flush() }

func (w *idleWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
