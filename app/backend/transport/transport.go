// Package transport holds the shared transfer rule: a request fails only after
// IdleTimeout with no bytes moving, never for taking long overall.
package transport

import (
	"context"
	"errors"
	"io"
	"math/rand"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	IdleTimeout    = 60 * time.Second
	ConnectTimeout = 10 * time.Second
	ControlTimeout = 30 * time.Second
)

// StalledError reports that no bytes moved for the idle limit.
type StalledError struct{ Limit time.Duration }

func (e *StalledError) Error() string {
	return "stalled: no bytes moved for " + e.Limit.String()
}

func (e *StalledError) Timeout() bool   { return true }
func (e *StalledError) Temporary() bool { return true }

// IsStalled reports whether err came from the idle rule.
func IsStalled(err error) bool {
	var s *StalledError
	return errors.As(err, &s)
}

// Control bounds a small JSON control call by ControlTimeout in total.
func Control(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, ControlTimeout)
}

type guard struct {
	mu     sync.Mutex
	timer  *time.Timer
	limit  time.Duration
	cancel context.CancelCauseFunc
	done   bool
}

func newGuard(ctx context.Context, limit time.Duration, onStall func()) (context.Context, *guard) {
	ctx, cancel := context.WithCancelCause(ctx)
	g := &guard{limit: limit, cancel: cancel}
	g.timer = time.AfterFunc(limit, func() {
		cancel(&StalledError{Limit: limit})
		if onStall != nil {
			onStall()
		}
	})
	return ctx, g
}

func (g *guard) touch() {
	g.mu.Lock()
	if !g.done {
		g.timer.Reset(g.limit)
	}
	g.mu.Unlock()
}

func (g *guard) finish() {
	g.mu.Lock()
	g.done = true
	g.timer.Stop()
	g.mu.Unlock()
	g.cancel(context.Canceled)
}

type idleBody struct {
	g      *guard
	ctx    context.Context
	r      io.ReadCloser
	finish bool
}

func (b *idleBody) Read(p []byte) (int, error) {
	n, err := b.r.Read(p)
	if n > 0 {
		b.g.touch()
	}
	if err != nil {
		if err == io.EOF {
			b.g.touch()
			if b.finish {
				b.g.finish()
			}
			return n, err
		}
		return n, causeOr(b.ctx, err)
	}
	return n, nil
}

func (b *idleBody) Close() error {
	err := b.r.Close()
	if b.finish {
		b.g.finish()
	}
	return err
}

func causeOr(ctx context.Context, err error) error {
	var s *StalledError
	if c := context.Cause(ctx); errors.As(c, &s) {
		return s
	}
	return err
}

type idleTripper struct {
	base http.RoundTripper
	idle time.Duration
}

func (t *idleTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	var onStall func()
	if req.Body != nil && req.Body != http.NoBody {
		body := req.Body
		onStall = func() { _ = body.Close() }
	}
	ctx, g := newGuard(req.Context(), t.idle, onStall)
	out := req.Clone(ctx)
	if req.Body != nil && req.Body != http.NoBody {
		out.Body = &idleBody{g: g, ctx: ctx, r: req.Body}
		if req.GetBody != nil {
			get := req.GetBody
			out.GetBody = func() (io.ReadCloser, error) {
				rc, err := get()
				if err != nil {
					return nil, err
				}
				return &idleBody{g: g, ctx: ctx, r: rc}, nil
			}
		}
	}
	resp, err := t.base.RoundTrip(out)
	if err != nil {
		g.finish()
		return nil, causeOr(ctx, err)
	}
	g.touch()
	resp.Body = &idleBody{g: g, ctx: ctx, r: resp.Body, finish: true}
	return resp, nil
}

// NewTransport returns a round tripper that applies the idle rule to request
// and response bodies of every call.
func NewTransport(idle time.Duration) http.RoundTripper {
	base := &http.Transport{
		Proxy:               http.ProxyFromEnvironment,
		TLSHandshakeTimeout: ConnectTimeout,
		DialContext: (&net.Dialer{
			Timeout:   ConnectTimeout,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:        10,
		IdleConnTimeout:     90 * time.Second,
		MaxIdleConnsPerHost: 4,
	}
	return Wrap(base, idle)
}

// Wrap applies the idle rule on top of any round tripper.
func Wrap(base http.RoundTripper, idle time.Duration) http.RoundTripper {
	return &idleTripper{base: base, idle: idle}
}

// NewClient returns an http.Client with no overall timeout and the idle rule.
func NewClient(idle time.Duration) *http.Client {
	return &http.Client{Transport: NewTransport(idle)}
}

// Retryable reports whether an HTTP status deserves a retry.
func Retryable(status int) bool {
	return status == http.StatusRequestTimeout || status == http.StatusTooManyRequests || status >= 500
}

// Backoff is exponential backoff with jitter: base<<attempt capped at max, then
// a random point in its upper half.
func Backoff(attempt int, base, max time.Duration) time.Duration {
	if attempt > 16 {
		attempt = 16
	}
	d := base << uint(attempt)
	if d > max || d <= 0 {
		d = max
	}
	return d/2 + time.Duration(rand.Int63n(int64(d/2)+1))
}

// RetryAfter is the longer of delay and a Retry-After header in seconds,
// capped at 5 minutes.
func RetryAfter(delay time.Duration, h http.Header) time.Duration {
	s, err := strconv.Atoi(strings.TrimSpace(h.Get("Retry-After")))
	if err != nil || s <= 0 {
		return delay
	}
	if s > 300 {
		s = 300
	}
	if d := time.Duration(s) * time.Second; d > delay {
		return d
	}
	return delay
}

// NewControlClient is for small JSON calls: same idle rule plus a short total
// timeout that also covers reading the body.
func NewControlClient(idle time.Duration) *http.Client {
	return &http.Client{Transport: NewTransport(idle), Timeout: ControlTimeout}
}
