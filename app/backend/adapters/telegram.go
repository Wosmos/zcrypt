package adapters

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"mime/multipart"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/zcrypt/zcrypt/disguise"
	"github.com/zcrypt/zcrypt/types"
)

const (
	telegramAPIBase = "https://api.telegram.org"

	// Bot API limits: 50MB upload, 20MB download via getFile.
	// Use 19MB sub-chunks to stay safely under the download limit.
	maxTelegramPartSize = 19 * 1024 * 1024 // 19MB

	telegramMaxRetries = 3
	telegramRetryBase  = 2 * time.Second

	// telegramValidateTimeout bounds the constructor's getMe/getChat validation
	// calls. The long-lived client has no overall timeout (uploads can be large),
	// so without this a blocked api.telegram.org would hang adapter creation for
	// the full dial timeout instead of failing fast.
	telegramValidateTimeout = 10 * time.Second
)

// TelegramAdapter implements PlatformAdapter for Telegram.
//
// Token format: "BOT_TOKEN|CHAT_ID"
// Files are sent as documents to the specified chat/channel.
// Chunks > 19MB are transparently split into sub-parts because
// Telegram's getFile download limit is 20MB.
//
// RemotePath format: "msgId:fileId" or "msgId:fileId,msgId:fileId,..." for multi-part.
type TelegramAdapter struct {
	botToken string
	chatID   string
	botUser  string // bot username from getMe
	client   *http.Client
	// apiBase is the Bot API root, telegramAPIBase in production; overridable
	// so tests can point the adapter at a local httptest server.
	apiBase string
}

// NewTelegramAdapter creates a Telegram adapter.
// Token format: "BOT_TOKEN|CHAT_ID" where CHAT_ID can be @channel_username or numeric ID.
func NewTelegramAdapter(token string) (*TelegramAdapter, error) {
	parts := strings.SplitN(token, "|", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return nil, fmt.Errorf("invalid telegram token format: expected 'BOT_TOKEN|CHAT_ID' (e.g. '123456:ABC-DEF|@mychannel')")
	}

	botToken := strings.TrimSpace(parts[0])
	chatID := strings.TrimSpace(parts[1])

	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		TLSHandshakeTimeout:   30 * time.Second,
		ResponseHeaderTimeout: 120 * time.Second,
		DialContext: (&net.Dialer{
			Timeout:   30 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:        10,
		IdleConnTimeout:     90 * time.Second,
		MaxIdleConnsPerHost: 4,
	}

	adapter := &TelegramAdapter{
		botToken: botToken,
		chatID:   chatID,
		apiBase:  telegramAPIBase,
		client: &http.Client{
			Transport: transport,
			Timeout:   0, // no overall timeout — uploads can be large
		},
	}

	// Validate bot token via getMe
	botUser, err := adapter.getMe()
	if err != nil {
		return nil, fmt.Errorf("authenticate telegram bot: %w", err)
	}
	adapter.botUser = botUser

	// Validate the bot can access the target chat
	if err := adapter.validateChat(); err != nil {
		return nil, fmt.Errorf("validate telegram chat: %w", err)
	}

	return adapter, nil
}

func (t *TelegramAdapter) PlatformName() string { return "telegram" }

// GetUsername returns the bot username.
func (t *TelegramAdapter) GetUsername() string { return t.botUser }

// CreateRepo returns a virtual repo identifier.
// Telegram doesn't have repos — the chat_id IS the storage location.
// The pool manager still needs a unique name, so we combine chat_id + name.
func (t *TelegramAdapter) CreateRepo(ctx context.Context, name string) (string, error) {
	return fmt.Sprintf("tg:%s/%s", t.chatID, name), nil
}

func (t *TelegramAdapter) Upload(ctx context.Context, repo string, chunk types.Chunk) (types.ChunkRef, error) {
	remotePath := chunk.Ref.RemotePath
	if remotePath == "" {
		var err error
		remotePath, err = disguise.ChunkFilename()
		if err != nil {
			return types.ChunkRef{}, fmt.Errorf("generate filename: %w", err)
		}
	}

	data := chunk.Data
	var partRefs []string

	if len(data) <= maxTelegramPartSize {
		// Single part — fits within Telegram download limit
		msgID, fileID, err := t.sendDocumentWithRetry(ctx, data, remotePath)
		if err != nil {
			return types.ChunkRef{}, fmt.Errorf("upload chunk: %w", err)
		}
		partRefs = append(partRefs, fmt.Sprintf("%d:%s", msgID, fileID))
	} else {
		// Multi-part: split into 19MB sub-chunks
		for partIdx, offset := 0, 0; offset < len(data); partIdx, offset = partIdx+1, offset+maxTelegramPartSize {
			end := offset + maxTelegramPartSize
			if end > len(data) {
				end = len(data)
			}

			partName := fmt.Sprintf("%s.p%d", remotePath, partIdx)
			msgID, fileID, err := t.sendDocumentWithRetry(ctx, data[offset:end], partName)
			if err != nil {
				return types.ChunkRef{}, fmt.Errorf("upload chunk part %d: %w", partIdx, err)
			}
			partRefs = append(partRefs, fmt.Sprintf("%d:%s", msgID, fileID))
		}
	}

	ref := chunk.Ref
	ref.Platform = "telegram"
	ref.Repo = repo
	ref.RemotePath = strings.Join(partRefs, ",")
	return ref, nil
}

func (t *TelegramAdapter) Download(ctx context.Context, ref types.ChunkRef) ([]byte, error) {
	parts := strings.Split(ref.RemotePath, ",")
	var allData []byte

	for i, part := range parts {
		_, fileID, err := parsePartRef(part)
		if err != nil {
			return nil, fmt.Errorf("parse part ref %d: %w", i, err)
		}

		data, err := t.downloadFile(ctx, fileID)
		if err != nil {
			return nil, fmt.Errorf("download part %d: %w", i, err)
		}
		allData = append(allData, data...)
	}

	return allData, nil
}

// Delete removes every message part of a chunk from the chat. Each part is
// attempted (a failure on one part doesn't skip the rest), and per-part errors
// are collected: any real failure is returned so the deletion worker's
// MarkDeletionFailed retries within Telegram's 48-hour deletion window instead
// of recording a false success and orphaning the messages in the chat forever.
// "message to delete not found" (already gone) and "message can't be deleted"
// (permanently undeletable — e.g. past the 48h window in a non-admin chat) are
// treated as success: retrying can never improve on either.
func (t *TelegramAdapter) Delete(ctx context.Context, ref types.ChunkRef) error {
	parts := strings.Split(ref.RemotePath, ",")

	var errs []error
	for i, part := range parts {
		msgID, _, err := parsePartRef(part)
		if err != nil {
			errs = append(errs, fmt.Errorf("parse part ref %d: %w", i, err))
			continue
		}

		if err := t.deleteMessage(ctx, msgID); err != nil {
			if isTelegramDeleteFinal(err) {
				log.Printf("telegram: message %d already gone or undeletable, treating as deleted: %v", msgID, err)
				continue
			}
			log.Printf("telegram: failed to delete message %d: %v", msgID, err)
			errs = append(errs, fmt.Errorf("delete message %d: %w", msgID, err))
		}
	}

	return errors.Join(errs...)
}

// isTelegramDeleteFinal reports whether a deleteMessage failure is terminal —
// the message is already gone or the Bot API will never allow deleting it —
// so the deletion should be recorded as done rather than retried.
func isTelegramDeleteFinal(err error) bool {
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "message to delete not found") ||
		strings.Contains(msg, "message can't be deleted")
}

