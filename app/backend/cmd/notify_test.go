package cmd

import (
	"sync"
	"testing"
	"time"

	"github.com/zcrypt/zcrypt/pipeline"
)

type pushLog struct {
	mu   sync.Mutex
	sent []pushMessage
	to   []string
}

func (p *pushLog) sink(userID string, msg pushMessage) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.to = append(p.to, userID)
	p.sent = append(p.sent, msg)
}

func recv(ch <-chan pipeline.SSEEvent) (pipeline.SSEEvent, bool) {
	select {
	case ev := <-ch:
		return ev, true
	case <-time.After(100 * time.Millisecond):
		return pipeline.SSEEvent{}, false
	}
}

func TestNotifyUserUsesBothChannels(t *testing.T) {
	hub := pipeline.NewProgressEmitter()
	mine := hub.Subscribe("a", "u1", false)
	other := hub.Subscribe("b", "u2", false)
	log := &pushLog{}
	s := &Server{progress: hub, pushSink: log.sink}

	s.notifyUser("u1", userEvent{Type: "inviteReceived", Data: map[string]string{"space_id": "s1"}, URL: "/spaces"})

	ev, ok := recv(mine)
	if !ok || ev.Type != "inviteReceived" {
		t.Fatalf("live stream got %+v ok=%v", ev, ok)
	}
	payload := ev.Payload.(map[string]interface{})
	if payload["type"] != "inviteReceived" || payload["url"] != "/spaces" || payload["data"].(map[string]string)["space_id"] != "s1" {
		t.Errorf("payload = %+v", payload)
	}
	if len(log.sent) != 1 || log.to[0] != "u1" || log.sent[0].Type != "inviteReceived" || log.sent[0].Data["space_id"] != "s1" || log.sent[0].URL != "/spaces" {
		t.Errorf("push = %+v to %v", log.sent, log.to)
	}
	if _, ok := recv(other); ok {
		t.Error("another user's stream received the event")
	}
}

func TestSignalUserIsLiveOnly(t *testing.T) {
	hub := pipeline.NewProgressEmitter()
	mine := hub.Subscribe("a", "u1", false)
	log := &pushLog{}
	s := &Server{progress: hub, pushSink: log.sink}

	s.signalUser("u1", userEvent{Type: "spaceMembersChanged"})

	ev, ok := recv(mine)
	if !ok || ev.Type != "spaceMembersChanged" {
		t.Fatalf("live stream got %+v ok=%v", ev, ok)
	}
	if ev.Payload.(map[string]interface{})["data"] == nil {
		t.Error("data must be an object, never null")
	}
	if len(log.sent) != 0 {
		t.Errorf("a state signal was pushed: %+v", log.sent)
	}
}

func TestFilesAddedBurstBecomesOneEvent(t *testing.T) {
	type burst struct {
		space, actor string
		count        int
	}
	flushed := make(chan burst, 4)
	s := &Server{filesAdded: newFilesAddedBatcher(40 * time.Millisecond)}
	s.filesAdded.flush = func(space, actor string, count int) { flushed <- burst{space, actor, count} }

	for _, n := range []int{2, 1, 4} {
		s.spaceFilesAdded("space", "actor", n)
		time.Sleep(10 * time.Millisecond)
	}
	s.spaceFilesAdded("space", "other-actor", 1)
	s.spaceFilesAdded("space", "actor", 0)

	got := map[string]int{}
	for i := 0; i < 2; i++ {
		select {
		case b := <-flushed:
			got[b.actor] += b.count
		case <-time.After(time.Second):
			t.Fatalf("burst never flushed, got %v", got)
		}
	}
	if got["actor"] != 7 || got["other-actor"] != 1 {
		t.Errorf("flushed %v, want actor=7 other-actor=1", got)
	}
	select {
	case extra := <-flushed:
		t.Errorf("extra flush %+v", extra)
	case <-time.After(150 * time.Millisecond):
	}
}

func TestValidInviteEmail(t *testing.T) {
	for in, want := range map[string]bool{
		"a@b.co": true, "first.last@example.com": true,
		"": false, "nope": false, "a@": false, "Name <a@b.co>": false, "a b@c.co": false,
	} {
		if got := validInviteEmail(in); got != want {
			t.Errorf("validInviteEmail(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestWithoutDropsListedIDs(t *testing.T) {
	got := without([]string{"a", "b", "c"}, "b", "z")
	if len(got) != 2 || got[0] != "a" || got[1] != "c" {
		t.Errorf("without = %v", got)
	}
}
