package auth

import (
	"fmt"
	"net/smtp"
	"strings"
)

// SMTPConfig holds SMTP settings. Matches config.SMTPConfig.
type SMTPConfig struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
}

// SendVerificationEmail sends an email verification link.
func SendVerificationEmail(cfg *SMTPConfig, to, token, baseURL string) error {
	if cfg == nil {
		return nil // SMTP not configured, skip silently
	}

	link := fmt.Sprintf("%s/verify-email?token=%s", baseURL, token)
	subject := "Verify your zpush account"
	body := fmt.Sprintf(`<!DOCTYPE html>
<html><body style="font-family:sans-serif;color:#333;max-width:480px;margin:0 auto;padding:32px">
<h2 style="color:#6366f1">Welcome to zpush</h2>
<p>Click below to verify your email address:</p>
<p><a href="%s" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Verify Email</a></p>
<p style="color:#999;font-size:12px;margin-top:32px">This link expires in 24 hours. If you didn't create this account, ignore this email.</p>
</body></html>`, link)

	return sendMail(cfg, to, subject, body)
}

// SendPasswordResetEmail sends a password reset link.
func SendPasswordResetEmail(cfg *SMTPConfig, to, token, baseURL string) error {
	if cfg == nil {
		return nil
	}

	link := fmt.Sprintf("%s/reset-password?token=%s", baseURL, token)
	subject := "Reset your zpush password"
	body := fmt.Sprintf(`<!DOCTYPE html>
<html><body style="font-family:sans-serif;color:#333;max-width:480px;margin:0 auto;padding:32px">
<h2 style="color:#6366f1">Password Reset</h2>
<p>Click below to reset your password:</p>
<p><a href="%s" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Reset Password</a></p>
<p style="color:#999;font-size:12px;margin-top:32px">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
</body></html>`, link)

	return sendMail(cfg, to, subject, body)
}

func sendMail(cfg *SMTPConfig, to, subject, htmlBody string) error {
	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	auth := smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)

	headers := []string{
		fmt.Sprintf("From: %s", cfg.From),
		fmt.Sprintf("To: %s", to),
		fmt.Sprintf("Subject: %s", subject),
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=UTF-8",
	}
	msg := []byte(strings.Join(headers, "\r\n") + "\r\n\r\n" + htmlBody)

	return smtp.SendMail(addr, auth, cfg.From, []string{to}, msg)
}
