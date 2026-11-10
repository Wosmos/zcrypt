package cmd

import (
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/index"
)

func TestIsPushServiceEndpoint(t *testing.T) {
	cases := map[string]bool{
		"https://fcm.googleapis.com/fcm/send/abc":                true,
		"https://updates.push.services.mozilla.com/wpush/v2/abc": true,
		"https://web.push.apple.com/QGx":                         true,
		"https://wns2-par02p.notify.windows.com/w/?token=x":      true,
		"https://api.push.apple.com/3/device/x":                  true,
		"http://fcm.googleapis.com/fcm/send/abc":                 false,
		"https://fcm.googleapis.com:8443/fcm/send/abc":           false,
		"https://user@fcm.googleapis.com/fcm/send/abc":           false,
		"https://evil.com/fcm.googleapis.com":                    false,
		"https://fcm.googleapis.com.evil.com/x":                  false,
		"https://notify.windows.com/x":                           false,
		"https://169.254.169.254/latest/meta-data":               false,
		"https://localhost/x":                                    false,
		"not a url":                                              false,
	}
	for raw, want := range cases {
		if got := isPushServiceEndpoint(raw); got != want {
			t.Errorf("isPushServiceEndpoint(%q) = %v, want %v", raw, got, want)
		}
	}
}

func TestPushLang(t *testing.T) {
	for in, want := range map[string]string{"de-DE": "de", "ur": "ur", "ZH_cn": "zh", "pt-BR": "en", "": "en"} {
		if got := pushLang(in); got != want {
			t.Errorf("pushLang(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestPushSubjectComesFromTheFrontendURL(t *testing.T) {
	s := &Server{cfg: &config.Config{FrontendURL: "https://www.example.com/app"}}
	if got := s.pushSubject(); got != "https://www.example.com" {
		t.Errorf("subject = %q", got)
	}
	s.cfg.FrontendURL = "http://localhost:3000"
	if got := s.pushSubject(); got != "mailto:push@localhost" {
		t.Errorf("dev subject = %q", got)
	}
}

// browserKeys makes a subscription's p256dh/auth the way a browser does.
func browserKeys(t *testing.T) (string, string) {
	t.Helper()
	priv, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	auth := make([]byte, 16)
	_, _ = rand.Read(auth)
	enc := base64.RawURLEncoding
	return enc.EncodeToString(priv.PublicKey().Bytes()), enc.EncodeToString(auth)
}

func TestSendPushIsSignedEncryptedAndCollapsible(t *testing.T) {
	var got *http.Request
	var body []byte
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r
		body, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	private, public, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		t.Fatal(err)
	}
	p256dh, auth := browserKeys(t)
	s := &Server{cfg: &config.Config{FrontendURL: "https://example.com"}, pushHTTP: srv.Client()}
	s.sendPush(context.Background(), index.PushSubscription{Endpoint: srv.URL + "/push", P256dh: p256dh, Auth: auth, Lang: "de"},
		pushMessage{Type: "newSignIn", Data: map[string]string{"device": "Chrome on Mac"}, URL: "/settings"}, public, private)

	if got == nil {
		t.Fatal("no request reached the push service")
	}
	if !strings.HasPrefix(got.Header.Get("Authorization"), "vapid t=") {
		t.Errorf("missing VAPID signature: %q", got.Header.Get("Authorization"))
	}
	if got.Header.Get("Content-Encoding") != "aes128gcm" {
		t.Errorf("payload not encrypted to the browser: %q", got.Header.Get("Content-Encoding"))
	}
	if got.Header.Get("TTL") == "" {
		t.Error("missing TTL")
	}
	if got.Header.Get("Topic") != "" {
		t.Errorf("the push service can read what kind of event this is: Topic %q", got.Header.Get("Topic"))
	}
	if strings.Contains(string(body), "Chrome on Mac") || strings.Contains(string(body), "newSignIn") {
		t.Error("the push service can read the payload")
	}
}

func TestPushClientNeverFollowsRedirects(t *testing.T) {
	hit := false
	elsewhere := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { hit = true }))
	defer elsewhere.Close()
	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, elsewhere.URL, http.StatusTemporaryRedirect)
	}))
	defer redirect.Close()

	resp, err := newPushHTTPClient().Post(redirect.URL, "text/plain", nil)
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	if hit || resp.StatusCode != http.StatusTemporaryRedirect {
		t.Errorf("redirect followed: hit=%v status=%d", hit, resp.StatusCode)
	}
}
