package auth

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestHTMLEscape(t *testing.T) {
	assert.Equal(t, "&amp;", htmlEscape("&"))
	assert.Equal(t, "&lt;script&gt;", htmlEscape("<script>"))
	assert.Equal(t, "&quot;quoted&quot;", htmlEscape(`"quoted"`))
	assert.Equal(t, "&#39;apos&#39;", htmlEscape("'apos'"))
	// Ampersand must be escaped first so it does not double-escape entities.
	assert.Equal(t, "a &amp; &lt;b&gt;", htmlEscape("a & <b>"))
	assert.Equal(t, "plain text", htmlEscape("plain text"))
}

func TestEmailButton(t *testing.T) {
	btn := emailButton("https://example.com/x", "Click Me")
	assert.Contains(t, btn, `href="https://example.com/x"`)
	assert.Contains(t, btn, "Click Me")
	assert.Contains(t, btn, "<a")
}

func TestWrapEmail(t *testing.T) {
	out := wrapEmail("My Heading", "<p>my content</p>", "footer note", "https://staging.example.com")
	assert.True(t, strings.HasPrefix(out, "<!DOCTYPE html>"))
	assert.Contains(t, out, "My Heading")
	assert.Contains(t, out, "<p>my content</p>")
	assert.Contains(t, out, "footer note")
	assert.Contains(t, out, "staging.example.com")
	assert.NotContains(t, out, "zcrypt.cloud")
}

// The Send* helpers short-circuit and return nil when email is not configured
// (cfg == nil). This is the only branch coverable without a live Resend call.

func TestSendVerificationEmailNilConfig(t *testing.T) {
	assert.NoError(t, SendVerificationEmail(nil, "to@test.com", "tok", "https://app"))
}

func TestSendPasswordResetEmailNilConfig(t *testing.T) {
	assert.NoError(t, SendPasswordResetEmail(nil, "to@test.com", "tok", "https://app"))
}

func TestNewDeviceEmailBody(t *testing.T) {
	when := time.Date(2026, 10, 3, 21, 5, 0, 0, time.UTC)
	out := newDeviceEmailBody("Firefox <b>on</b> Linux", "203.0.113.0/24", when, "https://app.example.com")
	assert.Contains(t, out, "Firefox &lt;b&gt;on&lt;/b&gt; Linux")
	assert.Contains(t, out, "203.0.113.0/24")
	assert.Contains(t, out, "3 Oct 2026, 21:05 UTC")
	assert.Contains(t, out, `href="https://app.example.com/settings"`)
	assert.NoError(t, SendNewDeviceEmail(nil, "to@test.com", "d", "l", when, "https://app"))
}

func TestAccountDeletionEmailBody(t *testing.T) {
	at := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	out := accountDeletionEmailBody(at, "https://app.example.com")
	assert.Contains(t, out, "10 October 2026")
	assert.Contains(t, out, `href="https://app.example.com/login"`)
	assert.NoError(t, SendAccountDeletionEmail(nil, "to@test.com", at, "https://app"))
}

func TestSendMagicLinkEmailNilConfig(t *testing.T) {
	assert.NoError(t, SendMagicLinkEmail(nil, "to@test.com", "tok", "https://app"))
}

func TestSendDeadManSwitchEmailNilConfig(t *testing.T) {
	assert.NoError(t, SendDeadManSwitchEmail(nil, "to@test.com", "Contact", "Owner", "msg", "https://app", true))
}
