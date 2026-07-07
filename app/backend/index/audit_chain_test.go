package index

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/zcrypt/zcrypt/types"
)

func TestComputeAuditHashDeterministic(t *testing.T) {
	uid := "user-1"
	e := &types.AuditEvent{ID: "evt-1", UserID: &uid, EventType: "login", IP: "1.2.3.4", UserAgent: "ua"}

	h1 := computeAuditHash("prev", 5, e, `{"k":"v"}`)
	h2 := computeAuditHash("prev", 5, e, `{"k":"v"}`)
	assert.Equal(t, h1, h2, "same inputs must yield the same hash")
	assert.Len(t, h1, 64, "sha256 hex is 64 chars")
}

func TestComputeAuditHashSensitivity(t *testing.T) {
	uid := "user-1"
	base := &types.AuditEvent{ID: "evt-1", UserID: &uid, EventType: "login", IP: "1.2.3.4", UserAgent: "ua"}
	h := computeAuditHash("prev", 5, base, `{"k":"v"}`)

	// Every field that feeds the chain must change the hash — otherwise a tamper
	// on that field would go undetected.
	t.Run("prev_hash", func(t *testing.T) {
		assert.NotEqual(t, h, computeAuditHash("other", 5, base, `{"k":"v"}`))
	})
	t.Run("seq", func(t *testing.T) {
		assert.NotEqual(t, h, computeAuditHash("prev", 6, base, `{"k":"v"}`))
	})
	t.Run("event_type", func(t *testing.T) {
		e := *base
		e.EventType = "logout"
		assert.NotEqual(t, h, computeAuditHash("prev", 5, &e, `{"k":"v"}`))
	})
	t.Run("ip", func(t *testing.T) {
		e := *base
		e.IP = "9.9.9.9"
		assert.NotEqual(t, h, computeAuditHash("prev", 5, &e, `{"k":"v"}`))
	})
	t.Run("metadata", func(t *testing.T) {
		assert.NotEqual(t, h, computeAuditHash("prev", 5, base, `{"k":"tampered"}`))
	})
	t.Run("user_id", func(t *testing.T) {
		other := "user-2"
		e := *base
		e.UserID = &other
		assert.NotEqual(t, h, computeAuditHash("prev", 5, &e, `{"k":"v"}`))
	})
}

func TestComputeAuditHashNilUserID(t *testing.T) {
	// A system event (no user) must hash without panicking and differ from an
	// otherwise-identical event attributed to a user.
	e := &types.AuditEvent{ID: "evt-1", EventType: "login_failed", IP: "1.2.3.4"}
	hNil := computeAuditHash("prev", 1, e, `{}`)
	assert.Len(t, hNil, 64)

	uid := ""
	e2 := *e
	e2.UserID = &uid
	// nil and pointer-to-"" both serialize the user segment as "" → same hash.
	assert.Equal(t, hNil, computeAuditHash("prev", 1, &e2, `{}`))
}
