package types

// Storage platform identifiers as stored in the database and sent on the wire.
// They are untyped string constants because the identifiers flow through plain
// string fields, map keys, SQL parameters and adapter interfaces.
const (
	PlatformTelegram    = "telegram"
	PlatformGitHub      = "github"
	PlatformGitLab      = "gitlab"
	PlatformHuggingFace = "huggingface"
	PlatformMock        = "mock"
)

// AllPlatforms lists the real storage platforms in the order Auto uploads
// prefer them. The load-test mock platform is deliberately absent.
var AllPlatforms = []string{PlatformTelegram, PlatformGitHub, PlatformGitLab, PlatformHuggingFace}

// OAuth sign-in providers. These are identity providers, not storage platforms,
// even though PlatformGitHub shares the spelling.
const (
	OAuthGoogle = "google"
	OAuthGitHub = "github"
)

// Upload data-plane modes recorded on upload sessions.
const (
	UploadModeRelay      = "relay"
	UploadModeBYOSDirect = "byos-direct"
)

// File and send-transfer statuses.
const (
	StatusUploading = "uploading"
	StatusComplete  = "complete"
)

// Upload session statuses.
const (
	SessionActive   = "active"
	SessionComplete = "complete"
)

// Plan identifiers.
const (
	PlanFree = "free"
	PlanPlus = "plus"
	PlanPro  = "pro"
)

// Shared-vault (Space) member roles.
const (
	SpaceRoleOwner  = "owner"
	SpaceRoleAdmin  = "admin"
	SpaceRoleEditor = "editor"
	SpaceRoleViewer = "viewer"
)

// SettingDefaultStorageQuotaBytes is the system_settings key holding the
// default per-user storage quota.
const SettingDefaultStorageQuotaBytes = "default_storage_quota_bytes"

// Integrity snapshot statuses.
const (
	IntegrityOK      = "ok"
	IntegrityChanged = "changed"
)

// Stable error codes for a refused web (relay) upload, where the file's bytes
// would pass through the server.
const (
	ErrCodeRelayFileTooLarge      = "relay_file_too_large"
	ErrCodeRelayAllowanceExceeded = "relay_allowance_exceeded"
)
