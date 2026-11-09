package cmd

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/zcrypt/zcrypt/crypto"
	"github.com/zcrypt/zcrypt/index"
)

// Web Push: notifications that reach a browser while zcrypt is closed. The
// payload is encrypted to the browser (RFC 8291), so the push service relays
// it without reading it, and it never names a file: the server doesn't know
// file names, they're sealed on the device.

const (
	pushVAPIDSetting = "push_vapid"
	pushTTL          = 24 * 60 * 60
	pushSendTimeout  = 10 * time.Second
)

// pushServiceHosts are the browsers' push services. The server POSTs to a
// subscription's endpoint, so accepting any URL would let an account make it
// call arbitrary hosts (SSRF); only these are allowed.
var (
	pushServiceHosts        = []string{"fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"}
	pushServiceHostSuffixes = []string{".notify.windows.com", ".push.apple.com"}
)

// isPushServiceEndpoint reports whether raw is an https URL on a known push service.
func isPushServiceEndpoint(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	for _, h := range pushServiceHosts {
		if host == h {
			return true
		}
	}
	for _, suffix := range pushServiceHostSuffixes {
		if strings.HasSuffix(host, suffix) && len(host) > len(suffix) {
			return true
		}
	}
	return false
}

// pushMessage is what a notification carries. The service worker turns Type
// and Data into localized text, so the server holds no copy of the wording.
type pushMessage struct {
	Type string            `json:"type"`
	Data map[string]string `json:"data,omitempty"`
	URL  string            `json:"url"`
	Lang string            `json:"lang"`
}

type pushState struct {
	mu      sync.Mutex
	public  string
	private string
}

type storedVAPID struct {
	Public  string `json:"public"`
	Private []byte `json:"private"`
	Nonce   []byte `json:"nonce"`
}

func (s *Server) pushKEK() ([]byte, error) {
	return crypto.DeriveUserKEK(s.masterKey, "system:push-vapid")
}

// vapidKeys returns the server's push signing keys, generating and storing
// them (private key sealed with the master key) on first use, so push needs no
// manual setup.
func (s *Server) vapidKeys(ctx context.Context) (string, string, error) {
	s.push.mu.Lock()
	defer s.push.mu.Unlock()
	if s.push.public != "" {
		return s.push.public, s.push.private, nil
	}
	kek, err := s.pushKEK()
	if err != nil {
		return "", "", err
	}
	if raw, err := s.db.GetSystemSetting(ctx, pushVAPIDSetting); err == nil && raw != "" {
		var stored storedVAPID
		if err := json.Unmarshal([]byte(raw), &stored); err != nil {
			return "", "", fmt.Errorf("read push keys: %w", err)
		}
		private, err := crypto.DecryptToken(kek, stored.Private, stored.Nonce)
		if err != nil {
			return "", "", fmt.Errorf("open push keys: %w", err)
		}
		s.push.public, s.push.private = stored.Public, private
		return stored.Public, private, nil
	}
	private, public, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		return "", "", fmt.Errorf("generate push keys: %w", err)
	}
	sealed, nonce, err := crypto.EncryptToken(kek, private)
	if err != nil {
		return "", "", fmt.Errorf("seal push keys: %w", err)
	}
	raw, err := json.Marshal(storedVAPID{Public: public, Private: sealed, Nonce: nonce})
	if err != nil {
		return "", "", fmt.Errorf("encode push keys: %w", err)
	}
	if err := s.db.SetSystemSetting(ctx, pushVAPIDSetting, string(raw)); err != nil {
		return "", "", fmt.Errorf("store push keys: %w", err)
	}
	s.push.public, s.push.private = public, private
	return public, private, nil
}

// pushSubject is the contact the push services see: the site's own https URL,
// from FRONTEND_URL.
func (s *Server) pushSubject() string {
	if u, err := url.Parse(s.cfg.FrontendURL); err == nil && u.Scheme == "https" && u.Host != "" {
		return "https://" + u.Host
	}
	return "mailto:push@localhost"
}

