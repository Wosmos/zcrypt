package adapters

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/zcrypt/zcrypt/types"
)

func TestTelegramPlatformNameAndUsername(t *testing.T) {
	tg := &TelegramAdapter{botUser: "mybot"}
	if tg.PlatformName() != "telegram" {
		t.Errorf("PlatformName = %q", tg.PlatformName())
	}
	if tg.GetUsername() != "mybot" {
		t.Errorf("GetUsername = %q", tg.GetUsername())
	}
}

func TestParsePartRef(t *testing.T) {
	msgID, fileID, err := parsePartRef("42:ABC123")
	if err != nil {
		t.Fatalf("parsePartRef: %v", err)
	}
	if msgID != 42 || fileID != "ABC123" {
		t.Errorf("got (%d,%q), want (42,ABC123)", msgID, fileID)
	}
	// file id may itself contain colons — SplitN keeps the remainder intact.
	_, fileID, err = parsePartRef("7:AB:CD:EF")
	if err != nil || fileID != "AB:CD:EF" {
		t.Errorf("colon-in-fileid: got %q err %v", fileID, err)
	}
	if _, _, err := parsePartRef("noколон"); err == nil {
		t.Error("expected error for missing colon")
	}
	if _, _, err := parsePartRef("notanumber:x"); err == nil {
		t.Error("expected error for non-numeric msg id")
	}
}

func TestIsTelegramDeleteFinal(t *testing.T) {
	finals := []string{
		"Bad Request: message to delete not found",
		"Bad Request: message can't be deleted",
		"MESSAGE TO DELETE NOT FOUND", // case-insensitive
	}
	for _, s := range finals {
		if !isTelegramDeleteFinal(errors.New(s)) {
			t.Errorf("%q should be final", s)
		}
	}
	if isTelegramDeleteFinal(errors.New("Too Many Requests: retry after 5")) {
		t.Error("rate limit should not be final")
	}
}

func TestTelegramCreateRepo(t *testing.T) {
	tg := &TelegramAdapter{chatID: "@chan"}
	repo, err := tg.CreateRepo(context.Background(), "vault")
	if err != nil {
		t.Fatalf("CreateRepo: %v", err)
	}
	if repo != "tg:@chan/vault" {
		t.Errorf("repo = %q", repo)
	}
}

func TestTelegramGetRepoSizeAndListChunks(t *testing.T) {
	tg := &TelegramAdapter{}
	size, err := tg.GetRepoSize(context.Background(), "any")
	if err != nil || size != 0 {
		t.Errorf("GetRepoSize = (%d,%v), want (0,nil)", size, err)
	}
	refs, err := tg.ListChunks(context.Background(), "any")
	if err != nil || refs != nil {
		t.Errorf("ListChunks = (%v,%v), want (nil,nil)", refs, err)
	}
}

func TestTelegramAPIURLHelper(t *testing.T) {
	// package-level probe helper builds the standard Bot API URL.
	got := telegramAPIURL("TOK", "getMe")
	if !strings.HasSuffix(got, "/botTOK/getMe") {
		t.Errorf("telegramAPIURL = %q", got)
	}
}

func TestIsStorageChatType(t *testing.T) {
	for _, ty := range []string{"channel", "group", "supergroup"} {
		if !isStorageChatType(ty) {
			t.Errorf("%q should be storage type", ty)
		}
	}
	for _, ty := range []string{"private", "", "bot"} {
		if isStorageChatType(ty) {
			t.Errorf("%q should NOT be storage type", ty)
		}
	}
}

// newTelegramTestServer wires an adapter to an httptest server via apiBase so
// no real Bot API calls are made.
func newTelegramTestServer(t *testing.T, handler http.HandlerFunc) *TelegramAdapter {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return &TelegramAdapter{
		botToken: "TOK",
		chatID:   "@chan",
		apiBase:  srv.URL,
		client:   srv.Client(),
	}
}

