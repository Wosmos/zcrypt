//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func codeOf(t *testing.T, resp *http.Response, status int) string {
	t.Helper()
	body := requireStatus(t, resp, status)
	var e struct {
		Error string `json:"error"`
		Code  string `json:"code"`
	}
	require.NoError(t, json.Unmarshal(body, &e), string(body))
	assert.NotEmpty(t, e.Error)
	return e.Code
}

type memberRow struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	Status string `json:"status"`
}

func (ts *testServer) membersOf(token, space string) []memberRow {
	ts.t.Helper()
	var d struct {
		Members []memberRow `json:"members"`
	}
	decodeJSON(ts.t, ts.GET("/api/shared-vaults/"+space, token), &d)
	return d.Members
}

func TestKeyLookupDistinguishesTheThreeOutcomes(t *testing.T) {
	ts := setupTestServer(t)
	caller := ts.registerAndLogin("lk-caller@example.com", "SecurePass@123!")
	withKey := ts.registerAndLogin("lk-keyed@example.com", "SecurePass@123!")
	ts.registerAndLogin("lk-nokey@example.com", "SecurePass@123!")
	requireStatus(t, ts.POST("/api/keys", publishKeyBody(), withKey), http.StatusOK)

	var ready struct {
		UserID    string `json:"user_id"`
		PublicKey string `json:"public_key"`
		Status    string `json:"status"`
	}
	decodeJSON(t, ts.GET("/api/keys/lookup?identifier=lk-keyed@example.com", caller), &ready)
	assert.Equal(t, "ready", ready.Status)
	assert.NotEmpty(t, ready.PublicKey)
	assert.NotEmpty(t, ready.UserID)

	assert.Equal(t, "no_key", codeOf(t, ts.GET("/api/keys/lookup?identifier=lk-nokey@example.com", caller), http.StatusNotFound))
	assert.Equal(t, "not_found", codeOf(t, ts.GET("/api/keys/lookup?identifier=ghost@example.com", caller), http.StatusNotFound))
}

func TestKeyLookupIsRateLimitedPerCaller(t *testing.T) {
	ts := setupTestServer(t)
	caller := ts.registerAndLogin("lr-caller@example.com", "SecurePass@123!")
	other := ts.registerAndLogin("lr-other@example.com", "SecurePass@123!")

	var limited int
	for i := 0; i < 40; i++ {
		resp := ts.GET("/api/keys/lookup?identifier=ghost@example.com", caller)
		if resp.StatusCode == http.StatusTooManyRequests {
			limited++
			assert.Equal(t, "rate_limited", codeOf(t, resp, http.StatusTooManyRequests))
			assert.NotEmpty(t, resp.Header.Get("Retry-After"))
			continue
		}
		resp.Body.Close()
	}
	assert.Equal(t, 10, limited, "30 lookups pass, the rest of the 40 are refused")

	assert.Equal(t, "not_found", codeOf(t, ts.GET("/api/keys/lookup?identifier=ghost@example.com", other), http.StatusNotFound),
		"another caller keeps their own budget")
}

func TestInviteErrorCodes(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("ic-owner@example.com", "SecurePass@123!")
	editor := ts.registerAndLogin("ic-editor@example.com", "SecurePass@123!")
	ts.registerAndLogin("ic-target@example.com", "SecurePass@123!")
	stranger := ts.registerAndLogin("ic-stranger@example.com", "SecurePass@123!")
	space := ts.createSpace(owner, "Codes", 0)
	requireStatus(t, ts.inviteSpace(owner, space, "ic-editor@example.com", "editor", true), http.StatusCreated)

	assert.Equal(t, "invalid_email", codeOf(t, ts.inviteSpace(owner, space, "not-an-email", "viewer", true), http.StatusBadRequest))
	assert.Equal(t, "invalid_email", codeOf(t, ts.inviteSpace(owner, space, "", "viewer", true), http.StatusBadRequest))
	assert.Equal(t, "self_invite", codeOf(t, ts.inviteSpace(owner, space, "IC-Owner@example.com", "viewer", true), http.StatusBadRequest))
	assert.Equal(t, "not_found", codeOf(t, ts.inviteSpace(owner, space, "ic-ghost@example.com", "viewer", true), http.StatusNotFound))
	assert.Equal(t, "already_member", codeOf(t, ts.inviteSpace(owner, space, "ic-editor@example.com", "viewer", true), http.StatusConflict))
	assert.Equal(t, "forbidden", codeOf(t, ts.inviteSpace(editor, space, "ic-target@example.com", "viewer", true), http.StatusForbidden), "an editor can't invite")
	assert.Equal(t, "forbidden", codeOf(t, ts.inviteSpace(stranger, space, "ic-target@example.com", "viewer", true), http.StatusForbidden))

	requireStatus(t, ts.inviteSpace(owner, space, "ic-target@example.com", "viewer", false), http.StatusCreated)
	assert.Equal(t, "already_invited", codeOf(t, ts.inviteSpace(owner, space, "ic-target@example.com", "viewer", false), http.StatusConflict))
}

