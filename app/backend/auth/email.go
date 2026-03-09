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
// Uses Brevo (Sendinblue) HTTP API (works on cloud platforms that block SMTP).
type EmailConfig struct {
	APIKey string // Brevo API key
	From   string // Sender address (e.g. "noreply@example.com")
	Name   string // Sender name (e.g. "zpush")
}

// SendVerificationEmail sends an email verification link.
func SendVerificationEmail(cfg *EmailConfig, to, token, baseURL string) error {
	if cfg == nil {
		return nil // Email not configured, skip silently
	}

	link := fmt.Sprintf("%s/verify-email?token=%s", baseURL, token)
	subject := "Verify your zpush account"
	body := fmt.Sprintf(`<!DOCTYPE html>
<html><body style="font-family:sans-serif;color:#333;max-width:480px;margin:0 auto;padding:32px">
<h2 style="color:#10b981">Welcome to zpush</h2>
<p>Click below to verify your email address:</p>
<p><a href="%s" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Verify Email</a></p>
<p style="color:#999;font-size:12px;margin-top:32px">This link expires in 24 hours. If you didn't create this account, ignore this email.</p>
</body></html>`, link)

	return sendBrevo(cfg, to, subject, body)
}

// SendPasswordResetEmail sends a password reset link.
func SendPasswordResetEmail(cfg *EmailConfig, to, token, baseURL string) error {
	if cfg == nil {
		return nil
	}

	link := fmt.Sprintf("%s/reset-password?token=%s", baseURL, token)
	subject := "Reset your zpush password"
	body := fmt.Sprintf(`<!DOCTYPE html>
<html><body style="font-family:sans-serif;color:#333;max-width:480px;margin:0 auto;padding:32px">
<h2 style="color:#10b981">Password Reset</h2>
<p>Click below to reset your password:</p>
<p><a href="%s" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Reset Password</a></p>
<p style="color:#999;font-size:12px;margin-top:32px">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
</body></html>`, link)

	return sendBrevo(cfg, to, subject, body)
}

// sendBrevo sends an email via Brevo's (Sendinblue) HTTP API.
// Docs: https://developers.brevo.com/reference/sendtransacemail
func sendBrevo(cfg *EmailConfig, to, subject, htmlBody string) error {
	senderName := cfg.Name
	if senderName == "" {
		senderName = "zpush"
	}

	payload, err := json.Marshal(map[string]interface{}{
		"sender":  map[string]string{"name": senderName, "email": cfg.From},
		"to":      []map[string]string{{"email": to}},
		"subject": subject,
		"htmlContent": htmlBody,
	})
	if err != nil {
		return fmt.Errorf("marshal email payload: %w", err)
	}

	req, err := http.NewRequest("POST", "https://api.brevo.com/v3/smtp/email", bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("api-key", cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("brevo request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("brevo API error %d: %s", resp.StatusCode, string(body))
	}

	return nil
}
