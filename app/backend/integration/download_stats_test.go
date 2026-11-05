//go:build integration

package integration_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDownloadStats_CountPeopleNotCrawlers(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	_, err := ts.db.Pool().Exec(ctx, `DELETE FROM app_downloads`)
	require.NoError(t, err)

	type row struct{ target, platform, ip, ua, ref string }
	const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0"
	const page = "https://zcrypt.cloud/download?os=windows"
	rows := []row{
		{"windows-exe", "windows", "10.0.1.0", chrome, page},
		{"windows-exe", "windows", "10.0.1.0", chrome, page},
		{"android", "android", "10.0.2.0", "Mozilla/5.0 (Linux; Android 14) Chrome/130.0", "https://zcrypt.cloud/download?os=android"},
		{"windows-exe", "windows", "10.0.3.0", "Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1", ""},
		{"linux-deb", "linux", "10.0.4.0", "Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)", ""},
		{"macos-arm64", "macos", "10.0.5.0", "Mozilla/5.0 (compatible; DataForSeoBot/1.0)", page},
		{"linux-rpm", "linux", "10.0.6.0", chrome, ""},
		{"macos-x64", "macos", "10.0.7.0", chrome, page},
		{"linux-deb", "linux", "10.0.7.0", chrome, page},
		{"linux-rpm", "linux", "10.0.7.0", chrome, page},
	}
	for _, r := range rows {
		_, err := ts.db.Pool().Exec(ctx,
			`INSERT INTO app_downloads (target, platform, version, ip_prefix, user_agent, referrer) VALUES ($1, $2, 'v0.2.0', $3, $4, $5)`,
			r.target, r.platform, r.ip, r.ua, r.ref)
		require.NoError(t, err)
	}

	stats, err := ts.db.GetDownloadStats(ctx, 30)
	require.NoError(t, err)
	assert.Equal(t, 3, stats.Total, "a repeat click, two named bots, a referrer-less fetch and a three-installer sweep are not downloads")
	assert.Equal(t, 7, stats.Filtered)
	assert.Equal(t, 3, stats.Last30)

	platforms := map[string]int{}
	for _, p := range stats.Platforms {
		platforms[p.Key] = p.Count
	}
	assert.Equal(t, map[string]int{"windows": 2, "android": 1}, platforms)

	today := time.Now().Format("2006-01-02")
	var daily int
	for _, d := range stats.Daily {
		if d.Date == today {
			daily = d.Count
		}
	}
	assert.Equal(t, 3, daily)

	total, err := ts.db.GetDownloadTotal(ctx)
	require.NoError(t, err)
	assert.Equal(t, 3, total, "the public counter shows the same people-only number")
}