func TestPendingInviteAndKeyHandOff(t *testing.T) {
	rig := newEventRig(t)
	ts := rig.ts
	ctx := context.Background()
	owner, ownerID := rig.user("ph-owner@example.com")
	adminTok, adminID := rig.user("ph-admin@example.com")
	editorTok, editorID := rig.user("ph-editor@example.com")
	late, lateID := rig.user("ph-late@example.com")
	ownerUser, err := ts.db.GetUserByID(ctx, ownerID)
	require.NoError(t, err)
	ownerName := ownerUser.Username
	space := ts.createSpace(owner, "Pending", 0)
	requireStatus(t, ts.inviteSpace(owner, space, "ph-admin@example.com", "admin", true), http.StatusCreated)
	requireStatus(t, ts.inviteSpace(owner, space, "ph-editor@example.com", "editor", true), http.StatusCreated)

	ts.enableMockStorage("ph-owner@example.com")
	fileID := ts.uploadReadyFile(owner, "x.txt", 40)
	requireStatus(t, ts.POST("/api/shared-vaults/"+space+"/files/batch", batchFiles(fileID), owner), http.StatusCreated)

	t.Run("an account without a key becomes a pending member", func(t *testing.T) {
		resp := ts.inviteSpace(owner, space, "ph-late@example.com", "editor", false)
		var m memberRow
		decodeJSON(t, resp, &m)
		assert.Equal(t, "pending", m.Status)
		assert.Equal(t, "editor", m.Role)

		var pending *memberRow
		for _, row := range ts.membersOf(owner, space) {
			if row.UserID == lateID {
				r := row
				pending = &r
			}
		}
		require.NotNil(t, pending, "pending members are listed so clients can finish the hand-off on load")
		assert.Equal(t, "pending", pending.Status)

		rows := 0
		require.NoError(t, ts.db.Pool().QueryRow(ctx, `SELECT COUNT(*) FROM shared_vault_members WHERE vault_id = $1 AND status = 'active'`, space).Scan(&rows))
		assert.Equal(t, 3, rows)
		settle()
		rig.tap(lateID).never(t, "inviteReceived")
		rig.tap(ownerID).never(t, "spaceKeyNeeded")

		e := rig.tap(lateID).bothChannels(t, "invitePending")
		assert.Equal(t, map[string]string{"username": ownerName}, dataOf(e), "only the inviter's name: the Space is not visible to an invitee yet")
		assert.Equal(t, "/spaces", e.Payload["url"])
		rig.tap(ownerID).never(t, "invitePending")
	})

	t.Run("a pending member reads nothing and cannot act", func(t *testing.T) {
		assert.Equal(t, http.StatusNotFound, ts.GET("/api/shared-vaults/"+space, late).StatusCode)
		var list []struct {
			ID string `json:"id"`
		}
		decodeJSON(t, ts.GET("/api/shared-vaults", late), &list)
		assert.Empty(t, list)
		_, err := ts.db.MemberSpaceFileGrant(ctx, lateID, fileID)
		assert.ErrorIs(t, err, pgx.ErrNoRows, "no file grant while pending")
		resp := ts.POST("/api/shared-vaults/"+space+"/files/batch", batchFiles(fileID), late)
		assert.Equal(t, http.StatusForbidden, resp.StatusCode, "a pending editor cannot add files")
		resp.Body.Close()
	})

	t.Run("publishing a key tells the owner and admins over the live stream only", func(t *testing.T) {
		requireStatus(t, ts.POST("/api/keys", publishKeyBody(), late), http.StatusOK)
		e := rig.tap(ownerID).wait(t, "spaceKeyNeeded")
		assert.Equal(t, space, dataOf(e)["space_id"])
		assert.Equal(t, lateID, dataOf(e)["user_id"])
		rig.tap(adminID).wait(t, "spaceKeyNeeded")
		settle()
		rig.tap(editorID).never(t, "spaceKeyNeeded")
		_, push := rig.tap(ownerID).has("spaceKeyNeeded")
		assert.False(t, push)
	})

	t.Run("only an owner or admin can attach the key", func(t *testing.T) {
		path := "/api/shared-vaults/" + space + "/members/" + lateID + "/key"
		body := map[string]string{"wrapped_space_key": b64("sealed-to-late")}
		assert.Equal(t, "forbidden", codeOf(t, ts.POST(path, body, editorTok), http.StatusForbidden))
		assert.Equal(t, "forbidden", codeOf(t, ts.POST(path, body, late), http.StatusForbidden), "the invitee can't grant themselves")
		stranger := ts.registerAndLogin("ph-stranger@example.com", "SecurePass@123!")
		assert.Equal(t, "forbidden", codeOf(t, ts.POST(path, body, stranger), http.StatusForbidden))
		assert.Equal(t, "invalid_request", codeOf(t, ts.POST(path, map[string]string{"wrapped_space_key": ""}, adminTok), http.StatusBadRequest))
		assert.Equal(t, "invalid_request", codeOf(t, ts.POST(path, map[string]string{"wrapped_space_key": "***not base64***"}, adminTok), http.StatusBadRequest))
		status, err := ts.db.SharedVaultMemberStatus(ctx, space, lateID)
		require.NoError(t, err)
		assert.Equal(t, "pending", status, "refused attempts leave the member pending")
	})

	t.Run("an admin completes it: the member becomes active and can read", func(t *testing.T) {
		before := countSSE(rig.tap(ownerID), "memberJoined")
		var m memberRow
		decodeJSON(t, ts.POST("/api/shared-vaults/"+space+"/members/"+lateID+"/key",
			map[string]string{"wrapped_space_key": b64("sealed-to-late")}, adminTok), &m)
		assert.Equal(t, "active", m.Status)

		done := rig.tap(lateID).bothChannels(t, "inviteReceived")
		adminUser, err := ts.db.GetUserByID(ctx, adminID)
		require.NoError(t, err)
		assert.Equal(t, adminUser.Username, dataOf(done)["username"], "the admin who completed the invite is named")
		require.Eventually(t, func() bool { return countSSE(rig.tap(ownerID), "memberJoined") > before }, 3e9, 10e6)

		var d struct {
			Role            string `json:"role"`
			WrappedSpaceKey string `json:"wrapped_space_key"`
		}
		decodeJSON(t, ts.GET("/api/shared-vaults/"+space, late), &d)
		assert.Equal(t, "editor", d.Role)
		assert.Equal(t, b64("sealed-to-late"), d.WrappedSpaceKey)
		_, err = ts.db.MemberSpaceFileGrant(ctx, lateID, fileID)
		assert.NoError(t, err)

		assert.Equal(t, "not_pending", codeOf(t, ts.POST("/api/shared-vaults/"+space+"/members/"+lateID+"/key",
			map[string]string{"wrapped_space_key": b64("again")}, adminTok), http.StatusNotFound), "an active member's grant can't be replaced this way")
	})

	t.Run("a member who has not published a key cannot be completed", func(t *testing.T) {
		_, nokeyID := rig.user("ph-nokey@example.com")
		requireStatus(t, ts.inviteSpace(owner, space, "ph-nokey@example.com", "viewer", false), http.StatusCreated)
		assert.Equal(t, "no_key", codeOf(t, ts.POST("/api/shared-vaults/"+space+"/members/"+nokeyID+"/key",
			map[string]string{"wrapped_space_key": b64("x")}, owner), http.StatusConflict))
	})

	t.Run("a key published before the invite is announced at invite time", func(t *testing.T) {
		keyedTok, keyedID := rig.user("ph-keyed@example.com")
		requireStatus(t, ts.POST("/api/keys", publishKeyBody(), keyedTok), http.StatusOK)
		before := countSSE(rig.tap(ownerID), "spaceKeyNeeded")
		requireStatus(t, ts.inviteSpace(owner, space, "ph-keyed@example.com", "viewer", false), http.StatusCreated)
		require.Eventually(t, func() bool { return countSSE(rig.tap(ownerID), "spaceKeyNeeded") > before }, 3e9, 10e6)
		_ = keyedID
	})

	t.Run("removing a pending member needs no re-key", func(t *testing.T) {
		_, pid := rig.user("ph-drop@example.com")
		requireStatus(t, ts.inviteSpace(owner, space, "ph-drop@example.com", "viewer", false), http.StatusCreated)
		requireStatus(t, ts.DELETE("/api/shared-vaults/"+space+"/members/"+pid, owner), http.StatusOK)
		need, err := ts.db.SharedVaultNeedsRotation(ctx, space)
		require.NoError(t, err)
		assert.False(t, need)
		settle()
		rig.tap(pid).never(t, "memberRemoved")
		_ = editorTok
	})
}