// HandlePushKey returns the public key a browser subscribes with.
// GET /api/push/key
func (s *Server) HandlePushKey(w http.ResponseWriter, r *http.Request) {
	public, _, err := s.vapidKeys(r.Context())
	if err != nil {
		internalError(w, "push key", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"public_key": public})
}

// HandlePushSubscribe registers this browser for the caller's notifications.
// POST /api/push/subscribe {endpoint, keys: {p256dh, auth}, lang}
func (s *Server) HandlePushSubscribe(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Endpoint string `json:"endpoint"`
		Keys     struct {
			P256dh string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
		Lang string `json:"lang"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Endpoint) > 2048 || !s.pushHostOK(req.Endpoint) {
		writeError(w, http.StatusBadRequest, "unsupported push endpoint")
		return
	}
	if req.Keys.P256dh == "" || req.Keys.Auth == "" || len(req.Keys.P256dh) > 256 || len(req.Keys.Auth) > 64 {
		writeError(w, http.StatusBadRequest, "invalid subscription keys")
		return
	}
	err := s.db.SavePushSubscription(r.Context(), index.PushSubscription{
		UserID:   GetUserID(r),
		Endpoint: req.Endpoint,
		P256dh:   req.Keys.P256dh,
		Auth:     req.Keys.Auth,
		Lang:     pushLang(req.Lang),
	})
	if err != nil {
		internalError(w, "push subscribe", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandlePushUnsubscribe forgets one of the caller's browsers.
// POST /api/push/unsubscribe {endpoint}
func (s *Server) HandlePushUnsubscribe(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Endpoint string `json:"endpoint"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Endpoint == "" {
		writeError(w, http.StatusBadRequest, "endpoint required")
		return
	}
	if err := s.db.DeletePushSubscription(r.Context(), GetUserID(r), req.Endpoint); err != nil {
		internalError(w, "push unsubscribe", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// pushLangs are the locales the service worker has wording for.
var pushLangs = map[string]bool{"en": true, "ar": true, "de": true, "es": true, "fr": true, "ru": true, "ur": true, "zh": true}

func pushLang(lang string) string {
	lang = strings.ToLower(strings.TrimSpace(lang))
	if i := strings.IndexAny(lang, "-_"); i > 0 {
		lang = lang[:i]
	}
	if pushLangs[lang] {
		return lang
	}
	return "en"
}

// pushToUser sends msg to every browser the user registered, in the background.
// Endpoints the push service reports as gone are dropped.
func (s *Server) pushToUser(userID string, msg pushMessage) {
	s.goBackground(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()
		subs, err := s.db.ListPushSubscriptions(ctx, userID)
		if err != nil || len(subs) == 0 {
			return
		}
		public, private, err := s.vapidKeys(ctx)
		if err != nil {
			log.Printf("push: keys: %v", err)
			return
		}
		for _, sub := range subs {
			if !s.pushHostOK(sub.Endpoint) {
				continue
			}
			s.sendPush(ctx, sub, msg, public, private)
		}
	})
}

func (s *Server) sendPush(ctx context.Context, sub index.PushSubscription, msg pushMessage, public, private string) {
	msg.Lang = sub.Lang
	payload, err := json.Marshal(msg)
	if err != nil {
		return
	}
	resp, err := webpush.SendNotificationWithContext(ctx, payload, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
	}, &webpush.Options{
		HTTPClient:      s.pushHTTP,
		Subscriber:      s.pushSubject(),
		VAPIDPublicKey:  public,
		VAPIDPrivateKey: private,
		TTL:             pushTTL,
		Urgency:         webpush.UrgencyNormal,
		Topic:           msg.Type,
	})
	if err != nil {
		if !errors.Is(err, context.Canceled) {
			log.Printf("push: send: %v", err)
		}
		return
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	_ = resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
		_ = s.db.DeletePushEndpoint(ctx, sub.Endpoint)
	}
}

// newPushHTTPClient never follows redirects: a push service answers directly,
// and following one would let a hostile endpoint send the request elsewhere.
func newPushHTTPClient() *http.Client {
	return &http.Client{
		Timeout: pushSendTimeout,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}
