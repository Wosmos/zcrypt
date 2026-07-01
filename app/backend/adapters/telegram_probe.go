package adapters

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// DetectedChat is a channel/group the bot has been added to, surfaced by the
// guided connect flow so the user never has to find a chat ID by hand.
type DetectedChat struct {
	ID    string `json:"id"` // numeric chat id as a string, e.g. "-1001234567890"
	Title string `json:"title"`
	Type  string `json:"type"` // "channel" | "group" | "supergroup"
}

// TelegramProbe validates a bot token (getMe) and detects channels/groups the
// bot has recently been added to or posted in (getUpdates). It stores nothing —
// it's a transient lookup the guided UI polls after the user adds the bot to a
// chat, so the chat ID can be auto-filled instead of hunted for.
//
// `hint` is a user-facing message for the common dead-ends (e.g. the user only
// DM'd the bot instead of adding it to a channel). A valid token with no chats
// and no hint just means "keep polling".
func TelegramProbe(botToken string) (botUsername string, chats []DetectedChat, hint string, err error) {
	botToken = strings.TrimSpace(botToken)
	if botToken == "" {
		return "", nil, "", fmt.Errorf("bot token required")
	}

	client := &http.Client{Timeout: 15 * time.Second}

	botUsername, err = telegramGetMeStandalone(client, botToken)
	if err != nil {
		return "", nil, "", err
	}

	chats, dmOnly, err := telegramDetectChats(client, botToken)
	if err != nil {
		// The token is valid (getMe passed); surface the detection problem so the
		// UI can decide whether to keep polling or fall back to manual entry.
		return botUsername, nil, "", err
	}
	if len(chats) == 0 && dmOnly {
		hint = "Looks like you only messaged the bot. Files need a channel or group — add the bot to one as an administrator (with permission to post), then Check now."
	}
	return botUsername, chats, hint, nil
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
// bot belongs to. It does NOT advance the update offset, so repeated polls keep
// seeing the same recent events (Telegram retains updates for ~24h).
//
// Returns dmOnly=true when updates arrived but none were a usable channel/group
// (e.g. the user only sent the bot a private /start) — so the UI can explain the
// dead-end instead of spinning forever.
//
// getUpdates rejects concurrent calls for the same bot with a 409 Conflict; the
// guided UI serializes its polls, but we retry here too so a stray overlap (e.g.
// two browser tabs) self-heals instead of surfacing an error.
func telegramDetectChats(client *http.Client, botToken string) (chats []DetectedChat, dmOnly bool, err error) {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			time.Sleep(1200 * time.Millisecond)
		}
		c, sawUpdates, conflict, e := telegramGetUpdatesOnce(client, botToken)
		if e == nil {
			return c, sawUpdates && len(c) == 0, nil
		}
		lastErr = e
		if !conflict {
			break // a non-conflict error won't fix itself by retrying
		}
	}
	return nil, false, lastErr
}

// telegramGetUpdatesOnce runs a single getUpdates. It reports whether ANY update
// was returned (sawUpdates) — used to tell "the bot has received nothing" apart
// from "the bot only got a private DM, not a channel" — and whether a failure was
// a transient 409 Conflict (concurrent getUpdates) worth retrying.
func telegramGetUpdatesOnce(client *http.Client, botToken string) (chats []DetectedChat, sawUpdates bool, conflict bool, err error) {
	q := url.Values{}
	q.Set("timeout", "0")
	q.Set("allowed_updates", `["my_chat_member","channel_post","message"]`)
	resp, err := client.Get(telegramAPIURL(botToken, "getUpdates") + "?" + q.Encode())
	if err != nil {
		return nil, false, false, fmt.Errorf("getUpdates request: %w", err)
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
		return nil, false, false, fmt.Errorf("decode getUpdates: %w", err)
	}
	if !result.OK {
		// A 409 Conflict ("terminated by other getUpdates request") is transient —
		// two getUpdates ran at once. Other failures (e.g. a webhook is set) are
		// not worth retrying.
		desc := strings.ToLower(result.Description)
		isConflict := strings.Contains(desc, "conflict") || strings.Contains(desc, "terminated")
		log.Printf("telegram detect: getUpdates not ok: %s", result.Description)
		return nil, false, isConflict, fmt.Errorf("getUpdates failed: %s", result.Description)
	}

	// Diagnostic: surface exactly what Telegram returned for THIS bot, so a stuck
	// "waiting" can be told apart from a wrong-bot / DM-only situation. Logs chat
	// types/titles only — never the token.
	if len(result.Result) == 0 {
		log.Printf("telegram detect: getUpdates returned 0 updates (bot has received nothing)")
	} else {
		kinds := make([]string, 0, len(result.Result))
		for _, u := range result.Result {
			switch {
			case u.MyChatMember != nil:
				kinds = append(kinds, fmt.Sprintf("my_chat_member[type=%s title=%q status=%s]",
					u.MyChatMember.Chat.Type, u.MyChatMember.Chat.Title, u.MyChatMember.NewChatMember.Status))
			case u.ChannelPost != nil:
				kinds = append(kinds, fmt.Sprintf("channel_post[type=%s title=%q]",
					u.ChannelPost.Chat.Type, u.ChannelPost.Chat.Title))
			case u.Message != nil:
				kinds = append(kinds, fmt.Sprintf("message[type=%s title=%q]",
					u.Message.Chat.Type, u.Message.Chat.Title))
			}
		}
		log.Printf("telegram detect: getUpdates returned %d update(s): %s", len(result.Result), strings.Join(kinds, ", "))
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
	return chats, len(result.Result) > 0, false, nil
}

func isStorageChatType(t string) bool {
	switch t {
	case "channel", "group", "supergroup":
		return true
	default:
		return false
	}
}
