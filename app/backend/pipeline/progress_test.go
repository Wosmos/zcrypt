package pipeline

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/types"
)

func TestEmitRoutesToCorrectUser(t *testing.T) {
	pe := NewProgressEmitter()

	ch1 := pe.Subscribe("conn-1", "user-1", false)
	ch2 := pe.Subscribe("conn-2", "user-2", false)

	pe.Emit(types.ProgressEvent{
		FileID:  "file-abc",
		UserID:  "user-1",
		Stage:   "uploading",
		Percent: 50,
	})

	// user-1 should receive the event
	select {
	case evt := <-ch1:
		p := evt.Payload.(types.ProgressEvent)
		assert.Equal(t, "file-abc", p.FileID)
		assert.Equal(t, 50, p.Percent)
		assert.Empty(t, p.UserID, "UserID should be stripped from client payload")
	case <-time.After(100 * time.Millisecond):
		t.Fatal("user-1 did not receive event")
	}

	// user-2 should NOT receive it
	select {
	case <-ch2:
		t.Fatal("user-2 should not receive user-1's event")
	case <-time.After(50 * time.Millisecond):
		// expected
	}

	pe.Unsubscribe("conn-1")
	pe.Unsubscribe("conn-2")
}

func TestAdminReceivesAllEvents(t *testing.T) {
	pe := NewProgressEmitter()

	adminCh := pe.Subscribe("admin-conn", "admin-1", true)
	userCh := pe.Subscribe("user-conn", "user-1", false)

	pe.Emit(types.ProgressEvent{
		FileID:  "file-xyz",
		UserID:  "user-1",
		Stage:   "done",
		Percent: 100,
	})

	// Both should receive
	select {
	case <-adminCh:
	case <-time.After(100 * time.Millisecond):
		t.Fatal("admin did not receive event")
	}

	select {
	case <-userCh:
	case <-time.After(100 * time.Millisecond):
		t.Fatal("user did not receive own event")
	}

	pe.Unsubscribe("admin-conn")
	pe.Unsubscribe("user-conn")
}

func TestUnsubscribeClosesChannel(t *testing.T) {
	pe := NewProgressEmitter()
	ch := pe.Subscribe("conn-1", "user-1", false)

	pe.Unsubscribe("conn-1")

	_, ok := <-ch
	assert.False(t, ok, "channel should be closed after unsubscribe")
}

func TestEmitDropsWhenSubscriberSlow(t *testing.T) {
	pe := NewProgressEmitter()
	// Buffer is 32, fill it up
	ch := pe.Subscribe("conn-1", "user-1", false)

	for i := 0; i < 40; i++ {
		pe.Emit(types.ProgressEvent{
			FileID:  "file",
			UserID:  "user-1",
			Percent: i,
		})
	}

	// Should have 32 buffered, 8 dropped — no panic, no block
	count := 0
	for {
		select {
		case <-ch:
			count++
		default:
			goto done
		}
	}
done:
	assert.Equal(t, 32, count, "should have exactly buffer-size events")

	pe.Unsubscribe("conn-1")
}

func TestEmitAuditRoutesCorrectly(t *testing.T) {
	pe := NewProgressEmitter()

	adminCh := pe.Subscribe("admin", "admin-1", true)
	user1Ch := pe.Subscribe("u1", "user-1", false)
	user2Ch := pe.Subscribe("u2", "user-2", false)

	userID := "user-1"
	pe.EmitAudit(types.AuditEvent{
		UserID:    &userID,
		EventType: "upload",
	})

	// Admin gets it
	select {
	case evt := <-adminCh:
		assert.Equal(t, "audit", evt.Type)
	case <-time.After(100 * time.Millisecond):
		t.Fatal("admin should receive audit event")
	}

	// user-1 gets it (own event)
	select {
	case <-user1Ch:
	case <-time.After(100 * time.Millisecond):
		t.Fatal("user-1 should receive own audit event")
	}

	// user-2 does NOT
	select {
	case <-user2Ch:
		t.Fatal("user-2 should not receive user-1's audit event")
	case <-time.After(50 * time.Millisecond):
	}

	pe.Unsubscribe("admin")
	pe.Unsubscribe("u1")
	pe.Unsubscribe("u2")
}

func TestErrorEvent(t *testing.T) {
	evt := ErrorEvent("file-123", "upload failed")
	assert.Equal(t, "file-123", evt.FileID)
	assert.Equal(t, "error: upload failed", evt.Stage)
	assert.Equal(t, -1, evt.Percent)
}

func TestEmitToUser(t *testing.T) {
	pe := NewProgressEmitter()

	ch1 := pe.Subscribe("c1", "user-1", false)
	ch2 := pe.Subscribe("c2", "user-2", false)

	pe.EmitToUser("user-1", SSEEvent{Type: "custom", Payload: "hello"})

	select {
	case evt := <-ch1:
		assert.Equal(t, "custom", evt.Type)
	case <-time.After(100 * time.Millisecond):
		t.Fatal("user-1 should receive event")
	}

	select {
	case <-ch2:
		t.Fatal("user-2 should not receive user-1's event")
	case <-time.After(50 * time.Millisecond):
	}

	pe.Unsubscribe("c1")
	pe.Unsubscribe("c2")
}

func TestConcurrentSubscribeEmit(t *testing.T) {
	pe := NewProgressEmitter()

	// Spawn 10 subscribers, emit 100 events, no race/panic
	done := make(chan struct{})
	for i := 0; i < 10; i++ {
		id := "conn-" + string(rune('a'+i))
		pe.Subscribe(id, "user-1", false)
	}

	go func() {
		for i := 0; i < 100; i++ {
			pe.Emit(types.ProgressEvent{
				FileID:  "file",
				UserID:  "user-1",
				Percent: i,
			})
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("concurrent emit timed out")
	}

	// Cleanup — no panic
	for i := 0; i < 10; i++ {
		pe.Unsubscribe("conn-" + string(rune('a'+i)))
	}
	require.True(t, true) // reached here = no race panic
}
