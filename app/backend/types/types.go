package types

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

// Role represents a user's authorization level.
type Role int

const (
	RoleUser  Role = iota + 1 // 1
	RoleAdmin                 // 2
)

var (
	roleToString = map[Role]string{RoleUser: "user", RoleAdmin: "admin"}
	stringToRole = map[string]Role{"user": RoleUser, "admin": RoleAdmin}
)

func (r Role) String() string               { return roleToString[r] }
func (r Role) IsValid() bool                { return r == RoleUser || r == RoleAdmin }
func (r Role) MarshalJSON() ([]byte, error) { return json.Marshal(r.String()) }

func (r *Role) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}
	v, ok := stringToRole[s]
	if !ok {
		return fmt.Errorf("invalid role: %q", s)
	}
	*r = v
	return nil
}

// Value implements driver.Valuer for DB writes.
func (r Role) Value() (driver.Value, error) { return r.String(), nil }

// Scan implements sql.Scanner for DB reads.
func (r *Role) Scan(src interface{}) error {
	s, ok := src.(string)
	if !ok {
		return fmt.Errorf("role: expected string, got %T", src)
	}
	v, ok := stringToRole[s]
	if !ok {
		return fmt.Errorf("role: invalid value %q", s)
	}
	*r = v
	return nil
}

func ParseRole(s string) (Role, bool) {
	r, ok := stringToRole[s]
	return r, ok
}

// FileMetadata represents a stored file in the local index.
type FileMetadata struct {
	ID             string    `json:"id"`
	UserID         string    `json:"user_id,omitempty"`
	OriginalName   string    `json:"original_name"`
	OriginalSize   int64     `json:"original_size"`
	CompressedSize int64     `json:"compressed_size"`
	EncryptedSize  int64     `json:"encrypted_size"`
	ChunkCount     int       `json:"chunk_count"`
	SHA256         string    `json:"sha256"`
	Salt           []byte    `json:"-"`
	IV             []byte    `json:"-"`
	WrappedCEK     string    `json:"wrapped_cek,omitempty"` // base64 envelope-wrapped Content Encryption Key
	Status         string    `json:"status"`
	CreatedAt      time.Time `json:"created_at"`
	FolderID       *string   `json:"folder_id,omitempty"`  // parent folder; nil = root
	EncryptedName  string    `json:"encrypted_name"`       // client-side-encrypted (base64) name; opaque to server
	DeletedAt      *string   `json:"deleted_at,omitempty"` // non-nil = in trash
}

// ChunkRef identifies a single chunk stored on a platform.
type ChunkRef struct {
	ChunkID      string `json:"chunk_id"`
	FileID       string `json:"file_id"`
	UserID       string `json:"user_id,omitempty"`
	Index        int    `json:"index"`
	Size         int64  `json:"size"`
	SHA256       string `json:"sha256"`
	Platform     string `json:"platform"`
	Account      string `json:"account"`
	Repo         string `json:"repo"`
	RemotePath   string `json:"remote_path"`
	Compressed   bool   `json:"compressed"`
	SyncAttempts int    `json:"sync_attempts,omitempty"`
}

// Chunk holds chunk data for upload/download.
type Chunk struct {
	Ref  ChunkRef
	Data []byte
}

// RepoInfo tracks a repository in the pool.
type RepoInfo struct {
	ID        string `json:"id"`
	UserID    string `json:"user_id,omitempty"`
	Platform  string `json:"platform"`
	Account   string `json:"account"`
	Name      string `json:"name"`
	URL       string `json:"url"`
	UsedBytes int64  `json:"used_bytes"`
	MaxBytes  int64  `json:"max_bytes"`
	Active    bool   `json:"active"`
}

// PlatformStatus reports connection health for a platform.
type PlatformStatus struct {
	Platform  string `json:"platform"`
	Account   string `json:"account,omitempty"`
	Connected bool   `json:"connected"`
	Username  string `json:"username,omitempty"`
	// Unreachable is true when a token exists but its adapter couldn't be
	// built (e.g. the platform API is blocked from the server); Error carries
	// the short reason.
	Unreachable bool   `json:"unreachable,omitempty"`
	Error       string `json:"error,omitempty"`
	TokenID     string `json:"token_id,omitempty"`
	IsGlobal    bool   `json:"is_global,omitempty"`
}

