package adapters

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// DetectedChat is a channel/group the bot has been added to, surfaced by the
// guided connect flow so the user never has to find a chat ID by hand.
type DetectedChat struct {
	ID    string `json:"id"`    // numeric chat id as a string, e.g. "-1001234567890"
	Title string `json:"title"`
	Type  string `json:"type"` // "channel" | "group" | "supergroup"
}

// TelegramProbe validates a bot token (getMe) and detects channels/groups the
// bot has recently been added to or posted in (getUpdates). It stores nothing —
// it's a transient lookup the guided UI polls after the user adds the bot to a
// chat via a deep link, so the chat ID can be auto-filled instead of hunted for.
//
// A valid token with no detected chats yet is NOT an error: the caller keeps
// polling until the user finishes adding the bot.
func TelegramProbe(botToken string) (botUsername string, chats []DetectedChat, err error) {
	botToken = strings.TrimSpace(botToken)
	if botToken == "" {
		return "", nil, fmt.Errorf("bot token required")
	}

	client := &http.Client{Timeout: 15 * time.Second}

	botUsername, err = telegramGetMeStandalone(client, botToken)
	if err != nil {
		return "", nil, err
	}

	chats, err = telegramDetectChats(client, botToken)
	if err != nil {
		// The token is valid (getMe passed); surface the detection problem so the
		// UI can decide whether to keep polling or fall back to manual entry.
		return botUsername, nil, err
	}
	return botUsername, chats, nil
}

func telegramAPIURL(botToken, method string) string {
	return fmt.Sprintf("%s/bot%s/%s", telegramAPIBase, botToken, method)
}

// telegramGetMeStandalone mirrors TelegramAdapter.getMe but works from just a
// bot token (no chat required yet).
func telegramGetMeStandalone(client *http.Client, botToken string) (string, error) {
	resp, err := client.Get(telegramAPIURL(botToken, "getMe"))
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
		return "", fmt.Errorf("invalid bot token")
	}
	return result.Result.Username, nil
}

// telegramDetectChats pulls pending updates and extracts the channels/groups the
// bot now belongs to. It does NOT advance the update offset, so repeated polls
// keep seeing the same recent events (Telegram retains updates for ~24h).
//
// getUpdates rejects concurrent calls for the same bot with a 409 Conflict; the
// guided UI serializes its polls, but we retry a couple of times here too so a
// stray overlap (e.g. two browser tabs) self-heals instead of surfacing an error.
func telegramDetectChats(client *http.Client, botToken string) ([]DetectedChat, error) {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			time.Sleep(1200 * time.Millisecond)
		}
		chats, conflict, err := telegramGetUpdatesOnce(client, botToken)
		if err == nil {
			return chats, nil
		}
		lastErr = err
		if !conflict {
			break // a non-conflict error won't fix itself by retrying
		}
	}
	return nil, lastErr
}

// telegramGetUpdatesOnce runs a single getUpdates and reports whether the failure
// was a transient 409 Conflict (concurrent getUpdates), which is worth retrying.
func telegramGetUpdatesOnce(client *http.Client, botToken string) (chats []DetectedChat, conflict bool, err error) {
	q := url.Values{}
	q.Set("timeout", "0")
	q.Set("allowed_updates", `["my_chat_member","channel_post","message"]`)
	resp, err := client.Get(telegramAPIURL(botToken, "getUpdates") + "?" + q.Encode())
	if err != nil {
		return nil, false, fmt.Errorf("getUpdates request: %w", err)
	}
	defer resp.Body.Close()

	type chatPayload struct {
		ID    int64  `json:"id"`
		Title string `json:"title"`
		Type  string `json:"type"`
	}
	var result struct {
		OK     bool `json:"ok"`
		Result []struct {
			MyChatMember *struct {
				Chat          chatPayload `json:"chat"`
				NewChatMember struct {
					Status string `json:"status"`
				} `json:"new_chat_member"`
			} `json:"my_chat_member"`
			ChannelPost *struct {
				Chat chatPayload `json:"chat"`
			} `json:"channel_post"`
			Message *struct {
				Chat chatPayload `json:"chat"`
			} `json:"message"`
		} `json:"result"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, false, fmt.Errorf("decode getUpdates: %w", err)
	}
	if !result.OK {
		// A 409 Conflict ("terminated by other getUpdates request") is transient —
		// two getUpdates ran at once. Other failures (e.g. a webhook is set) are
		// not worth retrying.
		desc := strings.ToLower(result.Description)
		isConflict := strings.Contains(desc, "conflict") || strings.Contains(desc, "terminated")
		return nil, isConflict, fmt.Errorf("getUpdates failed: %s", result.Description)
	}

	// Dedup by chat id, keeping the latest title seen. Only channels/groups can
	// be storage; a "left"/"kicked" status means the bot was removed.
	seen := make(map[int64]DetectedChat)
	order := []int64{}
	add := func(c chatPayload) {
		if c.ID == 0 || !isStorageChatType(c.Type) {
			return
		}
		if _, ok := seen[c.ID]; !ok {
			order = append(order, c.ID)
		}
		seen[c.ID] = DetectedChat{ID: strconv.FormatInt(c.ID, 10), Title: c.Title, Type: c.Type}
	}
	remove := func(id int64) {
		delete(seen, id)
	}

	for _, u := range result.Result {
		switch {
		case u.MyChatMember != nil:
			status := u.MyChatMember.NewChatMember.Status
			if status == "left" || status == "kicked" {
				remove(u.MyChatMember.Chat.ID)
				continue
			}
			add(u.MyChatMember.Chat)
		case u.ChannelPost != nil:
			add(u.ChannelPost.Chat)
		case u.Message != nil:
			add(u.Message.Chat)
		}
	}

	chats = make([]DetectedChat, 0, len(order))
	for _, id := range order {
		if c, ok := seen[id]; ok {
			chats = append(chats, c)
		}
	}
	return chats, false, nil
}

func isStorageChatType(t string) bool {
	switch t {
	case "channel", "group", "supergroup":
		return true
	default:
		return false
	}
}