func (t *TelegramAdapter) GetRepoSize(ctx context.Context, repo string) (int64, error) {
	// Telegram doesn't expose storage usage per chat.
	// The pipeline tracks this via the DB instead.
	return 0, nil
}

func (t *TelegramAdapter) ListChunks(ctx context.Context, repo string) ([]types.ChunkRef, error) {
	// Telegram Bot API doesn't support efficient message listing.
	// The pipeline tracks chunks via the DB.
	return nil, nil
}

// --- Telegram Bot API helpers ---

func (t *TelegramAdapter) apiURL(method string) string {
	return fmt.Sprintf("%s/bot%s/%s", t.apiBase, t.botToken, method)
}

// getMe validates the bot token and returns the bot username.
// Only called at construction — bounded so a blocked/unreachable Telegram
// fails fast instead of hanging on the timeout-less upload client.
func (t *TelegramAdapter) getMe() (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), telegramValidateTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", t.apiURL("getMe"), nil)
	if err != nil {
		return "", fmt.Errorf("create getMe request: %w", err)
	}

	resp, err := t.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("getMe request: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		OK     bool `json:"ok"`
		Result struct {
			Username string `json:"username"`
		} `json:"result"`
		Description string `json:"description"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode getMe: %w", err)
	}
	if !result.OK {
		return "", fmt.Errorf("getMe failed: %s", result.Description)
	}

	return result.Result.Username, nil
}

// validateChat verifies the bot can access the target chat.
// Only called at construction — bounded like getMe.
func (t *TelegramAdapter) validateChat() error {
	ctx, cancel := context.WithTimeout(context.Background(), telegramValidateTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", t.apiURL("getChat")+"?chat_id="+t.chatID, nil)
	if err != nil {
		return fmt.Errorf("create getChat request: %w", err)
	}

	resp, err := t.client.Do(req)
	if err != nil {
		return fmt.Errorf("getChat request: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("decode getChat: %w", err)
	}
	if !result.OK {
		return fmt.Errorf("bot cannot access chat %s: %s", t.chatID, result.Description)
	}

	return nil
}

// sendDocumentWithRetry uploads a document with exponential backoff retries.
func (t *TelegramAdapter) sendDocumentWithRetry(ctx context.Context, data []byte, filename string) (int64, string, error) {
	var lastErr error

	for attempt := 0; attempt <= telegramMaxRetries; attempt++ {
		if attempt > 0 {
			wait := telegramRetryBase * time.Duration(math.Pow(2, float64(attempt-1)))
			log.Printf("telegram: retrying sendDocument (attempt %d/%d) after %v: %v", attempt, telegramMaxRetries, wait, lastErr)
			select {
			case <-ctx.Done():
				return 0, "", ctx.Err()
			case <-time.After(wait):
			}
		}

		msgID, fileID, err := t.sendDocument(ctx, data, filename)
		if err == nil {
			return msgID, fileID, nil
		}

		lastErr = err
		errStr := err.Error()

		// Retry on transient errors or rate limits
		if isRetryable(err) || strings.Contains(errStr, "429") || strings.Contains(errStr, "500") {
			continue
		}

		// Non-retryable error
		return 0, "", err
	}

	return 0, "", fmt.Errorf("sendDocument after %d retries: %w", telegramMaxRetries, lastErr)
}

// sendDocument uploads a file as a document to the chat.
func (t *TelegramAdapter) sendDocument(ctx context.Context, data []byte, filename string) (int64, string, error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	if err := w.WriteField("chat_id", t.chatID); err != nil {
		return 0, "", fmt.Errorf("write chat_id: %w", err)
	}
	// Suppress notifications to avoid spam
	if err := w.WriteField("disable_notification", "true"); err != nil {
		return 0, "", fmt.Errorf("write disable_notification: %w", err)
	}

	part, err := w.CreateFormFile("document", filename)
	if err != nil {
		return 0, "", fmt.Errorf("create form file: %w", err)
	}
	if _, err := part.Write(data); err != nil {
		return 0, "", fmt.Errorf("write file data: %w", err)
	}
	if err := w.Close(); err != nil {
		return 0, "", fmt.Errorf("close multipart: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", t.apiURL("sendDocument"), &buf)
	if err != nil {
		return 0, "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", w.FormDataContentType())

	resp, err := t.client.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var result struct {
		OK     bool `json:"ok"`
		Result struct {
			MessageID int64 `json:"message_id"`
			Document  struct {
				FileID string `json:"file_id"`
			} `json:"document"`
		} `json:"result"`
		Description string `json:"description"`
		Parameters  struct {
			RetryAfter int `json:"retry_after"`
		} `json:"parameters"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return 0, "", fmt.Errorf("decode sendDocument: %w", err)
	}

	if !result.OK {
		if result.Parameters.RetryAfter > 0 {
			return 0, "", fmt.Errorf("429 rate limited (retry after %ds): %s", result.Parameters.RetryAfter, result.Description)
		}
		return 0, "", fmt.Errorf("sendDocument failed: %s", result.Description)
	}

	return result.Result.MessageID, result.Result.Document.FileID, nil
}