// ProgressEvent is sent to the frontend during operations.
type ProgressEvent struct {
	FileID         string `json:"file_id"`
	UserID         string `json:"user_id,omitempty"` // for per-user SSE filtering
	Stage          string `json:"stage"`
	Percent        int    `json:"percent"`
	BytesProcessed int64  `json:"bytes_processed"`
	TotalBytes     int64  `json:"total_bytes"`
}

// OperationResult is sent when an operation completes.
type OperationResult struct {
	Filename string `json:"filename"`
	Success  bool   `json:"success"`
	Error    string `json:"error,omitempty"`
}

// UploadSession tracks a chunked client-side encrypted upload.
type UploadSession struct {
	ID             string    `json:"id"`
	UserID         string    `json:"user_id"`
	FileID         string    `json:"file_id"`
	Filename       string    `json:"filename"`
	OriginalSize   int64     `json:"original_size"`
	Salt           []byte    `json:"-"`
	SHA256         string    `json:"sha256"`
	ChunkCount     int       `json:"chunk_count"`
	Platform       string    `json:"platform"`
	Account        string    `json:"account"`
	RepoID         string    `json:"repo_id"`
	RepoURL        string    `json:"repo_url"`
	UploadedChunks int       `json:"uploaded_chunks"`
	Status         string    `json:"status"`
	CreatedAt      time.Time `json:"created_at"`
	ExpiresAt      time.Time `json:"expires_at"`
}

// UploadInitRequest is the JSON body for initiating a chunked upload.
type UploadInitRequest struct {
	Filename     string  `json:"filename"`
	OriginalSize int64   `json:"original_size"`
	SHA256       string  `json:"sha256"`
	Salt         string  `json:"salt"`        // base64-encoded 32 bytes
	WrappedCEK   string  `json:"wrapped_cek"` // base64 envelope-wrapped Content Encryption Key
	ChunkCount   int     `json:"chunk_count"`
	Platform     string  `json:"platform,omitempty"`
	FolderID     *string `json:"folder_id,omitempty"` // optional target folder; nil/omitted = root. Ownership-validated server-side.
}

// UploadCompleteRequest is the JSON body for finalizing a chunked upload.
type UploadCompleteRequest struct {
	EncryptedSize  int64 `json:"encrypted_size"`
	CompressedSize int64 `json:"compressed_size"`
}

