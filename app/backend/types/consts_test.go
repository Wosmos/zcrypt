package types

import "testing"

func TestWireValuesAreStable(t *testing.T) {
	cases := [][2]string{
		{PlatformTelegram, "telegram"},
		{PlatformGitHub, "github"},
		{PlatformGitLab, "gitlab"},
		{PlatformHuggingFace, "huggingface"},
		{PlatformMock, "mock"},
		{OAuthGoogle, "google"},
		{OAuthGitHub, "github"},
		{UploadModeRelay, "relay"},
		{UploadModeBYOSDirect, "byos-direct"},
		{StatusUploading, "uploading"},
		{StatusComplete, "complete"},
		{SessionActive, "active"},
		{SessionComplete, "complete"},
		{PlanFree, "free"},
		{PlanPlus, "plus"},
		{PlanPro, "pro"},
		{SpaceRoleOwner, "owner"},
		{SpaceRoleAdmin, "admin"},
		{SpaceRoleEditor, "editor"},
		{SpaceRoleViewer, "viewer"},
		{SettingDefaultStorageQuotaBytes, "default_storage_quota_bytes"},
		{AuditTwoFAEnable, "2fa_enable"},
		{AuditOAuthLogin, "oauth_login"},
	}
	for _, c := range cases {
		if c[0] != c[1] {
			t.Errorf("constant = %q, want %q", c[0], c[1])
		}
	}
	want := []string{"telegram", "github", "gitlab", "huggingface"}
	for i, p := range AllPlatforms {
		if p != want[i] {
			t.Errorf("AllPlatforms[%d] = %q, want %q", i, p, want[i])
		}
	}
}
