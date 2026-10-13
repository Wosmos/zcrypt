package auth

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

const (
	maxBatchSize         = 100
	defaultBatchInterval = 600 * time.Millisecond
)

// OutgoingEmail is one message in a batch send.
type OutgoingEmail struct {
	To      string
	Subject string
	HTML    string
	Headers map[string]string
}

// ChangeLine is one "label: from -> to" row of a change notification.
type ChangeLine struct {
	Label string
	From  string
	To    string
}

// ChangeNotice describes an admin-made change to a user's account.
type ChangeNotice struct {
	Heading string
	Intro   string
	Lines   []ChangeLine
	Note    string
}

// ChangeEmail renders a change notification as a ready-to-send message.
func ChangeEmail(to, subject string, n ChangeNotice, baseURL string) OutgoingEmail {
	var b strings.Builder
	fmt.Fprintf(&b, `<p style="margin:0 0 16px;font-size:15px;color:%s;line-height:1.6">%s</p>`, brandText, htmlEscape(n.Intro))
	for _, l := range n.Lines {
		fmt.Fprintf(&b, `<p style="margin:0 0 6px;font-size:14px;color:%s"><strong>%s:</strong> %s &rarr; %s</p>`,
			brandText, htmlEscape(l.Label), htmlEscape(l.From), htmlEscape(l.To))
	}
	if n.Note != "" {
		fmt.Fprintf(&b, `<p style="margin:16px 0 8px;font-size:13px;color:%s">Note from the administrator:</p>`, brandMuted)
		fmt.Fprintf(&b, `<blockquote style="margin:0;padding:14px 18px;background:%s;border-left:3px solid %s;border-radius:8px;font-size:14px;color:%s;line-height:1.6;white-space:pre-wrap">%s</blockquote>`,
			brandBg, brandCyan, brandText, htmlEscape(n.Note))
	}
	return OutgoingEmail{
		To:      to,
		Subject: subject,
		HTML:    wrapEmail(htmlEscape(n.Heading), b.String(), "An administrator made this change to your zcrypt account.", baseURL),
	}
}

var urlPattern = regexp.MustCompile(`https?://[^\s<>"']+`)

// RenderAnnouncementBody turns plain text into escaped HTML paragraphs with
// line breaks and auto-linked URLs.
func RenderAnnouncementBody(body string) string {
	body = strings.ReplaceAll(strings.ReplaceAll(body, "\r\n", "\n"), "\r", "\n")
	var out strings.Builder
	for _, para := range strings.Split(strings.TrimSpace(body), "\n\n") {
		para = strings.TrimSpace(para)
		if para == "" {
			continue
		}
		lines := strings.Split(para, "\n")
		for i, ln := range lines {
			lines[i] = linkify(ln)
		}
		fmt.Fprintf(&out, `<p style="margin:0 0 16px;font-size:15px;color:%s;line-height:1.6">%s</p>`, brandText, strings.Join(lines, "<br>"))
	}
	return out.String()
}

func linkify(line string) string {
	var out strings.Builder
	last := 0
	for _, loc := range urlPattern.FindAllStringIndex(line, -1) {
		raw := line[loc[0]:loc[1]]
		trimmed := strings.TrimRight(raw, ".,;:!?)]")
		out.WriteString(htmlEscape(line[last:loc[0]]))
		fmt.Fprintf(&out, `<a href="%s" style="color:%s">%s</a>`, htmlEscape(trimmed), brandCyanDark, htmlEscape(trimmed))
		last = loc[0] + len(trimmed)
	}
	out.WriteString(htmlEscape(line[last:]))
	return out.String()
}