// User represents a registered user.
type User struct {
	ID            string    `json:"id"`
	Email         string    `json:"email"`
	Username      string    `json:"username"`
	PasswordHash  string    `json:"-"`
	EmailVerified bool      `json:"email_verified"`
	TOTPSecret    string    `json:"-"`
	TOTPEnabled   bool      `json:"totp_enabled"`
	Role          Role      `json:"role"`
	TokenVersion  int       `json:"-"`
	Plan          string    `json:"plan"`
	StorageQuota  *int64    `json:"storage_quota,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// RefreshToken tracks a user's active refresh token.
type RefreshToken struct {
	ID        string
	UserID    string
	TokenHash string
	ExpiresAt time.Time
	CreatedAt time.Time
	IP        string
	UserAgent string
}

// EmailToken is a one-time token for email verification, password reset, or magic link.
type EmailToken struct {
	ID        string
	UserID    string
	TokenHash string
	Kind      string // "verify", "reset", or "magic_link"
	ExpiresAt time.Time
}

// OAuthProvider represents a linked OAuth account.
type OAuthProvider struct {
	ID            string    `json:"id"`
	UserID        string    `json:"user_id"`
	Provider      string    `json:"provider"`    // "google" or "github"
	ProviderID    string    `json:"provider_id"` // unique ID from provider
	ProviderEmail string    `json:"provider_email"`
	CreatedAt     time.Time `json:"created_at"`
}

// AuditEvent represents a logged security or system event.
type AuditEvent struct {
	ID        string                 `json:"id"`
	UserID    *string                `json:"user_id,omitempty"`
	EventType string                 `json:"event_type"`
	IP        string                 `json:"ip"`
	UserAgent string                 `json:"user_agent"`
	Metadata  map[string]interface{} `json:"metadata"`
	CreatedAt time.Time              `json:"created_at"`
}

// Manifest describes a file's chunk layout stored alongside chunks in the repo.
type Manifest struct {
	FileID       string     `json:"file_id"`
	OriginalName string     `json:"original_name"`
	OriginalSize int64      `json:"original_size"`
	SHA256       string     `json:"sha256"`
	ChunkCount   int        `json:"chunk_count"`
	Chunks       []ChunkRef `json:"chunks"`
	CreatedAt    time.Time  `json:"created_at"`
}

// PlatformTokenInfo holds metadata about a stored platform token (no secret data).
type PlatformTokenInfo struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Platform  string    `json:"platform"`
	Username  string    `json:"username"`
	IsGlobal  bool      `json:"is_global"`
	CreatedAt time.Time `json:"created_at"`
}

// PlatformTokenRow is the full DB row for a platform token including encrypted data.
type PlatformTokenRow struct {
	ID             string
	UserID         string
	Platform       string
	Username       string
	TokenEncrypted []byte
	TokenNonce     []byte
	IsGlobal       bool
	CreatedAt      time.Time
}

// AdminUser is a user with aggregate stats for admin views.
type AdminUser struct {
	User
	FileCount    int   `json:"file_count"`
	TotalStorage int64 `json:"total_size"`
}

// QuotaInfo describes a user's storage quota status.
type QuotaInfo struct {
	UsedBytes            int64  `json:"used_bytes"`
	QuotaBytes           int64  `json:"quota_bytes"`
	HasPersonalKey       bool   `json:"has_personal_key"`
	IsUnlimited          bool   `json:"is_unlimited"`
	Plan                 string `json:"plan"`
	MaxConcurrentUploads int    `json:"max_concurrent_uploads"`
	MaxFileSize          int64  `json:"max_file_size"`
	CanUpload            bool   `json:"can_upload"`
	AllowsBYOB           bool   `json:"allows_byob"`
}

// Feedback represents user-submitted feedback.
type Feedback struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Rating    int       `json:"rating"`
	Message   string    `json:"message"`
	Context   string    `json:"context"`
	CreatedAt time.Time `json:"created_at"`
}

// FeedbackWithUser includes user info for admin views.
type FeedbackWithUser struct {
	Feedback
	Email    string `json:"email"`
	Username string `json:"username"`
}

// PlanFeature describes a single feature line in a plan's marketing display.
type PlanFeature struct {
	Text     string `json:"text"`
	Included bool   `json:"included"`
}

// PlanConfig describes a single pricing plan's limits and marketing content.
type PlanConfig struct {
	ID                   string        `json:"id"`
	Name                 string        `json:"name"`
	MonthlyPrice         float64       `json:"monthly_price"`
	AnnualPrice          float64       `json:"annual_price"`
	Description          string        `json:"description"`
	StorageBytes         int64         `json:"storage_bytes"`
	MaxFileBytes         int64         `json:"max_file_bytes"`
	MaxConcurrentUploads int           `json:"max_concurrent_uploads"`
	StorageDisplay       string        `json:"storage_display"`
	MaxFileDisplay       string        `json:"max_file_display"`
	ConcurrentDisplay    string        `json:"concurrent_display"`
	Features             []PlanFeature `json:"features"`
	Highlight            bool          `json:"highlight"`
	Badge                *string       `json:"badge"`
	Icon                 *string       `json:"icon"`
	SocialProof          *string       `json:"social_proof"`
	SortOrder            int           `json:"sort_order"`
	AllowsBYOB           bool          `json:"allows_byob"`
}

// PlanConfigs wraps all plan configurations.
type PlanConfigs struct {
	Plans []PlanConfig `json:"plans"`
}

// ShareLink represents a shareable link for a file.
type ShareLink struct {
	ID            string     `json:"id"`
	FileID        string     `json:"file_id"`
	UserID        string     `json:"user_id"`
	Token         string     `json:"token"`
	PasswordHash  string     `json:"-"`
	WrappedCEK    string     `json:"wrapped_cek,omitempty"` // file CEK wrapped under the share key (base64)
	HasPassword   bool       `json:"has_password"`
	ExpiresAt     *time.Time `json:"expires_at,omitempty"`
	MaxDownloads  int        `json:"max_downloads"`
	DownloadCount int        `json:"download_count"`
	Revoked       bool       `json:"revoked"`
	CreatedAt     time.Time  `json:"created_at"`
}

// FolderShareFileInput is one file's CEK re-wrapped under the folder-share key,
// supplied by the client when creating a public folder link. Opaque to the server.
type FolderShareFileInput struct {
	FileID     string `json:"file_id"`
	WrappedCEK string `json:"wrapped_cek"`
}

// CreateFolderShareRequest is the JSON body for creating a public folder link.
// The folder-share key lives only in the URL fragment; the server stores just
// the per-file wrapped CEKs. `name` is a plaintext display label the sharer
// opts to reveal (folder names are otherwise E2E-encrypted).
type CreateFolderShareRequest struct {
	FolderID     string                 `json:"folder_id"`
	Name         string                 `json:"name"`
	Files        []FolderShareFileInput `json:"files"`
	Password     string                 `json:"password,omitempty"`
	ExpiresHours int                    `json:"expires_in_hours,omitempty"`
	MaxDownloads int                    `json:"max_downloads,omitempty"`
}

// FolderShare is a public folder link (mirrors ShareLink, for a whole folder).
type FolderShare struct {
	ID            string     `json:"id"`
	FolderID      *string    `json:"folder_id,omitempty"`
	UserID        string     `json:"user_id"`
	Name          string     `json:"name"`
	Token         string     `json:"token"`
	PasswordHash  string     `json:"-"`
	HasPassword   bool       `json:"has_password"`
	ExpiresAt     *time.Time `json:"expires_at,omitempty"`
	MaxDownloads  int        `json:"max_downloads"`
	DownloadCount int        `json:"download_count"`
	Revoked       bool       `json:"revoked"`
	CreatedAt     time.Time  `json:"created_at"`
	FileCount     int        `json:"file_count"`
}

// FolderShareFile is a file carried by a folder share, joined with display meta
// for the public listing. WrappedCEK is the file CEK under the folder-share key.
type FolderShareFile struct {
	FileID     string `json:"file_id"`
	WrappedCEK string `json:"wrapped_cek,omitempty"`
	Name       string `json:"name,omitempty"`
	Size       int64  `json:"size,omitempty"`
	ChunkCount int    `json:"chunk_count,omitempty"`
}

// SystemStats holds system-wide aggregate statistics.
type SystemStats struct {
	TotalUsers        int   `json:"total_users"`
	TotalFiles        int   `json:"total_files"`
	TotalStorageBytes int64 `json:"total_size"`
	TotalRepos        int   `json:"total_repos"`
}

// SendTransfer represents an anonymous encrypted file transfer.
type SendTransfer struct {
	ID            string    `json:"id"`
	Token         string    `json:"token"`
	OriginalName  string    `json:"original_name"`
	OriginalSize  int64     `json:"original_size"`
	EncryptedSize int64     `json:"encrypted_size"`
	ChunkCount    int       `json:"chunk_count"`
	SHA256        string    `json:"sha256"`
	Salt          []byte    `json:"-"`
	Status        string    `json:"status"`
	BurnAfterRead bool      `json:"burn_after_read"`
	MaxDownloads  int       `json:"max_downloads"`
	DownloadCount int       `json:"download_count"`
	ExpiresAt     time.Time `json:"expires_at"`
	SenderIP      string    `json:"-"`
	CreatedAt     time.Time `json:"created_at"`
}

// SendChunk identifies a chunk belonging to an anonymous send transfer.
type SendChunk struct {
	ID         string `json:"id"`
	TransferID string `json:"transfer_id"`
	Index      int    `json:"index"`
	Size       int64  `json:"size"`
	SHA256     string `json:"sha256"`
	Platform   string `json:"platform"`
	Account    string `json:"account"`
	Repo       string `json:"repo"`
	RemotePath string `json:"remote_path"`
	Compressed bool   `json:"compressed"`
}

// SendInitRequest is the JSON body for initiating an anonymous send.
type SendInitRequest struct {
	Filename      string `json:"filename"`
	OriginalSize  int64  `json:"original_size"`
	SHA256        string `json:"sha256"`
	Salt          string `json:"salt"`
	ChunkCount    int    `json:"chunk_count"`
	BurnAfterRead bool   `json:"burn_after_read"`
	ExpiresHours  int    `json:"expires_hours"`
}

// Pad represents an encrypted text pad.
type Pad struct {
	ID            string    `json:"id"`
	Token         string    `json:"token"`
	EncryptedBlob []byte    `json:"-"`
	ContentSize   int       `json:"content_size"`
	BurnAfterRead bool      `json:"burn_after_read"`
	ViewCount     int       `json:"view_count"`
	ExpiresAt     time.Time `json:"expires_at"`
	CreatorIP     string    `json:"-"`
	CreatedAt     time.Time `json:"created_at"`
}

// PadCreateRequest is the JSON body for creating an encrypted pad.
type PadCreateRequest struct {
	EncryptedBlob string `json:"encrypted_blob"` // base64-encoded
	ContentSize   int    `json:"content_size"`
	BurnAfterRead bool   `json:"burn_after_read"`
	ExpiresHours  int    `json:"expires_hours"`
}

// ClipboardItem represents an encrypted clipboard entry for cross-device sync.
type ClipboardItem struct {
	ID            string    `json:"id"`
	UserID        string    `json:"user_id"`
	ContentType   string    `json:"content_type"` // "text", "image", "link"
	EncryptedBlob []byte    `json:"-"`
	ContentSize   int       `json:"content_size"`
	CreatedAt     time.Time `json:"created_at"`
}

// ClipboardPushRequest is the JSON body for pushing a clipboard item.
type ClipboardPushRequest struct {
	ContentType   string `json:"content_type"`
	EncryptedBlob string `json:"encrypted_blob"` // base64-encoded
	ContentSize   int    `json:"content_size"`
}

// SyncFolder represents a folder registered for selective sync.
type SyncFolder struct {
	ID         string     `json:"id"`
	UserID     string     `json:"user_id"`
	FolderPath string     `json:"folder_path"`
	Label      string     `json:"label"`
	DeviceName string     `json:"device_name"`
	Enabled    bool       `json:"enabled"`
	LastSynced *time.Time `json:"last_synced,omitempty"`
	FileCount  int        `json:"file_count"`
	TotalSize  int64      `json:"total_size"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

// SyncFolderRequest is the JSON body for creating/updating a sync folder.
type SyncFolderRequest struct {
	FolderPath string `json:"folder_path"`
	Label      string `json:"label"`
	DeviceName string `json:"device_name"`
	Enabled    *bool  `json:"enabled,omitempty"`
}

// DecoyVault represents a plausible deniability decoy vault config.
type DecoyVault struct {
	ID                string    `json:"id"`
	UserID            string    `json:"user_id"`
	DecoyPasswordHash string    `json:"-"`
	Enabled           bool      `json:"enabled"`
	CreatedAt         time.Time `json:"created_at"`
}

// DecoyFile represents a fake file shown in the decoy vault.
type DecoyFile struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Name      string    `json:"original_name"`
	Size      int64     `json:"original_size"`
	CreatedAt time.Time `json:"created_at"`
}

