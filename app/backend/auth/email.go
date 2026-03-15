package auth

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// EmailConfig holds email sending settings.
// Uses Resend HTTP API (works on cloud platforms that block SMTP).
type EmailConfig struct {
	APIKey string // Resend API key
	From   string // Sender address (e.g. "zcrypt <noreply@yourdomain.com>")
}

// brand colors
const (
	brandCyan     = "#00d5e4"
	brandCyanDark = "#0093a3"
	brandBg       = "#f8fafb"
	brandCardBg   = "#ffffff"
	brandText     = "#1a1a2e"
	brandMuted    = "#6b7280"
	brandBorder   = "#e5e7eb"
)

// wrapEmail builds a fully-branded zcrypt email with logo, content, and footer.
func wrapEmail(heading, content, footerNote string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:%s;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background:%s">
<tr><td align="center" style="padding:40px 16px">

<!-- Container -->
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%%">

<!-- Logo -->
<tr><td align="center" style="padding-bottom:32px">
  <table role="presentation" cellpadding="0" cellspacing="0">
  <tr>
    <td style="background:%s;width:36px;height:36px;border-radius:10px;text-align:center;vertical-align:middle">
      <span style="color:#fff;font-size:18px;font-weight:700;line-height:36px">z</span>
    </td>
    <td style="padding-left:10px">
      <span style="font-size:22px;font-weight:700;color:%s;letter-spacing:-0.5px">zcrypt</span>
    </td>
  </tr>
  </table>
</td></tr>

<!-- Card -->
<tr><td>
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background:%s;border-radius:16px;border:1px solid %s;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
<tr><td style="padding:40px 36px">

  <!-- Heading -->
  <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:%s">%s</h1>
  <div style="width:40px;height:3px;background:%s;border-radius:2px;margin-bottom:24px"></div>

  <!-- Content -->
  %s

</td></tr>
</table>
</td></tr>

<!-- Footer -->
<tr><td style="padding-top:28px;text-align:center">
  <p style="margin:0 0 6px;font-size:12px;color:%s">%s</p>
  <p style="margin:0 0 4px;font-size:12px;color:%s">zcrypt — Private cloud storage that costs less</p>
  <p style="margin:0;font-size:11px;color:%s">
    <a href="https://zcrypt.cloud" style="color:%s;text-decoration:none">zcrypt.cloud</a>
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`,
		brandBg, brandBg,
		brandCyanDark, brandText,
		brandCardBg, brandBorder,
		brandText, heading, brandCyan,
		content,
		brandMuted, footerNote,
		brandMuted,
		brandMuted, brandCyanDark,
	)
}

// emailButton returns a branded CTA button.
func emailButton(href, label string) string {
	return fmt.Sprintf(`<p style="margin:24px 0 0">
<a href="%s" style="display:inline-block;background:%s;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;letter-spacing:0.2px">%s</a>
</p>`, href, brandCyanDark, label)
}

// SendVerificationEmail sends an email verification link.
func SendVerificationEmail(cfg *EmailConfig, to, token, baseURL string) error {
	if cfg == nil {
		return nil // Email not configured, skip silently
	}

	link := fmt.Sprintf("%s/verify-email?token=%s", baseURL, token)
	subject := "Verify your zcrypt account"

	content := fmt.Sprintf(`<p style="margin:0 0 4px;font-size:15px;color:%s;line-height:1.6">Thanks for signing up! Verify your email address to get started with secure, encrypted cloud storage.</p>
%s
<p style="margin:20px 0 0;font-size:13px;color:%s">Or copy this link into your browser:<br>
<a href="%s" style="color:%s;word-break:break-all;font-size:12px">%s</a></p>`,
		brandText,
		emailButton(link, "Verify Email"),
		brandMuted, link, brandCyanDark, link,
	)

	body := wrapEmail("Verify your email", content, "This link expires in 24 hours. If you didn't create this account, ignore this email.")
	return sendResend(cfg, to, subject, body)
}

// SendPasswordResetEmail sends a password reset link.
func SendPasswordResetEmail(cfg *EmailConfig, to, token, baseURL string) error {
	if cfg == nil {
		return nil
	}

	link := fmt.Sprintf("%s/reset-password?token=%s", baseURL, token)
	subject := "Reset your zcrypt password"

	content := fmt.Sprintf(`<p style="margin:0 0 4px;font-size:15px;color:%s;line-height:1.6">We received a request to reset your password. Click the button below to choose a new one.</p>
%s
<p style="margin:20px 0 0;font-size:13px;color:%s">Or copy this link into your browser:<br>
<a href="%s" style="color:%s;word-break:break-all;font-size:12px">%s</a></p>`,
		brandText,
		emailButton(link, "Reset Password"),
		brandMuted, link, brandCyanDark, link,
	)

	body := wrapEmail("Reset your password", content, "This link expires in 1 hour. If you didn't request this, ignore this email.")
	return sendResend(cfg, to, subject, body)
}

// SendMagicLinkEmail sends a passwordless login link.
func SendMagicLinkEmail(cfg *EmailConfig, to, token, baseURL string) error {
	if cfg == nil {
		return nil
	}

	link := fmt.Sprintf("%s/magic-link?token=%s", baseURL, token)
	subject := "Your zcrypt login link"

	content := fmt.Sprintf(`<p style="margin:0 0 4px;font-size:15px;color:%s;line-height:1.6">Use the button below to securely log in to your zcrypt account. No password needed.</p>
%s
<p style="margin:20px 0 0;font-size:13px;color:%s">Or copy this link into your browser:<br>
<a href="%s" style="color:%s;word-break:break-all;font-size:12px">%s</a></p>`,
		brandText,
		emailButton(link, "Log In to zcrypt"),
		brandMuted, link, brandCyanDark, link,
	)

	body := wrapEmail("Log in to zcrypt", content, "This link expires in 15 minutes. If you didn't request this, ignore this email.")
	return sendResend(cfg, to, subject, body)
}

// sendResend sends an email via Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
func sendResend(cfg *EmailConfig, to, subject, htmlBody string) error {
	payload, err := json.Marshal(map[string]interface{}{
		"from":    cfg.From,
		"to":      []string{to},
		"subject": subject,
		"html":    htmlBody,
	})
	if err != nil {
		return fmt.Errorf("marshal email payload: %w", err)
	}

	req, err := http.NewRequest("POST", "https://api.resend.com/emails", bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("resend request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("resend API error %d: %s", resp.StatusCode, string(body))
	}

	return nil
}
