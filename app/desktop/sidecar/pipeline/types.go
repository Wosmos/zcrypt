package pipeline

import "time"

// ChunkJob is the input to a worker goroutine.
type ChunkJob struct {
	Index     int
	Data      []byte
	KeyBytes  []byte
	Compress  bool
	ZstdLevel int
}

// ChunkResult is the output from a worker goroutine.
type ChunkResult struct {
	Index          int
	Encrypted      []byte
	SHA256         string
	Compressed     bool
	OriginalSize   int
	CompressedSize int
	EncryptedSize  int
	Error          error
}

// UploadProgress reports upload pipeline progress.
type UploadProgress struct {
	FileID      string
	FileName    string
	Stage       string // "hashing", "deriving_key", "processing", "uploading", "finalizing", "done", "error"
	ChunksDone  int
	ChunksTotal int
	BytesDone   int64
	BytesTotal  int64
	Speed       float64 // bytes/sec
	ETA         time.Duration
	Error       error
}

// DownloadProgress reports download pipeline progress.
type DownloadProgress struct {
	FileID      string
	FileName    string
	Stage       string // "fetching_meta", "deriving_key", "downloading", "verifying", "saving", "done", "error"
	ChunksDone  int
	ChunksTotal int
	BytesDone   int64
	BytesTotal  int64
	Speed       float64
	ETA         time.Duration
	Error       error
}