// DecoySetupRequest is the JSON body for configuring a decoy vault.
type DecoySetupRequest struct {
	DecoyPassword string `json:"decoy_password"`
	Enabled       *bool  `json:"enabled,omitempty"`
}

// DecoyFileRequest is the JSON body for adding a decoy file.
type DecoyFileRequest struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
}

// DeadManSwitch represents a dead man's switch configuration.
type DeadManSwitch struct {
	ID           string     `json:"id"`
	UserID       string     `json:"user_id"`
	ContactEmail string     `json:"contact_email"`
	ContactName  string     `json:"contact_name"`
	TimeoutDays  int        `json:"timeout_days"`
	Message      string     `json:"message"`
	IncludeFiles bool       `json:"include_files"`
	Enabled      bool       `json:"enabled"`
	LastCheckin  time.Time  `json:"last_checkin"`
	Triggered    bool       `json:"triggered"`
	TriggeredAt  *time.Time `json:"triggered_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}

// DeadManSwitchRequest is the JSON body for configuring a dead man's switch.
type DeadManSwitchRequest struct {
	ContactEmail string `json:"contact_email"`
	ContactName  string `json:"contact_name"`
	TimeoutDays  int    `json:"timeout_days"`
	Message      string `json:"message"`
	IncludeFiles bool   `json:"include_files"`
	Enabled      *bool  `json:"enabled,omitempty"`
}

// ExpiringVault represents a vault with an auto-destruction date.
type ExpiringVault struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	ExpiresAt   time.Time `json:"expires_at"`
	Expired     bool      `json:"expired"`
	FileIDs     []string  `json:"file_ids"`
	CreatedAt   time.Time `json:"created_at"`
}

// ExpiringVaultRequest is the JSON body for creating an expiring vault.
type ExpiringVaultRequest struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	ExpiresAt   string   `json:"expires_at"` // ISO 8601
	FileIDs     []string `json:"file_ids"`
}

// Note represents an encrypted markdown note.
type Note struct {
	ID             string    `json:"id"`
	UserID         string    `json:"user_id"`
	EncryptedTitle []byte    `json:"encrypted_title"` // base64 over JSON
	EncryptedBody  []byte    `json:"encrypted_body"`  // base64 over JSON
	ContentSize    int       `json:"content_size"`
	Tags           []string  `json:"tags"`
	Pinned         bool      `json:"pinned"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// NoteRequest is the JSON body for creating/updating a note.
type NoteRequest struct {
	EncryptedTitle string   `json:"encrypted_title"` // base64
	EncryptedBody  string   `json:"encrypted_body"`  // base64
	ContentSize    int      `json:"content_size"`
	Tags           []string `json:"tags"`
	Pinned         *bool    `json:"pinned,omitempty"`
}

// Folder represents a (possibly nested) folder in a user's library.
type Folder struct {
	ID            string  `json:"id"`
	UserID        string  `json:"user_id"`
	ParentID      *string `json:"parent_id,omitempty"` // nil = root
	EncryptedName string  `json:"encrypted_name"`      // client-side-encrypted (base64); opaque to server
	CreatedAt     string  `json:"created_at"`
	DeletedAt     *string `json:"deleted_at,omitempty"`  // non-nil = in trash
	PwSalt        *string `json:"pw_salt,omitempty"`     // nil = unprotected; opaque base64, server never derives keys
	PwVerifier    *string `json:"pw_verifier,omitempty"` // opaque base64 verifier; client-only password check
}

// FolderRequest is the JSON body for creating a folder.
type FolderRequest struct {
	EncryptedName string  `json:"encrypted_name"`
	ParentID      *string `json:"parent_id"`
}

// FolderMoveRequest is the JSON body for moving a folder. ParentID null = move to root.
type FolderMoveRequest struct {
	ParentID *string `json:"parent_id"`
}

// FileMoveRequest is the JSON body for moving a file. FolderID null = move to root.
type FileMoveRequest struct {
	FolderID *string `json:"folder_id"`
}

// FolderPasswordRequest is the JSON body for setting/replacing a folder password.
// Both fields are opaque client-computed base64 blobs; the server stores them verbatim
// and never derives, sees, or logs the underlying folder password or any key.
type FolderPasswordRequest struct {
	PwSalt     string `json:"pw_salt"`
	PwVerifier string `json:"pw_verifier"`
}

// FileRekeyRequest is the JSON body for re-keying a single file when it crosses a
// protection boundary. Salt is base64 (decoded to 32 raw bytes server-side); WrappedCEK
// is the opaque base64 envelope. The server updates only these two columns and never sees keys.
type FileRekeyRequest struct {
	Salt       string `json:"salt"`
	WrappedCEK string `json:"wrapped_cek"`
}

// IntegritySnapshot represents a file hash snapshot for integrity monitoring.
type IntegritySnapshot struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	FileID    string    `json:"file_id"`
	FileName  string    `json:"file_name"`
	SHA256    string    `json:"sha256"`
	Size      int64     `json:"size"`
	Status    string    `json:"status"` // ok, changed, missing
	CheckedAt time.Time `json:"checked_at"`
	CreatedAt time.Time `json:"created_at"`
}

