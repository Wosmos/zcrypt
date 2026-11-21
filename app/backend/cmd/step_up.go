package cmd

import (
	"log"
	"net/http"
	"time"

	"github.com/zcrypt/zcrypt/config"
)

// Step-up check for public links. Nobody is challenged until an account or a
// network makes links faster than a person would. Past that, the website must
// pass Turnstile; the apps, which have no widget, are asked to wait or use the
// website. Passing the check clears the account for stepUpClearedFor.
const (
	stepUpWindow        = time.Hour
	stepUpPerAccount    = 20
	stepUpPerNewAccount = 5
	stepUpPerIP         = 40
	stepUpNewAccountAge = 24 * time.Hour
	stepUpClearedFor    = time.Hour
	stepUpTokenHeader   = "X-Turnstile-Token"
)

type stepUpState struct {
	byAccount *rateLimiter
	byIP      *rateLimiter
	cleared   *rateLimiter
}

func newStepUpState() stepUpState {
	return stepUpState{
		byAccount: newRateLimiter(stepUpPerAccount, stepUpWindow),
		byIP:      newRateLimiter(stepUpPerIP, stepUpWindow),
		cleared:   newRateLimiter(1, stepUpClearedFor),
	}
}

// busySharing counts this link and reports whether the account or network is
// past what a person does in an hour, or the request is from a flagged cloud
// network.
func (s *Server) busySharing(r *http.Request, userID, ip string) bool {
	s.stepUp.byAccount.record(userID)
	s.stepUp.byIP.record(ip)
	if s.cfg.CloudNetworkMode == config.CloudNetworksFlag && s.netGuard.Blocked(ip) {
		return true
	}
	n := s.stepUp.byAccount.count(userID)
	if n > stepUpPerAccount || s.stepUp.byIP.count(ip) > stepUpPerIP {
		return true
	}
	if n <= stepUpPerNewAccount {
		return false
	}
	u, err := s.db.GetUserByID(r.Context(), userID)
	return err == nil && time.Since(u.CreatedAt) < stepUpNewAccountAge
}

// challengeIfBusy answers the request when a link needs the step-up check and
// it hasn't been passed. Reports whether it answered.
func (s *Server) challengeIfBusy(w http.ResponseWriter, r *http.Request) bool {
	if s.cfg.TurnstileSecret == "" {
		return false
	}
	userID := GetUserID(r)
	ip := s.personIP(r)
	if !s.busySharing(r, userID, ip) || s.stepUp.cleared.exceeded(userID) {
		return false
	}
	if isNativeClient(r) {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{
			"error": "You've made a lot of links in the last hour. Try again later, or make this one on the website.",
			"code":  "share_limit",
		})
		return true
	}
	token := r.Header.Get(stepUpTokenHeader)
	if token != "" {
		ok, err := s.verifyTurnstile(r.Context(), token, ip)
		if err != nil {
			log.Printf("turnstile: step-up verify failed, allowing: %v", err)
			return false
		}
		if ok {
			s.stepUp.cleared.record(userID)
			return false
		}
	}
	writeJSON(w, http.StatusPreconditionRequired, map[string]string{
		"error": "You've made a lot of links in a short time. Confirm you're a person to keep going.",
		"code":  "challenge_required",
	})
	return true
}