func TestTelegramUploadDownloadRoundTrip(t *testing.T) {
	tg := newTelegramTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/sendDocument"):
			w.Write([]byte(`{"ok":true,"result":{"message_id":55,"document":{"file_id":"FID"}}}`))
		case strings.HasSuffix(r.URL.Path, "/getFile"):
			w.Write([]byte(`{"ok":true,"result":{"file_path":"documents/f.bin"}}`))
		case strings.Contains(r.URL.Path, "/file/botTOK/"):
			w.Write([]byte("chunkbytes"))
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
		}
	})

	ref, err := tg.Upload(context.Background(), "tg:@chan/vault", types.Chunk{
		Ref:  types.ChunkRef{RemotePath: "chunk.bin"},
		Data: []byte("small data"),
	})
	if err != nil {
		t.Fatalf("Upload: %v", err)
	}
	if ref.Platform != "telegram" || ref.RemotePath != "55:FID" {
		t.Errorf("unexpected ref: %+v", ref)
	}

	data, err := tg.Download(context.Background(), ref)
	if err != nil {
		t.Fatalf("Download: %v", err)
	}
	if string(data) != "chunkbytes" {
		t.Errorf("data = %q", data)
	}
}

func TestTelegramUploadMultiPart(t *testing.T) {
	// Data larger than maxTelegramPartSize is split into sub-parts, each sent as a
	// separate document; RemotePath is the comma-joined "msgId:fileId" list.
	var msgID int64
	tg := newTelegramTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		msgID++
		w.Write([]byte(`{"ok":true,"result":{"message_id":` + strconv.FormatInt(msgID, 10) + `,"document":{"file_id":"F"}}}`))
	})
	data := make([]byte, maxTelegramPartSize+1024) // → 2 parts
	ref, err := tg.Upload(context.Background(), "tg:@chan/vault", types.Chunk{
		Ref:  types.ChunkRef{RemotePath: "big.bin"},
		Data: data,
	})
	if err != nil {
		t.Fatalf("Upload: %v", err)
	}
	if got := strings.Count(ref.RemotePath, ","); got != 1 {
		t.Errorf("expected 2 parts (one comma), got RemotePath=%q", ref.RemotePath)
	}
}

func TestTelegramUploadFailureFast(t *testing.T) {
	// A non-retryable Bot API failure surfaces immediately (no retry sleeps).
	tg := newTelegramTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"ok":false,"description":"Bad Request: chat not found"}`))
	})
	_, err := tg.Upload(context.Background(), "tg:@chan/vault", types.Chunk{
		Ref:  types.ChunkRef{RemotePath: "x.bin"},
		Data: []byte("d"),
	})
	if err == nil || !strings.Contains(err.Error(), "upload chunk") {
		t.Fatalf("expected upload error, got %v", err)
	}
}

func TestTelegramDeleteSuccess(t *testing.T) {
	tg := newTelegramTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/deleteMessage") {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		w.Write([]byte(`{"ok":true}`))
	})
	err := tg.Delete(context.Background(), types.ChunkRef{RemotePath: "55:FID,56:FID2"})
	if err != nil {
		t.Fatalf("Delete: %v", err)
	}
}

func TestTelegramDeleteAlreadyGoneIsSuccess(t *testing.T) {
	tg := newTelegramTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"ok":false,"description":"Bad Request: message to delete not found"}`))
	})
	// "already gone" is terminal → treated as deleted, no error surfaced.
	err := tg.Delete(context.Background(), types.ChunkRef{RemotePath: "55:FID"})
	if err != nil {
		t.Fatalf("Delete of already-gone message should be nil, got %v", err)
	}
}

func TestTelegramDeleteRealFailureReturnsError(t *testing.T) {
	tg := newTelegramTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"ok":false,"description":"Forbidden: bot is not a member"}`))
	})
	err := tg.Delete(context.Background(), types.ChunkRef{RemotePath: "55:FID"})
	if err == nil {
		t.Fatal("expected a real deletion failure to surface")
	}
}

func TestTelegramGetMe(t *testing.T) {
	tg := newTelegramTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"ok":true,"result":{"username":"thebot"}}`))
	})
	user, err := tg.getMe()
	if err != nil {
		t.Fatalf("getMe: %v", err)
	}
	if user != "thebot" {
		t.Errorf("user = %q", user)
	}
}