// VaultSnapshot represents a point-in-time snapshot of the user's vault.
type VaultSnapshot struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Label     string    `json:"label"`
	FileCount int       `json:"file_count"`
	TotalSize int64     `json:"total_size"`
	FileIDs   []string  `json:"file_ids"`
	CreatedAt time.Time `json:"created_at"`
}

// VaultSnapshotRequest is the JSON body for creating a vault snapshot.
type VaultSnapshotRequest struct {
	Label string `json:"label"`
}

// SharedVault represents a shared encrypted folder.
// WrappedSpaceKey/Role carry the CALLER's own membership grant on list/get: the
// space's symmetric key sealed to the caller's public key (base64), which the
// client unwraps with its private key to decrypt the space's files.
type SharedVault struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	OwnerID         string    `json:"owner_id"`
	Description     string    `json:"description"`
	FileIDs         []string  `json:"file_ids"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
	WrappedSpaceKey string    `json:"wrapped_space_key,omitempty"`
	Role            string    `json:"role,omitempty"`
	// Optional size cap in bytes (sum of shared files' original sizes). 0 = no limit.
	SizeLimitBytes int64 `json:"size_limit_bytes"`
}

// SharedVaultMember represents a member of a shared vault. WrappedSpaceKey is
// the space key sealed to THIS member's public key (opaque to the server).
type SharedVaultMember struct {
	ID              string    `json:"id"`
	VaultID         string    `json:"vault_id"`
	UserID          string    `json:"user_id"`
	Username        string    `json:"username,omitempty"`
	Email           string    `json:"email,omitempty"`
	Role            string    `json:"role"` // viewer, editor, admin
	JoinedAt        time.Time `json:"joined_at"`
	WrappedSpaceKey string    `json:"wrapped_space_key,omitempty"`
	// Fingerprint of this member's published public key, for out-of-band
	// verification against a server that might swap keys (MITM). Empty if the
	// member hasn't set up their keypair yet.
	Fingerprint string `json:"fingerprint,omitempty"`
}

// SharedVaultRequest is the JSON body for creating a shared vault. The owner
// generates the space key client-side and seals it to their own public key.
type SharedVaultRequest struct {
	Name            string   `json:"name"`
	Description     string   `json:"description"`
	FileIDs         []string `json:"file_ids"`
	WrappedSpaceKey string   `json:"wrapped_space_key"`
	SizeLimitBytes  int64    `json:"size_limit_bytes"`
}

// SharedVaultDetail includes vault info plus members and shared files (each with
// its space-wrapped CEK, which any member unwraps with the space key).
type SharedVaultDetail struct {
	SharedVault
	Members []SharedVaultMember `json:"members"`
	Files   []SharedVaultFile   `json:"files"`
}

// SharedVaultAddMemberRequest is the JSON body for adding a member. The caller
// (an admin) seals the space key to the target's public key and sends it here.
type SharedVaultAddMemberRequest struct {
	Email           string `json:"email"`
	Role            string `json:"role"` // viewer, editor, admin
	WrappedSpaceKey string `json:"wrapped_space_key"`
}

// SharedVaultFile is a file shared into a space, carrying its CEK re-wrapped
// under the space key. WrappedCEK is opaque base64 the server cannot open.
// Name/Size are joined from the owner's file row for member display (members
// can't query the owner-scoped files table directly).
type SharedVaultFile struct {
	VaultID    string    `json:"vault_id,omitempty"`
	FileID     string    `json:"file_id"`
	WrappedCEK string    `json:"wrapped_cek"`
	Name       string    `json:"name,omitempty"`
	Size       int64     `json:"size,omitempty"`
	AddedAt    time.Time `json:"added_at"`
}

// SharedVaultAddFileRequest is the JSON body for adding a file to a space. The
// caller (owner/editor) unwraps the file CEK with their vault key, re-wraps it
// under the space key, and sends the opaque envelope here.
type SharedVaultAddFileRequest struct {
	FileID     string `json:"file_id"`
	WrappedCEK string `json:"wrapped_cek"`
}

// SpaceFileGrant is the server-side authorization result for a member reading a
// shared file: it proves the caller is a member of a space containing the file
// and carries the space-wrapped CEK plus the owner's id (used to route chunk +
// storage-backend resolution through the owner without loosening owner scoping).
type SpaceFileGrant struct {
	OwnerID    string
	WrappedCEK string
}

// MemberKeyGrant / FileKeyWrap carry re-wrapped keys during a space-key rotation.
// Both values are opaque base64 the server cannot open.
type MemberKeyGrant struct {
	UserID          string `json:"user_id"`
	WrappedSpaceKey string `json:"wrapped_space_key"`
}

type FileKeyWrap struct {
	FileID     string `json:"file_id"`
	WrappedCEK string `json:"wrapped_cek"`
}

// SharedVaultRotateRequest re-keys a space after a membership change: a fresh
// space key is sealed to each REMAINING member's public key, and every shared
// file's CEK is re-wrapped under the new space key. A removed member is simply
// absent from Members, so they get no grant for the new key and — because the
// files are re-wrapped — any copy of the old key they kept becomes useless.
type SharedVaultRotateRequest struct {
	Members []MemberKeyGrant `json:"members"`
	Files   []FileKeyWrap    `json:"files"`
}

// OfflinePin represents a file pinned for offline access.
type OfflinePin struct {
	ID       string    `json:"id"`
	UserID   string    `json:"user_id"`
	FileID   string    `json:"file_id"`
	DeviceID string    `json:"device_id"`
	PinnedAt time.Time `json:"pinned_at"`
}

// OfflinePinRequest is the JSON body for pinning a file.
type OfflinePinRequest struct {
	FileID   string `json:"file_id"`
	DeviceID string `json:"device_id"`
}

// DevicePreference is a per-device UI preference: color theme + light/dark mode.
// Saved is false when no row exists yet (the other fields are then defaults),
// letting the client tell "server has a choice" from "first sync on this device".
type DevicePreference struct {
	DeviceID   string    `json:"device_id"`
	ColorTheme string    `json:"color_theme"`
	Mode       string    `json:"mode"`
	UpdatedAt  time.Time `json:"updated_at"`
	Saved      bool      `json:"saved"`
}

// DevicePreferenceRequest is the JSON body for saving a device preference.
type DevicePreferenceRequest struct {
	DeviceID   string `json:"device_id"`
	ColorTheme string `json:"color_theme"`
	Mode       string `json:"mode"`
}

// UserKey is a user's X25519 keypair record for zero-knowledge sharing. The
// private key is only ever present as client-encrypted ciphertext
// (WrappedPrivateKey); the server cannot decrypt it.
type UserKey struct {
	UserID            string    `json:"user_id"`
	PublicKey         string    `json:"public_key"`
	WrappedPrivateKey string    `json:"wrapped_private_key"`
	KDFSalt           string    `json:"kdf_salt"`
	Fingerprint       string    `json:"fingerprint"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// PublicKey is the shareable, non-secret subset of a UserKey (what other users
// fetch to wrap a space key to this user). Never includes the wrapped private key.
type PublicKey struct {
	UserID      string `json:"user_id"`
	PublicKey   string `json:"public_key"`
	Fingerprint string `json:"fingerprint"`
}

// PublishKeyRequest is the JSON body for publishing/rotating a keypair. All
// fields are produced client-side; the server stores them verbatim.
type PublishKeyRequest struct {
	PublicKey         string `json:"public_key"`
	WrappedPrivateKey string `json:"wrapped_private_key"`
	KDFSalt           string `json:"kdf_salt"`
	Fingerprint       string `json:"fingerprint"`
}
