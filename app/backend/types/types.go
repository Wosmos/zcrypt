package types

import "time"

// FileMetadata represents a stored file in the local index.
type FileMetadata struct {
	ID            string    `json:"id"`
	OriginalName  string    `json:"original_name"`
	OriginalSize  int64     `json:"original_size"`
	CompressedSize int64    `json:"compressed_size"`
	EncryptedSize int64     `json:"encrypted_size"`
	ChunkCount    int       `json:"chunk_count"`
	SHA256        string    `json:"sha256"`
	Salt          []byte    `json:"-"`
	IV            []byte    `json:"-"`
	CreatedAt     time.Time `json:"created_at"`
}

// ChunkRef identifies a single chunk stored on a platform.
type ChunkRef struct {
	ChunkID    string `json:"chunk_id"`
	FileID     string `json:"file_id"`
	Index      int    `json:"index"`
	Size       int64  `json:"size"`
	SHA256     string `json:"sha256"`
	Platform   string `json:"platform"`
	Account    string `json:"account"`
	Repo       string `json:"repo"`
	RemotePath string `json:"remote_path"`
}

// Chunk holds chunk data for upload/download.
type Chunk struct {
	Ref  ChunkRef
	Data []byte
}

// RepoInfo tracks a repository in the pool.
type RepoInfo struct {
	ID        string `json:"id"`
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
}

// ProgressEvent is sent to the frontend during operations.
type ProgressEvent struct {
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

// PushRequest is the HTTP request to push a file.
type PushRequest struct {
	Passphrase string `json:"passphrase"`
	// File comes via multipart form data
}

// PullRequest is the HTTP request to pull a file.
type PullRequest struct {
	Filename   string `json:"filename"`
	Passphrase string `json:"passphrase"`
}

// Config holds the app configuration.
type Config struct {
	GithubToken    string            `json:"github_token,omitempty"`
	DefaultPlatform string           `json:"default_platform"`
	Thresholds     map[string]int64  `json:"thresholds"`
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