// AnnouncementEmail renders an admin announcement with a one-click
// unsubscribe footer and the matching List-Unsubscribe headers.
func AnnouncementEmail(to, subject, body, unsubscribeURL, baseURL string) OutgoingEmail {
	footer := fmt.Sprintf(`You are receiving this because you have a zcrypt account. <a href="%s" style="color:%s">Unsubscribe</a> from announcements.`,
		htmlEscape(unsubscribeURL), brandCyanDark)
	return OutgoingEmail{
		To:      to,
		Subject: subject,
		HTML:    wrapEmail(htmlEscape(subject), RenderAnnouncementBody(body), footer, baseURL),
		Headers: map[string]string{
			"List-Unsubscribe":      "<" + unsubscribeURL + ">",
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		},
	}
}

func unsubscribeKey(secret string) []byte {
	sum := sha256.Sum256([]byte("zcrypt-email-unsubscribe-v1:" + secret))
	return sum[:]
}

func unsubscribeMAC(secret, userID string) []byte {
	m := hmac.New(sha256.New, unsubscribeKey(secret))
	m.Write([]byte(userID))
	return m.Sum(nil)
}

// UnsubscribeToken signs a user id so the unsubscribe link works without login.
func UnsubscribeToken(secret, userID string) string {
	enc := base64.RawURLEncoding
	return enc.EncodeToString([]byte(userID)) + "." + enc.EncodeToString(unsubscribeMAC(secret, userID))
}

// VerifyUnsubscribeToken returns the user id when the token's signature is valid.
func VerifyUnsubscribeToken(secret, token string) (string, bool) {
	enc := base64.RawURLEncoding
	idPart, macPart, ok := strings.Cut(token, ".")
	if !ok {
		return "", false
	}
	id, err := enc.DecodeString(idPart)
	if err != nil {
		return "", false
	}
	got, err := enc.DecodeString(macPart)
	if err != nil {
		return "", false
	}
	if !hmac.Equal(got, unsubscribeMAC(secret, string(id))) {
		return "", false
	}
	return string(id), true
}

// SendBatch sends messages through Resend's batch endpoint (100 per call,
// paced). It returns how many were accepted and how many were not.
func SendBatch(ctx context.Context, cfg *EmailConfig, msgs []OutgoingEmail) (sent, failed int, err error) {
	if cfg == nil || cfg.APIKey == "" {
		return 0, len(msgs), fmt.Errorf("email is not configured")
	}
	interval := cfg.BatchInterval
	if interval == 0 {
		interval = defaultBatchInterval
	}
	var firstErr error
	for i := 0; i < len(msgs); i += maxBatchSize {
		end := min(i+maxBatchSize, len(msgs))
		if i > 0 {
			select {
			case <-ctx.Done():
				return sent, failed + len(msgs) - i, ctx.Err()
			case <-time.After(interval):
			}
		}
		if cerr := sendBatchChunk(ctx, cfg, msgs[i:end], interval); cerr != nil {
			failed += end - i
			if firstErr == nil {
				firstErr = cerr
			}
			continue
		}
		sent += end - i
	}
	return sent, failed, firstErr
}

func sendBatchChunk(ctx context.Context, cfg *EmailConfig, msgs []OutgoingEmail, interval time.Duration) error {
	payload := make([]map[string]any, len(msgs))
	for i, m := range msgs {
		item := map[string]any{"from": cfg.From, "to": []string{m.To}, "subject": m.Subject, "html": m.HTML}
		if len(m.Headers) > 0 {
			item["headers"] = m.Headers
		}
		payload[i] = item
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal batch: %w", err)
	}
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		req, err := http.NewRequestWithContext(ctx, "POST", cfg.endpoint("/emails/batch"), bytes.NewReader(data))
		if err != nil {
			return fmt.Errorf("create request: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
		req.Header.Set("Content-Type", "application/json")
		resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
		if err != nil {
			return fmt.Errorf("resend batch request: %w", err)
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		resp.Body.Close()
		if resp.StatusCode < 400 {
			return nil
		}
		lastErr = fmt.Errorf("resend batch API error %d: %s", resp.StatusCode, string(body))
		if resp.StatusCode != http.StatusTooManyRequests {
			return lastErr
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(interval * 2):
		}
	}
	return lastErr
}