// downloadFile fetches a file by file_id via getFile + HTTP download.
func (t *TelegramAdapter) downloadFile(ctx context.Context, fileID string) ([]byte, error) {
	// Step 1: Get file path from Telegram servers
	getFileURL := fmt.Sprintf("%s?file_id=%s", t.apiURL("getFile"), fileID)
	req, err := http.NewRequestWithContext(ctx, "GET", getFileURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create getFile request: %w", err)
	}

	resp, err := t.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("getFile: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		OK     bool `json:"ok"`
		Result struct {
			FilePath string `json:"file_path"`
		} `json:"result"`
		Description string `json:"description"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode getFile: %w", err)
	}
	if !result.OK {
		return nil, fmt.Errorf("getFile failed: %s", result.Description)
	}

	// Step 2: Download the actual file content
	downloadURL := fmt.Sprintf("%s/file/bot%s/%s", t.apiBase, t.botToken, result.Result.FilePath)
	dlReq, err := http.NewRequestWithContext(ctx, "GET", downloadURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create download request: %w", err)
	}

	dlResp, err := t.client.Do(dlReq)
	if err != nil {
		return nil, fmt.Errorf("download file: %w", err)
	}
	defer dlResp.Body.Close()

	if dlResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(dlResp.Body)
		return nil, fmt.Errorf("download returned %d: %s", dlResp.StatusCode, string(body))
	}

	data, err := io.ReadAll(dlResp.Body)
	if err != nil {
		return nil, fmt.Errorf("read download body: %w", err)
	}

	return data, nil
}

// deleteMessage deletes a message from the chat.
func (t *TelegramAdapter) deleteMessage(ctx context.Context, messageID int64) error {
	payload := map[string]interface{}{
		"chat_id":    t.chatID,
		"message_id": messageID,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal deleteMessage: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", t.apiURL("deleteMessage"), bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create deleteMessage request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := t.client.Do(req)
	if err != nil {
		return fmt.Errorf("deleteMessage: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("decode deleteMessage: %w", err)
	}
	if !result.OK {
		return fmt.Errorf("deleteMessage failed: %s", result.Description)
	}

	return nil
}

// parsePartRef parses "msgId:fileId" into its components.
func parsePartRef(ref string) (int64, string, error) {
	parts := strings.SplitN(ref, ":", 2)
	if len(parts) != 2 {
		return 0, "", fmt.Errorf("invalid part ref: %q", ref)
	}
	msgID, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, "", fmt.Errorf("parse message id: %w", err)
	}
	return msgID, parts[1], nil
}
