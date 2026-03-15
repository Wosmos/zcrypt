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

func (r Role) String() string          { return roleToString[r] }
func (r Role) IsValid() bool           { return r == RoleUser || r == RoleAdmin }
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
	Status         string    `json:"status"`
	CreatedAt      time.Time `json:"created_at"`
}

// ChunkRef identifies a single chunk stored on a platform.
type ChunkRef struct {
	ChunkID    string `json:"chunk_id"`
	FileID     string `json:"file_id"`
	UserID     string `json:"user_id,omitempty"`
	Index      int    `json:"index"`
	Size       int64  `json:"size"`
	SHA256     string `json:"sha256"`
	Platform   string `json:"platform"`
	Account    string `json:"account"`
	Repo       string `json:"repo"`
	RemotePath string `json:"remote_path"`
	Compressed bool   `json:"compressed"`
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
	Error     string `json:"error,omitempty"`
	TokenID   string `json:"token_id,omitempty"`
	IsGlobal  bool   `json:"is_global,omitempty"`
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
	Filename     string `json:"filename"`
	OriginalSize int64  `json:"original_size"`
	SHA256       string `json:"sha256"`
	Salt         string `json:"salt"` // base64-encoded 32 bytes
	ChunkCount   int    `json:"chunk_count"`
	Platform     string `json:"platform,omitempty"`
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
	Provider      string    `json:"provider"`       // "google" or "github"
	ProviderID    string    `json:"provider_id"`     // unique ID from provider
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
}

// PlanConfigs wraps all plan configurations.
type PlanConfigs struct {
	Plans []PlanConfig `json:"plans"`
}

// SystemStats holds system-wide aggregate statistics.
type SystemStats struct {
	TotalUsers        int   `json:"total_users"`
	TotalFiles        int   `json:"total_files"`
	TotalStorageBytes int64 `json:"total_size"`
	TotalRepos        int   `json:"total_repos"`
}
