//go:build integration

package integration_test

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type tappedEvent struct {
	Type    string
	Payload map[string]interface{}
}

// tap is one user's live event stream plus the web pushes sent to them.
type tap struct {
	mu     sync.Mutex
	sse    []tappedEvent
	pushes []string
	data   map[string]map[string]string
}

func (tp *tap) wait(t *testing.T, typ string) tappedEvent {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		tp.mu.Lock()
		for _, e := range tp.sse {
			if e.Type == typ {
				tp.mu.Unlock()
				return e
			}
		}
		tp.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}
	require.Failf(t, "event missing", "no %q event on the live stream", typ)
	return tappedEvent{}
}

func (tp *tap) has(typ string) (sse, push bool) {
	tp.mu.Lock()
	defer tp.mu.Unlock()
	for _, e := range tp.sse {
		sse = sse || e.Type == typ
	}
	for _, p := range tp.pushes {
		push = push || p == typ
	}
	return
}

func (tp *tap) pushData(typ string) map[string]string {
	tp.mu.Lock()
	defer tp.mu.Unlock()
	return tp.data[typ]
}

// settle gives asynchronous delivery time to (wrongly) happen before an
// absence is asserted.
func settle() { time.Sleep(150 * time.Millisecond) }

// bothChannels asserts a notification reached the user on the live stream and
// as a web push.
func (tp *tap) bothChannels(t *testing.T, typ string) tappedEvent {
	t.Helper()
	e := tp.wait(t, typ)
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if _, push := tp.has(typ); push {
			return e
		}
		time.Sleep(10 * time.Millisecond)
	}
	require.Failf(t, "push missing", "%q reached the live stream but not web push", typ)
	return e
}

func (tp *tap) never(t *testing.T, typ string) {
	t.Helper()
	sse, push := tp.has(typ)
	assert.False(t, sse, "%s must not reach this user's live stream", typ)
	assert.False(t, push, "%s must not reach this user as web push", typ)
}

type eventRig struct {
	ts   *testServer
	taps map[string]*tap
	subs int
}

func newEventRig(t *testing.T) *eventRig {
	ts := setupTestServer(t)
	rig := &eventRig{ts: ts, taps: map[string]*tap{}}
	ts.srv.SetPushSink(func(userID, typ string, data map[string]string) {
		tp := rig.taps[userID]
		if tp == nil {
			return
		}
		tp.mu.Lock()
		tp.pushes = append(tp.pushes, typ)
		tp.data[typ] = data
		tp.mu.Unlock()
	})
	return rig
}

// user registers an account and starts recording its events.
func (r *eventRig) user(email string) (token, id string) {
	token = r.ts.registerAndLogin(email, "SecurePass@123!")
	u, err := r.ts.db.GetUserByEmail(context.Background(), strings.ToLower(email))
	require.NoError(r.ts.t, err)
	tp := &tap{data: map[string]map[string]string{}}
	r.taps[u.ID] = tp
	r.subs++
	subID := fmt.Sprintf("tap-%d-%s", r.subs, uuid.NewString())
	ch := r.ts.hub.Subscribe(subID, u.ID, false)
	r.ts.t.Cleanup(func() { r.ts.hub.Unsubscribe(subID) })
	go func() {
		for ev := range ch {
			p, _ := ev.Payload.(map[string]interface{})
			tp.mu.Lock()
			tp.sse = append(tp.sse, tappedEvent{Type: ev.Type, Payload: p})
			tp.mu.Unlock()
		}
	}()
	return token, u.ID
}

func (r *eventRig) tap(id string) *tap { return r.taps[id] }

func dataOf(e tappedEvent) map[string]string {
	d, _ := e.Payload["data"].(map[string]string)
	return d
}

func (ts *testServer) inviteSpace(token, space, email, role string, withKey bool) *http.Response {
	body := map[string]interface{}{"email": email, "role": role}
	if withKey {
		body["wrapped_space_key"] = b64("sealed-to-" + email)
	}
	return ts.POST("/api/shared-vaults/"+space+"/members", body, token)
}

