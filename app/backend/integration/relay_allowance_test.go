//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/index"
	"github.com/zcrypt/zcrypt/types"
)

func relayRefusalOf(t *testing.T, resp *http.Response, status int) relayRefusal {
	t.Helper()
	var r relayRefusal
	require.NoError(t, json.Unmarshal(requireStatus(t, resp, status), &r))
	return r
}

func TestRelayParallelInitsCannotOvershootDailyWindow(t *testing.T) {
	t.Setenv("ZCRYPT_RELAY_DAILY_BYTES", "1000")
	ts := setupTestServer(t)
	tag := relayTag()
	email := "relay-par-" + tag + "@example.com"
	token := ts.registerAndLogin(email, newTestPassword())
	ts.enableMockStorage(email)

	const racers = 8
	codes := make([]int, racers)
	sessions := make([]string, racers)
	var wg sync.WaitGroup
	for i := range racers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resp := ts.relayInit(token, 400, "par-"+tag+"-"+string(rune('a'+i)))
			defer resp.Body.Close()
			codes[i] = resp.StatusCode
			if resp.StatusCode == http.StatusOK {
				var out struct {
					SessionID string `json:"session_id"`
				}
				_ = json.NewDecoder(resp.Body).Decode(&out)
				sessions[i] = out.SessionID
			}
		}()
	}
	wg.Wait()

	var ok []string
	for i, c := range codes {
		if c == http.StatusOK {
			ok = append(ok, sessions[i])
		} else {
			assert.Equal(t, http.StatusForbidden, c)
		}
	}
	require.Len(t, ok, 2, "1000 bytes of daily window fit exactly two 400 byte files: %v", codes)
	assert.Equal(t, int64(800), ts.relayQuotaOf(token).RelayReservedBytes)

	r := relayRefusalOf(t, ts.relayInit(token, 400, "par-"+tag+"-late"), http.StatusForbidden)
	assert.Equal(t, types.ErrCodeRelayDailyExceeded, r.Code)
	assert.Equal(t, int64(800), r.UsedBytes, "reserved bytes are reported as used")
	assert.Equal(t, int64(1000), r.LimitBytes)

	requireStatus(t, ts.DELETE("/api/upload/"+ok[0], token), http.StatusOK)
	assert.Equal(t, int64(400), ts.relayQuotaOf(token).RelayReservedBytes, "cancelling an upload releases its reservation")
	requireStatus(t, ts.relayInit(token, 400, "par-"+tag+"-after"), http.StatusOK)
}

