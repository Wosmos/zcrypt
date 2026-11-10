package cmd

import (
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestTransferRoomsEndOnIdleNotAge(t *testing.T) {
	start := time.Now()
	room := &transferRoom{createdAt: start}
	if room.expired(start.Add(9 * time.Minute)) {
		t.Fatal("an unjoined code expired early")
	}
	if !room.expired(start.Add(11 * time.Minute)) {
		t.Fatal("an unjoined code never expires")
	}

	room.receiver = &websocket.Conn{}
	room.lastActive.Store(start.Add(55 * time.Minute).UnixNano())
	if room.expired(start.Add(60 * time.Minute)) {
		t.Fatal("a transfer still moving data was cut off by its age")
	}
	if !room.expired(start.Add(66 * time.Minute)) {
		t.Fatal("a transfer idle past the limit was kept")
	}
}