func TestTelegramGetMeStandalone(t *testing.T) {
	client := &http.Client{Transport: rtFunc(func(r *http.Request) (*http.Response, error) {
		if !strings.HasSuffix(r.URL.Path, "/getMe") {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		return jsonResp(200, `{"ok":true,"result":{"username":"probebot"}}`, nil), nil
	})}
	name, err := telegramGetMeStandalone(client, "TOK")
	if err != nil {
		t.Fatalf("telegramGetMeStandalone: %v", err)
	}
	if name != "probebot" {
		t.Errorf("name = %q", name)
	}

	// Invalid token → ok:false surfaces an error.
	bad := &http.Client{Transport: rtFunc(func(r *http.Request) (*http.Response, error) {
		return jsonResp(200, `{"ok":false}`, nil), nil
	})}
	if _, err := telegramGetMeStandalone(bad, "TOK"); err == nil {
		t.Error("expected error for invalid token")
	}
}

func TestTelegramGetUpdatesOnceDetectsChats(t *testing.T) {
	updates := `{"ok":true,"result":[
		{"my_chat_member":{"chat":{"id":-100123,"title":"Vault","type":"channel"},"new_chat_member":{"status":"administrator"}}},
		{"message":{"chat":{"id":42,"title":"","type":"private"}}},
		{"channel_post":{"chat":{"id":-100999,"title":"Second","type":"supergroup"}}}
	]}`
	client := &http.Client{Transport: rtFunc(func(r *http.Request) (*http.Response, error) {
		return jsonResp(200, updates, nil), nil
	})}
	chats, sawUpdates, conflict, err := telegramGetUpdatesOnce(client, "TOK")
	if err != nil {
		t.Fatalf("telegramGetUpdatesOnce: %v", err)
	}
	if !sawUpdates || conflict {
		t.Errorf("sawUpdates=%v conflict=%v", sawUpdates, conflict)
	}
	// private DM excluded; channel + supergroup kept.
	if len(chats) != 2 {
		t.Fatalf("got %d chats, want 2: %+v", len(chats), chats)
	}
	if chats[0].ID != "-100123" || chats[0].Type != "channel" {
		t.Errorf("unexpected first chat: %+v", chats[0])
	}
}

func TestTelegramGetUpdatesOnceRemovesLeftChat(t *testing.T) {
	updates := `{"ok":true,"result":[
		{"my_chat_member":{"chat":{"id":-100123,"title":"Vault","type":"channel"},"new_chat_member":{"status":"administrator"}}},
		{"my_chat_member":{"chat":{"id":-100123,"title":"Vault","type":"channel"},"new_chat_member":{"status":"left"}}}
	]}`
	client := &http.Client{Transport: rtFunc(func(r *http.Request) (*http.Response, error) {
		return jsonResp(200, updates, nil), nil
	})}
	chats, _, _, err := telegramGetUpdatesOnce(client, "TOK")
	if err != nil {
		t.Fatalf("telegramGetUpdatesOnce: %v", err)
	}
	if len(chats) != 0 {
		t.Errorf("left chat should be removed, got %+v", chats)
	}
}

func TestTelegramGetUpdatesOnceConflict(t *testing.T) {
	client := &http.Client{Transport: rtFunc(func(r *http.Request) (*http.Response, error) {
		return jsonResp(200, `{"ok":false,"description":"Conflict: terminated by other getUpdates request"}`, nil), nil
	})}
	_, _, conflict, err := telegramGetUpdatesOnce(client, "TOK")
	if err == nil || !conflict {
		t.Fatalf("expected conflict error, got conflict=%v err=%v", conflict, err)
	}
}

func TestTelegramDetectChats(t *testing.T) {
	client := &http.Client{Transport: rtFunc(func(r *http.Request) (*http.Response, error) {
		return jsonResp(200, `{"ok":true,"result":[{"message":{"chat":{"id":7,"title":"","type":"private"}}}]}`, nil), nil
	})}
	chats, dmOnly, err := telegramDetectChats(client, "TOK")
	if err != nil {
		t.Fatalf("telegramDetectChats: %v", err)
	}
	if len(chats) != 0 || !dmOnly {
		t.Errorf("expected dmOnly with no chats, got chats=%+v dmOnly=%v", chats, dmOnly)
	}
}

func TestTelegramValidateChat(t *testing.T) {
	ok := newTelegramTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"ok":true}`))
	})
	if err := ok.validateChat(); err != nil {
		t.Fatalf("validateChat: %v", err)
	}

	bad := newTelegramTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"ok":false,"description":"chat not found"}`))
	})
	if err := bad.validateChat(); err == nil {
		t.Fatal("expected validateChat error")
	}
}
