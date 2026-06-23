package cmd

import (
	"net"
	"net/http"
	"strings"
)

// clientIP returns the client's IP address, honoring X-Forwarded-For only for
// the configured number of trusted proxy hops.
//
// X-Forwarded-For is client-controllable: anything to the left of the entry
// added by your own proxy is attacker-supplied. Reading the left-most ("first")
// value — as the old extractors did — lets a client spoof its IP and get a
// fresh bucket on every IP-keyed rate limiter. Instead we count trustedHops in
// from the right of [XFF..., RemoteAddr], which is the boundary your trusted
// proxies actually control.
//
// trustedHops <= 0 ignores forwarding headers entirely and uses the direct TCP
// peer — secure by default. This assumes the app is only reachable through the
// trusted proxies; if it is also exposed directly, a non-zero count would let a
// direct caller forge the headers, so set the count to match real infra.
func clientIP(r *http.Request, trustedHops int) string {
	peer := hostOnly(r.RemoteAddr)
	if trustedHops <= 0 {
		return peer
	}

	var chain []string
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		for _, p := range strings.Split(xff, ",") {
			if ip := strings.TrimSpace(p); ip != "" {
				chain = append(chain, ip)
			}
		}
	}
	// Full path, left = original client ... right = the proxy that connected to us.
	chain = append(chain, peer)

	// Trust the right-most trustedHops entries; the client is the next one left.
	idx := len(chain) - 1 - trustedHops
	if idx < 0 {
		// Fewer hops present than configured (misconfig or truncated headers).
		// Fall back to the direct peer — never an attacker-supplied left entry.
		return peer
	}
	return chain[idx]
}

// hostOnly strips the port from a host:port address, leaving the bare IP.
func hostOnly(addr string) string {
	if host, _, err := net.SplitHostPort(addr); err == nil {
		return host
	}
	return addr
}

// clientIP resolves the request's client IP using the server's configured
// trusted-proxy count. Use this everywhere a client IP is needed (rate-limit
// keys, audit logs) so the trust boundary is applied consistently.
func (s *Server) clientIP(r *http.Request) string {
	return clientIP(r, s.cfg.TrustedProxyCount)
}
