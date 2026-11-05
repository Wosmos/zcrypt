//go:build integration

package integration_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type themePref struct {
	DeviceID    string `json:"device_id"`
	ColorTheme  string `json:"color_theme"`
	Mode        string `json:"mode"`
	CustomTheme string `json:"custom_theme"`
	Sync        bool   `json:"sync"`
	Saved       bool   `json:"saved"`
}

func (ts *testServer) getPref(token, device string) themePref {
	ts.t.Helper()
	var p themePref
	require.NoError(ts.t, json.Unmarshal(requireStatus(ts.t, ts.GET("/api/preferences?device_id="+device, token), http.StatusOK), &p))
	return p
}

func (ts *testServer) putPref(token string, body map[string]any) themePref {
	ts.t.Helper()
	raw, err := json.Marshal(body)
	require.NoError(ts.t, err)
	var p themePref
	require.NoError(ts.t, json.Unmarshal(requireStatus(ts.t, ts.PUT("/api/preferences", raw, token), http.StatusOK), &p))
	return p
}

func TestPreferences_ThemeBelongsToTheAccountAndSyncsAcrossDevices(t *testing.T) {
	ts := setupTestServer(t)
	tag := uuid.NewString()[:8]
	wasif := ts.registerAndLogin("pref-a-"+tag+"@test.zcrypt.io", "PrefTest!2026xyz")
	wosmo := ts.registerAndLogin("pref-b-"+tag+"@test.zcrypt.io", "PrefTest!2026xyz")
	laptop, phone := "laptop-"+tag, "phone-"+tag

	fresh := ts.getPref(wasif, laptop)
	assert.Equal(t, themePref{DeviceID: laptop, ColorTheme: "default", Mode: "system", Sync: true}, fresh)

	saved := ts.putPref(wasif, map[string]any{"device_id": laptop, "color_theme": "ocean", "mode": "dark", "custom_theme": `{"accent":"#00ffaa"}`})
	assert.Equal(t, "ocean", saved.ColorTheme)
	assert.True(t, saved.Saved)
	assert.True(t, saved.Sync)

	onPhone := ts.getPref(wasif, phone)
	assert.Equal(t, "ocean", onPhone.ColorTheme, "a device that never chose follows the account theme")
	assert.Equal(t, "dark", onPhone.Mode)
	assert.Equal(t, `{"accent":"#00ffaa"}`, onPhone.CustomTheme)

	other := ts.getPref(wosmo, laptop)
	assert.Equal(t, "default", other.ColorTheme, "another account on the same device never sees this one's theme")
	assert.False(t, other.Saved)

	own := ts.putPref(wasif, map[string]any{"device_id": phone, "color_theme": "rose", "mode": "light", "sync": false})
	assert.False(t, own.Sync)
	assert.Equal(t, "rose", ts.getPref(wasif, phone).ColorTheme, "the phone keeps its own look")
	assert.Equal(t, "ocean", ts.getPref(wasif, laptop).ColorTheme, "and the account theme is untouched")

	ts.putPref(wasif, map[string]any{"device_id": laptop, "color_theme": "forest", "mode": "dark"})
	assert.Equal(t, "rose", ts.getPref(wasif, phone).ColorTheme, "a device with its own theme ignores account changes")

	joined := ts.putPref(wasif, map[string]any{"device_id": phone, "color_theme": "rose", "mode": "light", "sync": true, "join": true})
	assert.True(t, joined.Sync)
	assert.Equal(t, "forest", joined.ColorTheme, "turning sync back on adopts the account theme")
	assert.Equal(t, "forest", ts.getPref(wasif, laptop).ColorTheme)

	old := ts.putPref(wasif, map[string]any{"device_id": laptop, "color_theme": "sunset", "mode": "light"})
	assert.Equal(t, `{"accent":"#00ffaa"}`, old.CustomTheme, "an older client that sends no custom theme keeps the saved one")
	assert.True(t, old.Sync)

	first := ts.putPref(wosmo, map[string]any{"device_id": phone, "color_theme": "mint", "mode": "dark", "join": true})
	assert.Equal(t, "mint", first.ColorTheme, "joining with no account theme yet makes this device's look the account theme")
	assert.Equal(t, "mint", ts.getPref(wosmo, laptop).ColorTheme)
}

func TestPreferences_RejectsBadInput(t *testing.T) {
	ts := setupTestServer(t)
	token := ts.registerAndLogin("pref-bad-"+uuid.NewString()[:8]+"@test.zcrypt.io", "PrefTest!2026xyz")
	put := func(body string) int {
		resp := ts.PUT("/api/preferences", []byte(body), token)
		defer resp.Body.Close()
		return resp.StatusCode
	}
	long := make([]byte, 5000)
	for i := range long {
		long[i] = 'a'
	}
	assert.Equal(t, http.StatusBadRequest, put(`{`))
	assert.Equal(t, http.StatusBadRequest, put(`{"device_id":"*","color_theme":"x"}`), "the account row is not a device")
	assert.Equal(t, http.StatusBadRequest, put(`{"device_id":""}`))
	assert.Equal(t, http.StatusBadRequest, put(`{"device_id":"d","color_theme":"`+string(long[:70])+`"}`))
	assert.Equal(t, http.StatusBadRequest, put(`{"device_id":"d","custom_theme":"not json"}`))
	assert.Equal(t, http.StatusBadRequest, put(`{"device_id":"`+string(long[:200])+`"}`))
	assert.Equal(t, http.StatusOK, put(`{"device_id":"d","mode":"neon"}`))
	assert.Equal(t, "system", ts.getPref(token, "d").Mode, "an unknown mode falls back to system")
}