func TestSpaceEventsReachTheRightPeopleOnTheRightChannels(t *testing.T) {
	rig := newEventRig(t)
	ts := rig.ts
	owner, ownerID := rig.user("ev-owner@example.com")
	adminTok, adminID := rig.user("ev-admin@example.com")
	memberTok, memberID := rig.user("ev-member@example.com")
	bystanderTok, bystanderID := rig.user("ev-bystander@example.com")
	_ = bystanderTok
	space := ts.createSpace(owner, "Events", 0)

	t.Run("a member added with a key: invitee gets inviteReceived, admins memberJoined, others a list refresh", func(t *testing.T) {
		requireStatus(t, ts.inviteSpace(owner, space, "ev-admin@example.com", "admin", true), http.StatusCreated)
		rig.tap(adminID).bothChannels(t, "inviteReceived")

		requireStatus(t, ts.inviteSpace(adminTok, space, "ev-member@example.com", "editor", true), http.StatusCreated)
		inv := rig.tap(memberID).bothChannels(t, "inviteReceived")
		assert.Equal(t, space, dataOf(inv)["space_id"])
		assert.Equal(t, "/spaces", inv.Payload["url"])
		adminUser, err := ts.db.GetUserByID(context.Background(), adminID)
		require.NoError(t, err)
		assert.NotEmpty(t, adminUser.Username)
		assert.Equal(t, adminUser.Username, dataOf(inv)["username"], "the invitee is told who added them")

		joined := rig.tap(ownerID).bothChannels(t, "memberJoined")
		assert.Equal(t, memberID, dataOf(joined)["user_id"])
		assert.Equal(t, "editor", dataOf(joined)["role"])
		settle()
		rig.tap(adminID).never(t, "memberJoined") // the inviter already knows
		rig.tap(bystanderID).never(t, "inviteReceived")

		sse, push := rig.tap(adminID).has("spaceMembersChanged")
		assert.True(t, sse, "an existing member's list refreshes live")
		assert.False(t, push, "a list refresh is not a notification")
	})

	t.Run("a role change tells the member and refreshes everyone else", func(t *testing.T) {
		resp := ts.PATCH("/api/shared-vaults/"+space+"/members/"+memberID, map[string]string{"role": "viewer"}, owner)
		requireStatus(t, resp, http.StatusOK)
		e := rig.tap(memberID).bothChannels(t, "roleChanged")
		assert.Equal(t, "viewer", dataOf(e)["role"])
		rig.tap(adminID).wait(t, "spaceMembersChanged")
	})

	t.Run("new files reach the other members once per burst, with a count", func(t *testing.T) {
		ts.srv.SetFilesAddedWindow(200 * time.Millisecond)
		ts.enableMockStorage("ev-owner@example.com")
		f1 := ts.uploadReadyFile(owner, "a.txt", 40)
		f2 := ts.uploadReadyFile(owner, "b.txt", 40)
		f3 := ts.uploadReadyFile(owner, "c.txt", 40)
		requireStatus(t, ts.POST("/api/shared-vaults/"+space+"/files/batch", batchFiles(f1, f2), owner), http.StatusCreated)
		requireStatus(t, ts.POST("/api/shared-vaults/"+space+"/files", map[string]string{
			"file_id": f3, "wrapped_cek": b64("cek"), "wrapped_name": b64("n"),
		}, owner), http.StatusCreated)

		e := rig.tap(memberID).bothChannels(t, "filesAdded")
		assert.Equal(t, "3", dataOf(e)["count"], "one event for the whole burst")
		assert.Equal(t, ownerID, dataOf(e)["user_id"])
		time.Sleep(500 * time.Millisecond)
		rig.tap(memberID).mu.Lock()
		n := 0
		for _, ev := range rig.tap(memberID).sse {
			if ev.Type == "filesAdded" {
				n++
			}
		}
		rig.tap(memberID).mu.Unlock()
		assert.Equal(t, 1, n)
		rig.tap(ownerID).never(t, "filesAdded")
		rig.tap(bystanderID).never(t, "filesAdded")
	})

	t.Run("a member leaving tells owner and admins, and refreshes the rest", func(t *testing.T) {
		requireStatus(t, ts.DELETE("/api/shared-vaults/"+space+"/members/"+memberID, memberTok), http.StatusOK)
		left := rig.tap(ownerID).bothChannels(t, "memberLeft")
		assert.Equal(t, memberID, dataOf(left)["user_id"])
		rig.tap(adminID).bothChannels(t, "memberLeft")
		settle()
		rig.tap(memberID).never(t, "memberLeft")
		rig.tap(memberID).never(t, "memberRemoved")
		rig.tap(bystanderID).never(t, "memberLeft")
	})

	t.Run("removing a member tells them, and refreshes the remaining members", func(t *testing.T) {
		requireStatus(t, ts.inviteSpace(owner, space, "ev-member@example.com", "viewer", true), http.StatusCreated)
		before := countSSE(rig.tap(adminID), "spaceMembersChanged")
		requireStatus(t, ts.DELETE("/api/shared-vaults/"+space+"/members/"+memberID, owner), http.StatusOK)
		rig.tap(memberID).bothChannels(t, "memberRemoved")
		require.Eventually(t, func() bool { return countSSE(rig.tap(adminID), "spaceMembersChanged") > before }, 3*time.Second, 10*time.Millisecond)
		_, push := rig.tap(adminID).has("memberRemoved")
		assert.False(t, push)
	})

	t.Run("deleting the Space tells every former member but not the owner", func(t *testing.T) {
		requireStatus(t, ts.DELETE("/api/shared-vaults/"+space, owner), http.StatusOK)
		e := rig.tap(adminID).bothChannels(t, "spaceDeleted")
		assert.Equal(t, space, dataOf(e)["space_id"])
		settle()
		rig.tap(ownerID).never(t, "spaceDeleted")
		rig.tap(bystanderID).never(t, "spaceDeleted")
	})
}

func countSSE(tp *tap, typ string) int {
	tp.mu.Lock()
	defer tp.mu.Unlock()
	n := 0
	for _, e := range tp.sse {
		if e.Type == typ {
			n++
		}
	}
	return n
}
