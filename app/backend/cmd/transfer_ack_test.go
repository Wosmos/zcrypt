package cmd

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/zcrypt/zcrypt/config"
)

func dialTransfer(t *testing.T, srv *httptest.Server) (*websocket.Conn, context.Context) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	t.Cleanup(cancel)
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { c.CloseNow() })
	return c, ctx
}

func readType(t *testing.T, ctx context.Context, c *websocket.Conn) transferMessage {
	t.Helper()
	_, msg, err := c.Read(ctx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	var m transferMessage
	if err := json.Unmarshal(msg, &m); err != nil {
		t.Fatal(err)
	}
	return m
}

func pairedTransfer(t *testing.T) (sender, receiver *websocket.Conn, ctx context.Context) {
	t.Helper()
	s := &Server{cfg: &config.Config{}, transferHub: newTransferHub(), devMode: true}
	srv := httptest.NewServer(http.HandlerFunc(s.HandleTransferWS))
	t.Cleanup(srv.Close)
	sender, ctx = dialTransfer(t, srv)
	if err := sender.Write(ctx, websocket.MessageText, []byte(`{"type":"create"}`)); err != nil {
		t.Fatal(err)
	}
	code := readType(t, ctx, sender)
	var c string
	_ = json.Unmarshal(code.Data, &c)
	receiver, _ = dialTransfer(t, srv)
	join, _ := json.Marshal(map[string]any{"type": "join", "data": c})
	if err := receiver.Write(ctx, websocket.MessageText, join); err != nil {
		t.Fatal(err)
	}
	if m := readType(t, ctx, receiver); m.Type != "paired" {
		t.Fatalf("receiver got %q", m.Type)
	}
	if m := readType(t, ctx, sender); m.Type != "paired" {
		t.Fatalf("sender got %q", m.Type)
	}
	return sender, receiver, ctx
}

func TestTransferReceiverAckReachesSender(t *testing.T) {
	sender, receiver, ctx := pairedTransfer(t)
	_ = sender.Write(ctx, websocket.MessageText, []byte(`{"type":"done"}`))
	if m := readType(t, ctx, receiver); m.Type != "done" {
		t.Fatalf("receiver got %q", m.Type)
	}
	_ = receiver.Write(ctx, websocket.MessageText, []byte(`{"type":"ack"}`))
	if m := readType(t, ctx, sender); m.Type != "ack" {
		t.Fatalf("sender got %q, want ack", m.Type)
	}
}

func TestTransferReceiverCannotInjectOtherMessages(t *testing.T) {
	sender, receiver, ctx := pairedTransfer(t)
	_ = receiver.Write(ctx, websocket.MessageText, []byte(`{"type":"chunk","data":{}}`))
	_ = receiver.Write(ctx, websocket.MessageText, []byte(`{"type":"cancel"}`))
	if m := readType(t, ctx, sender); m.Type != "cancel" {
		t.Fatalf("sender got %q, want cancel (chunk must not be forwarded)", m.Type)
	}
}
