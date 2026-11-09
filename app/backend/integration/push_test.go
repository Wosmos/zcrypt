//go:build integration

package integration_test

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const pushEndpoint = "https://fcm.googleapis.com/fcm/send/device-"

func subscribe(ts *testServer, token, endpoint string) *http.Response {
	return ts.POST("/api/push/subscribe", map[string]interface{}{
		"endpoint": endpoint,
		"keys":     map[string]string{"p256dh": "BPubKey", "auth": "AuthSecret"},
		"lang":     "de-DE",
	}, token)
}

func TestPushSubscribeStoresOnlyKnownPushServices(t *testing.T) {
	ts := setupTestServer(t)
	token := ts.registerAndLogin("push@example.com", "SecurePass@123!")
	ctx := context.Background()

	for _, bad := range []string{"https://169.254.169.254/latest", "http://fcm.googleapis.com/x", "https://evil.example/x"} {
		resp := subscribe(ts, token, bad)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode, bad)
		resp.Body.Close()
	}

	requireStatus(t, subscribe(ts, token, pushEndpoint+"1"), http.StatusOK)
	requireStatus(t, subscribe(ts, token, pushEndpoint+"1"), http.StatusOK)

	var userID string
	require.NoError(t, ts.db.Pool().QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, "push@example.com").Scan(&userID))
	subs, err := ts.db.ListPushSubscriptions(ctx, userID)
	require.NoError(t, err)
	require.Len(t, subs, 1, "re-subscribing the same browser keeps one row")
	assert.Equal(t, "de", subs[0].Lang)

	requireStatus(t, ts.POST("/api/push/unsubscribe", map[string]string{"endpoint": pushEndpoint + "1"}, token), http.StatusOK)
	subs, err = ts.db.ListPushSubscriptions(ctx, userID)
	require.NoError(t, err)
	assert.Empty(t, subs)
}

func TestPushSubscriptionsPerAccountAreBounded(t *testing.T) {
	ts := setupTestServer(t)
	token := ts.registerAndLogin("pushcap@example.com", "SecurePass@123!")
	for i := 0; i < 25; i++ {
		requireStatus(t, subscribe(ts, token, fmt.Sprintf("%s%d", pushEndpoint, i)), http.StatusOK)
	}
	var count int
	require.NoError(t, ts.db.Pool().QueryRow(context.Background(),
		`SELECT COUNT(*) FROM push_subscriptions s JOIN users u ON u.id = s.user_id WHERE u.email = $1`, "pushcap@example.com").Scan(&count))
	assert.Equal(t, 20, count)
}

func TestPushKeyIsStableAndItsPrivateHalfIsSealed(t *testing.T) {
	ts := setupTestServer(t)
	token := ts.registerAndLogin("pushkey@example.com", "SecurePass@123!")
	var first, second struct {
		PublicKey string `json:"public_key"`
	}
	decodeJSON(t, ts.GET("/api/push/key", token), &first)
	decodeJSON(t, ts.GET("/api/push/key", token), &second)
	require.NotEmpty(t, first.PublicKey)
	assert.Equal(t, first.PublicKey, second.PublicKey)

	raw, err := ts.db.GetSystemSetting(context.Background(), "push_vapid")
	require.NoError(t, err)
	assert.Contains(t, raw, first.PublicKey)
	assert.True(t, strings.Contains(raw, `"private":"`) && strings.Contains(raw, `"nonce":"`), "private key stored sealed")
}

func TestPushEndpointsNeedASignedInUser(t *testing.T) {
	ts := setupTestServer(t)
	resp := ts.GET("/api/push/key", "")
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	resp.Body.Close()
}
