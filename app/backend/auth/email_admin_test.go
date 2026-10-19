package auth

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRenderAnnouncementBodyEscapesAndFormats(t *testing.T) {
	out := RenderAnnouncementBody("Hello <b>team</b> & friends\nsecond line\n\nSee https://zcrypt.cloud/docs. Thanks")
	assert.NotContains(t, out, "<b>team</b>")
	assert.Contains(t, out, "&lt;b&gt;team&lt;/b&gt; &amp; friends<br>second line")
	assert.Equal(t, 2, countSub(out, "<p "))
	assert.Contains(t, out, `<a href="https://zcrypt.cloud/docs"`)
	assert.Contains(t, out, "</a>. Thanks")
}

func TestRenderAnnouncementBodyLinkCannotInjectAttributes(t *testing.T) {
	out := RenderAnnouncementBody(`go https://x.test/a"onmouseover="alert(1)`)
	assert.NotContains(t, out, `"onmouseover`)
}

func countSub(s, sub string) int {
	n := 0
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			n++
		}
	}
	return n
}

func TestChangeEmailEscapesNoteAndShowsChange(t *testing.T) {
	m := ChangeEmail("a@b.test", "subj", ChangeNotice{
		Heading: "Your plan changed",
		Intro:   "An administrator changed your plan.",
		Lines:   []ChangeLine{{Label: "Storage limit", From: "5 GB", To: "20 GB"}},
		Note:    `<script>alert(1)</script>`,
	}, "https://zcrypt.cloud")
	assert.Contains(t, m.HTML, "Storage limit:</strong> 5 GB &rarr; 20 GB")
	assert.NotContains(t, m.HTML, "<script>")
	assert.Contains(t, m.HTML, "&lt;script&gt;")
}

func TestAnnouncementEmailUnsubscribeLinkAndHeaders(t *testing.T) {
	u := "https://api.test/api/email/unsubscribe?token=abc"
	m := AnnouncementEmail("a@b.test", "Hi", "body", u, "https://zcrypt.cloud")
	assert.Contains(t, m.HTML, `href="`+u+`"`)
	assert.Equal(t, "<"+u+">", m.Headers["List-Unsubscribe"])
	assert.Equal(t, "List-Unsubscribe=One-Click", m.Headers["List-Unsubscribe-Post"])
}

func TestUnsubscribeToken(t *testing.T) {
	secret := strings.Repeat("ab", 16)
	tok := UnsubscribeToken(secret, "user-1")
	id, ok := VerifyUnsubscribeToken(secret, tok)
	assert.True(t, ok)
	assert.Equal(t, "user-1", id)

	_, ok = VerifyUnsubscribeToken("another-secret-another-secret-xx", tok)
	assert.False(t, ok)
	_, ok = VerifyUnsubscribeToken(secret, tok+"x")
	assert.False(t, ok)
	for _, bad := range []string{"", "nodot", "!!.!!", "dXNlci0y." + tok[len(tok)-10:]} {
		_, ok = VerifyUnsubscribeToken(secret, bad)
		assert.False(t, ok, bad)
	}
}

func TestSendBatchChunksAndPaces(t *testing.T) {
	var mu sync.Mutex
	var sizes []int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/emails/batch", r.URL.Path)
		assert.Equal(t, "Bearer key", r.Header.Get("Authorization"))
		raw, _ := io.ReadAll(r.Body)
		var items []map[string]any
		require.NoError(t, json.Unmarshal(raw, &items))
		assert.NotContains(t, items[0], "reply_to")
		mu.Lock()
		sizes = append(sizes, len(items))
		mu.Unlock()
		w.WriteHeader(200)
	}))
	defer srv.Close()

	cfg := &EmailConfig{APIKey: "key", From: "zcrypt <noreply@zcrypt.test>", BaseURL: srv.URL, BatchInterval: time.Millisecond}
	msgs := make([]OutgoingEmail, 230)
	for i := range msgs {
		msgs[i] = OutgoingEmail{To: "x@y.test", Subject: "s", HTML: "h"}
	}
	sent, failed, err := SendBatch(context.Background(), cfg, msgs)
	require.NoError(t, err)
	assert.Equal(t, 230, sent)
	assert.Zero(t, failed)
	assert.Equal(t, []int{100, 100, 30}, sizes)
}

func TestSendBatchCountsFailuresAndRetriesRateLimit(t *testing.T) {
	var mu sync.Mutex
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		mu.Lock()
		calls++
		n := calls
		mu.Unlock()
		switch n {
		case 1:
			w.WriteHeader(http.StatusTooManyRequests)
		case 3:
			w.WriteHeader(http.StatusUnprocessableEntity)
		default:
			w.WriteHeader(200)
		}
	}))
	defer srv.Close()

	cfg := &EmailConfig{APIKey: "key", BaseURL: srv.URL, BatchInterval: time.Millisecond}
	msgs := make([]OutgoingEmail, 150)
	sent, failed, err := SendBatch(context.Background(), cfg, msgs)
	assert.Error(t, err)
	assert.Equal(t, 100, sent)
	assert.Equal(t, 50, failed)
}

func TestSendBatchNotConfigured(t *testing.T) {
	_, failed, err := SendBatch(context.Background(), nil, make([]OutgoingEmail, 3))
	assert.Error(t, err)
	assert.Equal(t, 3, failed)
}

func TestSendBatchStopsOnCancel(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) }))
	defer srv.Close()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	cfg := &EmailConfig{APIKey: "key", BaseURL: srv.URL, BatchInterval: time.Hour}
	sent, failed, err := SendBatch(ctx, cfg, make([]OutgoingEmail, 150))
	assert.Error(t, err)
	assert.Equal(t, 150, sent+failed)
}

func TestPlainTextKeepsWordsAndLinksAndDropsMarkup(t *testing.T) {
	in := `<html><head><style>p{color:red}</style></head><body><h1>Hello &amp; welcome</h1>` +
		`<p>Line one<br>Line   two</p><p><a href="https://www.zcrypt.cloud/x?a=1&amp;b=2">Open zcrypt</a></p>` +
		`<p><a href="https://www.zcrypt.cloud">https://www.zcrypt.cloud</a></p></body></html>`
	got := PlainText(in)
	assert.Equal(t, "Hello & welcome\n\nLine one\nLine two\n\nOpen zcrypt (https://www.zcrypt.cloud/x?a=1&b=2)\n\nhttps://www.zcrypt.cloud", got)
	assert.NotContains(t, got, "color:red")
}

func TestEveryOutgoingEmailCarriesATextPart(t *testing.T) {
	msg := AnnouncementEmail("a@b.c", "News", "Hello there\nhttps://www.zcrypt.cloud", "https://www.zcrypt.cloud/api/email/unsubscribe?token=t", "https://www.zcrypt.cloud")
	text := PlainText(msg.HTML)
	assert.Contains(t, text, "Hello there")
	assert.Contains(t, text, "Unsubscribe (https://www.zcrypt.cloud/api/email/unsubscribe?token=t)")
}