func TestRelayReservationShrinksAsChunksArrive(t *testing.T) {
	t.Setenv("ZCRYPT_RELAY_DAILY_BYTES", "1000")
	ts := setupTestServer(t)
	tag := relayTag()
	email := "relay-shrink-" + tag + "@example.com"
	token := ts.registerAndLogin(email, newTestPassword())
	ts.enableMockStorage(email)

	var init struct {
		SessionID string `json:"session_id"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t, ts.relayInit(token, 400, "sh-"+tag), http.StatusOK), &init))
	q := ts.relayQuotaOf(token)
	assert.Equal(t, int64(400), q.RelayReservedBytes)

	requireStatus(t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/0", relayChunk(400), token), http.StatusOK)
	q = ts.relayQuotaOf(token)
	assert.Equal(t, int64(400), q.RelayDayUsedBytes)
	assert.Zero(t, q.RelayReservedBytes, "received bytes move from reserved to used, never counted twice")
}

func TestRelayDeclareSmallSendBigIsRefused(t *testing.T) {
	ts := setupTestServer(t)
	tag := relayTag()
	email := "relay-big-chunk-" + tag + "@example.com"
	token := ts.registerAndLogin(email, newTestPassword())
	ts.enableMockStorage(email)

	var init struct {
		SessionID string `json:"session_id"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t, ts.relayInit(token, 100, "sb-"+tag), http.StatusOK), &init))

	r := relayRefusalOf(t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/0", relayChunk(5000), token), http.StatusRequestEntityTooLarge)
	assert.Equal(t, types.ErrCodeRelayChunkExceedsDeclared, r.Code)
	assert.Zero(t, ts.relayQuotaOf(token).RelayDayUsedBytes, "a refused chunk is not counted")

	requireStatus(t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/0", relayChunk(100+28), token), http.StatusOK)
}

func TestRelayChunkRefusedWhenWindowShrinksMidUpload(t *testing.T) {
	t.Setenv("ZCRYPT_RELAY_DAILY_BYTES", "1000")
	ts := setupTestServer(t)
	tag := relayTag()
	email := "relay-mid-" + tag + "@example.com"
	token := ts.registerAndLogin(email, newTestPassword())
	ts.enableMockStorage(email)

	var init struct {
		SessionID string `json:"session_id"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t, ts.relayInit(token, 100, "mid-"+tag), http.StatusOK), &init))

	t.Setenv("ZCRYPT_RELAY_DAILY_BYTES", "50")
	r := relayRefusalOf(t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/0", relayChunk(128), token), http.StatusForbidden)
	assert.Equal(t, types.ErrCodeRelayDailyExceeded, r.Code)
	assert.Zero(t, ts.relayQuotaOf(token).RelayDayUsedBytes)
}

func TestRelayDailyWindowRefusesDownloads(t *testing.T) {
	t.Setenv("ZCRYPT_RELAY_DAILY_BYTES", "300")
	ts := setupTestServer(t)
	tag := relayTag()
	email := "relay-day-" + tag + "@example.com"
	token := ts.registerAndLogin(email, newTestPassword())
	ts.enableMockStorage(email)

	fileID := ts.relayUploadOneChunk(token, 100, relayChunk(128), "dd-"+tag)
	requireStatus(t, ts.GET("/api/files/"+fileID+"/chunks/0", token), http.StatusOK)
	assert.Equal(t, int64(256), ts.relayQuotaOf(token).RelayDayUsedBytes)

	r := relayRefusalOf(t, ts.GET("/api/files/"+fileID+"/chunks/0", token), http.StatusForbidden)
	assert.Equal(t, types.ErrCodeRelayDailyExceeded, r.Code)
	assert.Equal(t, int64(256), r.UsedBytes)
	assert.Equal(t, int64(300), r.LimitBytes)
	assert.False(t, r.ResetsAt.IsZero())
	assert.Equal(t, int64(256), ts.relayQuotaOf(token).RelayDayUsedBytes)
}

func TestRelayShareDownloadRefusedWhenOwnerWindowIsUsedUp(t *testing.T) {
	t.Setenv("ZCRYPT_RELAY_DAILY_BYTES", "300")
	ts := setupTestServer(t)
	tag := relayTag()
	email := "relay-sharecap-" + tag + "@example.com"
	token := ts.registerAndLogin(email, newTestPassword())
	ts.enableMockStorage(email)
	fileID := ts.relayUploadOneChunk(token, 100, relayChunk(128), "sc-"+tag)

	var share struct {
		Token string `json:"token"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t, ts.POST("/api/shares", map[string]interface{}{
		"file_id": fileID, "wrapped_cek": "wrapped", "max_downloads": 0,
	}, token), http.StatusOK), &share))

	requireStatus(t, ts.GET("/api/share/"+share.Token+"/chunks/0", ""), http.StatusOK)
	resp := ts.GET("/api/share/"+share.Token+"/chunks/0", "")
	body := requireStatus(t, resp, http.StatusForbidden)
	assert.Contains(t, string(body), types.ErrCodeRelayDailyExceeded)
	assert.NotContains(t, string(body), "used_bytes", "a public recipient is not told the owner's usage")
	assert.Equal(t, int64(256), ts.relayQuotaOf(token).RelayDayUsedBytes)
}

func TestRelayFolderShareDownloadIsCountedToOwnerAndRefusedWhenExhausted(t *testing.T) {
	t.Setenv("ZCRYPT_RELAY_DAILY_BYTES", "300")
	ts := setupTestServer(t)
	tag := relayTag()
	email := "relay-folder-" + tag + "@example.com"
	token := ts.registerAndLogin(email, newTestPassword())
	ts.enableMockStorage(email)
	fileID := ts.relayUploadOneChunk(token, 100, relayChunk(128), "fs-"+tag)

	var created struct {
		Token string `json:"token"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t,
		ts.POST("/api/folder-shares", createFolderShareBody("f", []string{fileID}), token), http.StatusOK), &created))
	url := "/api/folder-share/" + created.Token + "/files/" + fileID + "/chunks/0"

	assert.Equal(t, int64(128), ts.relayQuotaOf(token).RelayDayUsedBytes)
	requireStatus(t, ts.getShared(url, ""), http.StatusOK)
	assert.Equal(t, int64(256), ts.relayQuotaOf(token).RelayDayUsedBytes, "the owner pays for a folder-share download")

	body := requireStatus(t, ts.getShared(url, ""), http.StatusForbidden)
	assert.Contains(t, string(body), types.ErrCodeRelayDailyExceeded)
	assert.Equal(t, int64(256), ts.relayQuotaOf(token).RelayDayUsedBytes)
}

func TestRelayAdminsAreExemptFromWindowsOnEveryPath(t *testing.T) {
	t.Setenv("ZCRYPT_RELAY_DAILY_BYTES", "1")
	t.Setenv("ZCRYPT_RELAY_MONTHLY_BYTES", "1")
	ts := setupTestServer(t)
	ctx := context.Background()
	tag := relayTag()
	email := "relay-adm-all-" + tag + "@example.com"
	pass := newTestPassword()
	ts.registerAndLogin(email, pass)
	ts.makeAdmin(ctx, email)
	token := ts.loginToken(email, pass)
	ts.enableMockStorage(email)

	fileID := ts.relayUploadOneChunk(token, 100, relayChunk(128), "ad-"+tag)
	requireStatus(t, ts.GET("/api/files/"+fileID+"/chunks/0", token), http.StatusOK)

	var created struct {
		Token string `json:"token"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t,
		ts.POST("/api/folder-shares", createFolderShareBody("f", []string{fileID}), token), http.StatusOK), &created))
	requireStatus(t, ts.getShared("/api/folder-share/"+created.Token+"/files/"+fileID+"/chunks/0", ""), http.StatusOK)
	requireStatus(t, ts.getShared("/api/folder-share/"+created.Token+"/files/"+fileID+"/chunks/0", ""), http.StatusOK)
}

