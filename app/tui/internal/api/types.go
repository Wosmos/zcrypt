package api

// ─── Auth ──────────────────────────────────────────────────────

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	AccessToken  string `json:"access_token,omitempty"`
	RefreshToken string `json:"refresh_token,omitempty"`
	User         *User  `json:"user,omitempty"`
	Requires2FA  bool   `json:"requires_2fa,omitempty"`
	TempToken    string `json:"temp_token,omitempty"`
}

type RegisterRequest struct {
	Email    string `json:"email"`
	Username string `json:"username"`
	Password string `json:"password"`
	Force    bool   `json:"force,omitempty"`
}

type RegisterResponse struct {
	Success     bool   `json:"success"`
	User        *User  `json:"user,omitempty"`
	Warning     string `json:"warning,omitempty"`
	BreachCount int    `json:"breach_count,omitempty"`
	Requires    string `json:"requires,omitempty"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type Verify2FARequest struct {
	TempToken string `json:"temp_token"`
	Code      string `json:"code"`
}

type LogoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type User struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	Username      string `json:"username"`
	Role          string `json:"role"`
	EmailVerified bool   `json:"email_verified"`
	TOTPEnabled   bool   `json:"totp_enabled"`
	Plan          string `json:"plan,omitempty"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at,omitempty"`
}

// ─── Files ─────────────────────────────────────────────────────

type FileMetadata struct {
	ID             string `json:"id"`
	OriginalName   string `json:"original_name"`
	OriginalSize   int64  `json:"original_size"`
	CompressedSize int64  `json:"compressed_size"`
	EncryptedSize  int64  `json:"encrypted_size"`
	ChunkCount     int    `json:"chunk_count"`
	SHA256         string `json:"sha256"`
	Status         string `json:"status,omitempty"`
	CreatedAt      string `json:"created_at"`
}

type FileMetaResponse struct {
	ID             string `json:"id"`
	OriginalName   string `json:"original_name"`
	OriginalSize   int64  `json:"original_size"`
	CompressedSize int64  `json:"compressed_size"`
	EncryptedSize  int64  `json:"encrypted_size"`
	ChunkCount     int    `json:"chunk_count"`
	SHA256         string `json:"sha256"`
	Salt           string `json:"salt"` // base64
	Status         string `json:"status"`
	CreatedAt      string `json:"created_at"`
}

// ─── Upload ────────────────────────────────────────────────────

type UploadInitRequest struct {
	Filename     string `json:"filename"`
	OriginalSize int64  `json:"original_size"`
	SHA256       string `json:"sha256"`
	Salt         string `json:"salt"` // base64
	ChunkCount   int    `json:"chunk_count"`
	Platform     string `json:"platform,omitempty"`
}

type UploadInitResponse struct {
	SessionID    string `json:"session_id"`
	FileID       string `json:"file_id"`
	Platform     string `json:"platform"`
	DirectUpload bool   `json:"direct_upload"`
}

type PresignRequest struct {
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

type PresignResponse struct {
	UploadURL     string            `json:"upload_url"`
	UploadHeaders map[string]string `json:"upload_headers"`
	RemotePath    string            `json:"remote_path"`
	AlreadyExists bool              `json:"already_exists"`
}

type ConfirmChunkRequest struct {
	SHA256     string `json:"sha256"`
	Size       int64  `json:"size"`
	RemotePath string `json:"remote_path"`
	Compressed bool   `json:"compressed"`
}

type UploadCompleteRequest struct {
	EncryptedSize  int64 `json:"encrypted_size"`
	CompressedSize int64 `json:"compressed_size"`
}

type UploadCompleteResponse struct {
	Success bool   `json:"success"`
	FileID  string `json:"file_id"`
}

type UploadStatusResponse struct {
	SessionID      string `json:"session_id"`
	FileID         string `json:"file_id"`
	Status         string `json:"status"`
	ChunkCount     int    `json:"chunk_count"`
	UploadedChunks []int  `json:"uploaded_chunks"`
	CompletedCount int    `json:"completed_count"`
}

// ─── Download ──────────────────────────────────────────────────

type ChunkDownload struct {
	Data       []byte
	SHA256     string
	Compressed bool
}

// ─── Quota ─────────────────────────────────────────────────────

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

// ─── Platforms ──────────────────────────────────────────────────

type PlatformStatus struct {
	Platform  string `json:"platform"`
	Account   string `json:"account,omitempty"`
	Connected bool   `json:"connected"`
	Username  string `json:"username,omitempty"`
	Error     string `json:"error,omitempty"`
}

type ConnectPlatformRequest struct {
	Platform string `json:"platform"`
	Token    string `json:"token"`
}

type ConnectPlatformResponse struct {
	Success  bool   `json:"success"`
	Username string `json:"username"`
}

type DisconnectPlatformRequest struct {
	Platform string `json:"platform"`
	Username string `json:"username"`
}

// ─── Generic ───────────────────────────────────────────────────

type ErrorResponse struct {
	Error string `json:"error"`
}

type SuccessResponse struct {
	Success bool `json:"success"`
}
