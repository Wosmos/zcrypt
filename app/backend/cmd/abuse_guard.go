package cmd

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"

	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/netguard"
	"github.com/zcrypt/zcrypt/types"
)

// TurnstileVerifyURL is Cloudflare's server-side check for a Turnstile token.
const TurnstileVerifyURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

func newNetGuard(cfg *config.Config) *netguard.Guard {
	var allow []netip.Prefix
	for _, c := range cfg.NetworkAllow {
		p, err := netip.ParsePrefix(c)
		if err != nil {
			if a, aerr := netip.ParseAddr(c); aerr == nil {
				p = netip.PrefixFrom(a, a.BitLen())
			} else {
				log.Printf("netguard: ignoring ZCRYPT_NETWORK_ALLOW entry %q: %v", logSafe(c), err) // #nosec G706 -- control chars stripped via logSafe
				continue
			}
		}
		allow = append(allow, p.Masked())
	}
	on := cfg.CloudNetworkMode == config.CloudNetworksBlock || cfg.CloudNetworkMode == config.CloudNetworksFlag
	return netguard.New(on, allow, netguard.DefaultSources)
}

// StartNetGuard loads the cloud network lists and keeps them fresh.
func (s *Server) StartNetGuard(ctx context.Context) {
	s.netGuard.Start(ctx)
}

// personIP is the address of the person behind a request. The site's /api
// proxy (Vercel, which the desktop and Android apps and the web session calls
// go through) reaches us from its own cloud address and names the person in
// X-Vercel-Forwarded-For, so that header is read when, and only when, the
// direct caller is on a cloud network. A home connection calling us directly
// can't use the header to look like anyone else.
func (s *Server) personIP(r *http.Request) string {
	ip := s.clientIP(r)
	if s.netGuard.Blocked(ip) {
		if fwd := firstForwarded(r.Header.Get("X-Vercel-Forwarded-For")); fwd != "" {
			return fwd
		}
	}
	return ip
}

// refuseCloudNetwork answers 403 when the person is on a cloud or data-center
// network and the mode is "block": sign-in is for people, not servers. In
// "flag" mode the request goes on and only the audit entry remains. Reports
// whether it answered.
func (s *Server) refuseCloudNetwork(w http.ResponseWriter, r *http.Request) bool {
	if !s.cloudNetworkRefused(r) {
		return false
	}
	writeJSON(w, http.StatusForbidden, map[string]string{
		"error": "zcrypt can't be used from cloud servers, data centers or VPNs that run on them. Turn off the VPN or proxy and try again.",
		"code":  "network_blocked",
	})
	return true
}

// cloudNetworkRefused records a request from a cloud network and reports
// whether it must be refused (mode "block") rather than only flagged.
func (s *Server) cloudNetworkRefused(r *http.Request) bool {
	ip := s.personIP(r)
	if !s.netGuard.Blocked(ip) {
		return false
	}
	refused := s.cfg.CloudNetworkMode != config.CloudNetworksFlag
	s.audit(r, nil, types.AuditNetworkBlocked, map[string]interface{}{
		"path":    r.URL.Path,
		"client":  clientPlatform(clientMarker(r)),
		"ip":      anonIP(ip),
		"refused": refused,
	})
	return refused
}

// refuseBot checks the Turnstile token a web form sent. It applies only when a
// Turnstile secret is configured and the request is not from the desktop or
// Android app, which have no Turnstile widget. Reports whether it answered.
func (s *Server) refuseBot(w http.ResponseWriter, r *http.Request, token string) bool {
	if s.cfg.TurnstileSecret == "" || isNativeClient(r) {
		return false
	}
	ok, err := s.verifyTurnstile(r.Context(), token, s.personIP(r))
	if err != nil {
		// Cloudflare unreachable: let the person in rather than lock everyone
		// out; rate limits and the cloud network block still apply.
		log.Printf("turnstile: verify failed, allowing: %v", err)
		return false
	}
	if ok {
		return false
	}
	writeJSON(w, http.StatusBadRequest, map[string]string{
		"error": "The check that you're a person didn't pass. Try again.",
		"code":  "bot_check_failed",
	})
	return true
}

func (s *Server) verifyTurnstile(ctx context.Context, token, ip string) (bool, error) {
	token = strings.TrimSpace(token)
	if token == "" || len(token) > 2048 {
		return false, nil
	}
	form := url.Values{"secret": {s.cfg.TurnstileSecret}, "response": {token}}
	if ip != "" {
		form.Set("remoteip", ip)
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	verifyURL := s.turnstileURL
	if verifyURL == "" {
		verifyURL = TurnstileVerifyURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, verifyURL, strings.NewReader(form.Encode()))
	if err != nil {
		return false, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return false, err
	}
	defer func() { _ = res.Body.Close() }()
	var out struct {
		Success bool `json:"success"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&out); err != nil {
		return false, err
	}
	return out.Success, nil
}