func TestRelaySignedInSendIsChargedToTheSender(t *testing.T) {
	t.Setenv("ZCRYPT_RELAY_DAILY_BYTES", "300")
	ts := setupTestServer(t)
	ts.srv.InjectGlobalTestAdapter("mock:acct", newKeepAdapter())
	tag := relayTag()
	token := ts.registerAndLogin("relay-send-"+tag+"@example.com", newTestPassword())

	status, body := ts.sendInitFrom(uniqueTestIP(), token, 128, 1, false)
	require.Equal(t, http.StatusOK, status)
	sid, sendToken := body["session_id"].(string), body["token"].(string)

	status, body = ts.sendInitFrom(uniqueTestIP(), token, 200, 1, false)
	assert.Equal(t, http.StatusForbidden, status, "the first send's unsent bytes are reserved")
	assert.Equal(t, types.ErrCodeRelayDailyExceeded, body["code"])
	status, _ = ts.sendInitFrom(uniqueTestIP(), "", 200, 1, false)
	assert.Equal(t, http.StatusOK, status, "an anonymous sender has no account allowance to charge")

	ts.sendUploadChunk(sid, 0, relayChunk(128))
	requireStatus(t, ts.POST("/api/send/"+sid+"/complete", map[string]interface{}{}, ""), http.StatusOK)
	q := ts.relayQuotaOf(token)
	assert.Equal(t, int64(128), q.RelayDayUsedBytes)
	assert.Zero(t, q.RelayReservedBytes)

	assert.Equal(t, http.StatusOK, ts.sendGet("/api/send/"+sendToken+"/chunks/0"))
	assert.Eventually(t, func() bool { return ts.relayQuotaOf(token).RelayDayUsedBytes == 256 },
		2*time.Second, 20*time.Millisecond, "a recipient's download is charged to the signed-in sender")
	assert.Equal(t, http.StatusForbidden, ts.sendGet("/api/send/"+sendToken+"/chunks/0"))
}

func TestRelayReservationIsAtomicAtTheDatabase(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	email := "relay-atomic-" + relayTag() + "@example.com"
	ts.registerAndLogin(email, newTestPassword())
	user, err := ts.db.GetUserByEmail(ctx, email)
	require.NoError(t, err)

	// A slow insert widens the window between reading the totals and writing the
	// reservation, so a missing lock shows up on every run.
	_, err = ts.db.Pool().Exec(ctx, `
		CREATE OR REPLACE FUNCTION relay_test_slow_insert() RETURNS trigger AS $$ BEGIN PERFORM pg_sleep(0.05); RETURN NEW; END $$ LANGUAGE plpgsql;
		CREATE TRIGGER relay_test_slow BEFORE INSERT ON upload_sessions FOR EACH ROW EXECUTE FUNCTION relay_test_slow_insert();`)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = ts.db.Pool().Exec(context.Background(), `DROP TRIGGER IF EXISTS relay_test_slow ON upload_sessions; DROP FUNCTION IF EXISTS relay_test_slow_insert()`)
	})

	const racers = 12
	var wg sync.WaitGroup
	var mu sync.Mutex
	accepted := 0
	for range racers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := ts.db.CreateRelayUploadSession(ctx, &types.UploadSession{
				UserID: user.ID, FileID: uuid.NewString(), EncryptedName: "a", OriginalSize: 400,
				Salt: make([]byte, 32), SHA256: "x", ChunkCount: 1, Platform: "mock", RepoID: "r", RepoURL: "u",
			}, index.RelayLimits{Day: 1000, Month: 1000})
			if err == nil {
				mu.Lock()
				accepted++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	assert.Equal(t, 2, accepted, "1000 bytes fit exactly two 400 byte reservations however many race")
}
