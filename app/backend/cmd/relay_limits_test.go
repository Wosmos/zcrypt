package cmd

import (
	"testing"
	"time"

	"github.com/zcrypt/zcrypt/types"
)

func TestRelayLimitDefaults(t *testing.T) {
	for _, name := range []string{"ZCRYPT_RELAY_MAX_FILE_BYTES", "ZCRYPT_RELAY_MONTHLY_BYTES", "ZCRYPT_RELAY_ALERT_DAILY_BYTES"} {
		t.Setenv(name, "")
	}
	if got := relayMaxFileBytes(); got != int64(2)<<30 {
		t.Errorf("relay max file = %d", got)
	}
	if got := relayMonthlyBytes(); got != int64(20)<<30 {
		t.Errorf("relay monthly = %d", got)
	}
	if got := relayAlertDailyBytes(); got != int64(10)<<30 {
		t.Errorf("relay alert = %d", got)
	}
}

func TestRelayLimitsAcceptZeroAsUnlimited(t *testing.T) {
	t.Setenv("ZCRYPT_RELAY_MAX_FILE_BYTES", "0")
	t.Setenv("ZCRYPT_RELAY_MONTHLY_BYTES", "0")
	t.Setenv("ZCRYPT_RELAY_ALERT_DAILY_BYTES", "-1")
	if got := relayMaxFileBytes(); got != 0 {
		t.Errorf("relay max file = %d", got)
	}
	if got := relayMonthlyBytes(); got != 0 {
		t.Errorf("relay monthly = %d", got)
	}
	if got := relayAlertDailyBytes(); got != int64(10)<<30 {
		t.Errorf("negative alert must fall back to the default, got %d", got)
	}
}

func TestRelayResetsAt(t *testing.T) {
	cases := []struct {
		now  time.Time
		want time.Time
	}{
		{time.Date(2026, 11, 3, 15, 4, 5, 0, time.UTC), time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC)},
		{time.Date(2026, 12, 31, 23, 59, 59, 0, time.UTC), time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)},
		{time.Date(2026, 1, 31, 23, 30, 0, 0, time.FixedZone("x", -5*3600)), time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)},
	}
	for _, c := range cases {
		if got := relayResetsAt(c.now); !got.Equal(c.want) {
			t.Errorf("relayResetsAt(%v) = %v, want %v", c.now, got, c.want)
		}
	}
}

func TestMarkHeavyRelay(t *testing.T) {
	t.Setenv("ZCRYPT_RELAY_ALERT_DAILY_BYTES", "100")
	u := &types.AdminUser{Relay24hBytes: 101}
	markHeavyRelay(u)
	if !u.HeavyRelay {
		t.Error("101 bytes over a 100 byte threshold must be heavy")
	}
	u.Relay24hBytes = 100
	markHeavyRelay(u)
	if u.HeavyRelay {
		t.Error("exactly the threshold is not heavy")
	}
	t.Setenv("ZCRYPT_RELAY_ALERT_DAILY_BYTES", "0")
	u.Relay24hBytes = 1 << 40
	markHeavyRelay(u)
	if u.HeavyRelay {
		t.Error("a zero threshold turns the flag off")
	}
}
