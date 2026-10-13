package cmd

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSessionLiveCache(t *testing.T) {
	calls := 0
	live := true
	c := newSessionLiveCache(time.Minute, func(context.Context, string, string) (bool, error) {
		calls++
		return live, nil
	})
	ok, err := c.live(context.Background(), "u", "s")
	require.NoError(t, err)
	assert.True(t, ok)
	_, _ = c.live(context.Background(), "u", "s")
	assert.Equal(t, 1, calls, "positive answers are cached")

	live = false
	c.invalidate("u", "s")
	ok, _ = c.live(context.Background(), "u", "s")
	assert.False(t, ok)
	ok, _ = c.live(context.Background(), "u", "s")
	assert.False(t, ok)
	assert.Equal(t, 3, calls, "negative answers are never cached")

	var nilCache *sessionLiveCache
	ok, err = nilCache.live(context.Background(), "u", "s")
	assert.True(t, ok)
	assert.NoError(t, err)

	boom := newSessionLiveCache(0, func(context.Context, string, string) (bool, error) { return false, errors.New("db") })
	_, err = boom.live(context.Background(), "u", "s")
	assert.Error(t, err)
}

func TestSessionRevokedChecksMemoryThenStore(t *testing.T) {
	s := &Server{
		revokedSessions: newRevokedSessions(),
		sessionLive: newSessionLiveCache(0, func(_ context.Context, _, id string) (bool, error) {
			return id != "gone", nil
		}),
	}
	revoked, err := s.sessionRevoked(context.Background(), "u", "")
	require.NoError(t, err)
	assert.False(t, revoked, "no session id means a pre-device-management token")
	revoked, _ = s.sessionRevoked(context.Background(), "u", "alive")
	assert.False(t, revoked)
	revoked, _ = s.sessionRevoked(context.Background(), "u", "gone")
	assert.True(t, revoked, "missing in the store means revoked, even after a restart")
	s.revokedSessions.add("alive")
	revoked, _ = s.sessionRevoked(context.Background(), "u", "alive")
	assert.True(t, revoked)
}

func TestUUIDPathParams(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /x/{id}", uuidPathParams(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }, "id"))
	for path, want := range map[string]int{
		"/x/not-a-uuid": http.StatusBadRequest,
		"/x/00000000-0000-0000-0000-000000000001": http.StatusOK,
	} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		assert.Equal(t, want, rec.Code, path)
	}
	bad := "x"
	assert.False(t, validOptionalUUID(&bad))
	assert.True(t, validOptionalUUID(nil))
}

func TestTransferHubCaps(t *testing.T) {
	h := &transferHub{rooms: make(map[string]*transferRoom)}
	for i := 0; i < maxTransferRoomsPerIP; i++ {
		_, err := h.createRoom("1.1.1.1")
		require.NoError(t, err)
	}
	_, err := h.createRoom("1.1.1.1")
	assert.Error(t, err, "per-IP live room cap")
	_, err = h.createRoom("2.2.2.2")
	assert.NoError(t, err, "other IPs are unaffected")

	for i := 0; len(h.rooms) < maxTransferRooms; i++ {
		h.rooms[string(rune('a'+i%26))+time.Duration(i).String()] = &transferRoom{ip: "x"}
	}
	_, err = h.createRoom("3.3.3.3")
	assert.Error(t, err, "global live room cap")
}
