package auth

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"
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
	headers := []string{
		fmt.Sprintf("From: %s", cfg.From),
		fmt.Sprintf("To: %s", to),
		fmt.Sprintf("Subject: %s", subject),
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=UTF-8",
	}
	msg := strings.Join(headers, "\r\n") + "\r\n\r\n" + htmlBody

	// Try configured port first, then fall back to the other method
	if cfg.Port == 465 {
		return sendMailSMTPS(cfg, to, msg)
	}
	// Try STARTTLS (587) first; if it fails, retry via implicit TLS (465)
	err := sendMailSTARTTLS(cfg, to, msg)
	if err != nil {
		fallback := *cfg
		fallback.Port = 465
		if err2 := sendMailSMTPS(&fallback, to, msg); err2 != nil {
			return fmt.Errorf("starttls: %v; smtps fallback: %v", err, err2)
		}
	}
	return nil
}

// sendMailSTARTTLS sends via port 587 with STARTTLS (original method).
func sendMailSTARTTLS(cfg *SMTPConfig, to, msg string) error {
	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	auth := smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)
	return smtp.SendMail(addr, auth, cfg.From, []string{to}, []byte(msg))
}

// sendMailSMTPS sends via port 465 with implicit TLS.
func sendMailSMTPS(cfg *SMTPConfig, to, msg string) error {
	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)

	tlsConn, err := tls.DialWithDialer(
		&net.Dialer{Timeout: 15 * time.Second},
		"tcp", addr,
		&tls.Config{ServerName: cfg.Host},
	)
	if err != nil {
		return fmt.Errorf("tls dial: %w", err)
	}
	defer tlsConn.Close()

	client, err := smtp.NewClient(tlsConn, cfg.Host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer client.Close()

	if err := client.Auth(smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)); err != nil {
		return fmt.Errorf("smtp auth: %w", err)
	}
	if err := client.Mail(cfg.From); err != nil {
		return fmt.Errorf("smtp mail: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("smtp rcpt: %w", err)
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err := w.Write([]byte(msg)); err != nil {
		return fmt.Errorf("smtp write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp close data: %w", err)
	}

	return client.Quit()
}
