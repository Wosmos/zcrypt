package cmd

import "testing"

func TestLimitDefaults(t *testing.T) {
	for _, name := range []string{
		"ZCRYPT_SHARED_QUOTA_BYTES", "ZCRYPT_MAX_UPLOAD_BYTES",
		"ZCRYPT_SEND_ANON_DAILY_BYTES", "ZCRYPT_SEND_USER_DAILY_BYTES",
	} {
		t.Setenv(name, "")
	}
	if got := sharedStorageQuotaBytes(); got != int64(1)<<30 {
		t.Errorf("shared quota = %d", got)
	}
	if got := maxUploadBytes(); got != int64(10)<<30 {
		t.Errorf("max upload = %d", got)
	}
	if got := sendAnonDailyBytes(); got != 500*1024*1024 {
		t.Errorf("send anon daily = %d", got)
	}
	if got := sendUserDailyBytes(); got != 5*1024*1024*1024 {
		t.Errorf("send user daily = %d", got)
	}
}

func TestLimitEnvOverrides(t *testing.T) {
	t.Setenv("ZCRYPT_SHARED_QUOTA_BYTES", "2048")
	t.Setenv("ZCRYPT_MAX_UPLOAD_BYTES", "4096")
	t.Setenv("ZCRYPT_SEND_ANON_DAILY_BYTES", "100")
	t.Setenv("ZCRYPT_SEND_USER_DAILY_BYTES", "200")
	if got := sharedStorageQuotaBytes(); got != 2048 {
		t.Errorf("shared quota = %d", got)
	}
	if got := maxUploadBytes(); got != 4096 {
		t.Errorf("max upload = %d", got)
	}
	if got := sendAnonDailyBytes(); got != 100 {
		t.Errorf("send anon daily = %d", got)
	}
	if got := sendUserDailyBytes(); got != 200 {
		t.Errorf("send user daily = %d", got)
	}
	if got := SizeBucket(1 << 40); got != 4096 {
		t.Errorf("SizeBucket must clamp to the overridden cap, got %d", got)
	}
}

func TestLimitInvalidEnvFallsBack(t *testing.T) {
	for _, bad := range []string{"abc", "0", "-1", "1.5"} {
		t.Setenv("ZCRYPT_MAX_UPLOAD_BYTES", bad)
		if got := maxUploadBytes(); got != defaultMaxUploadBytes {
			t.Errorf("value %q gave %d, want default", bad, got)
		}
	}
}
