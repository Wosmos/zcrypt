package adapters

import (
	"context"

	"github.com/zcrypt/zcrypt/types"
)

// PlatformAdapter defines the unified interface for all platform backends.
type PlatformAdapter interface {
	// Upload pushes a chunk to the platform and returns its reference.
	Upload(ctx context.Context, repo string, chunk types.Chunk) (types.ChunkRef, error)

	// Download fetches a chunk's data from the platform.
	Download(ctx context.Context, ref types.ChunkRef) ([]byte, error)

	// Delete removes a chunk from the platform.
	Delete(ctx context.Context, ref types.ChunkRef) error

	// GetRepoSize returns the total bytes used in a repository.
	GetRepoSize(ctx context.Context, repo string) (int64, error)

	// CreateRepo creates a new repository on the platform.
	CreateRepo(ctx context.Context, name string) (string, error)

	// ListChunks lists all chunk files in a repository.
	ListChunks(ctx context.Context, repo string) ([]types.ChunkRef, error)

	// PlatformName returns the name of this platform.
	PlatformName() string
}

// BatchCommitter is an optional interface for adapters that can batch multiple
// chunk uploads into a single commit (e.g., HuggingFace).
type BatchCommitter interface {
	// FlushCommits creates a single commit for all pending uploaded chunks that
	// were buffered in-memory via RegisterUpload/Upload. Legacy path.
	FlushCommits(ctx context.Context, repo string) error

	// CommitChunks creates a single commit for the given already-uploaded chunks,
	// derived entirely from durable DB state (path + LFS oid + size) rather than
	// any in-memory buffer. This is what makes committing crash-safe and
	// reconcilable: it can be re-run after a restart or a cache eviction and is
	// idempotent (re-committing an already-present path is a platform no-op).
	// A nil/empty list is a no-op.
	CommitChunks(ctx context.Context, repo string, files []CommitFile) error
}

// CommitFile is one entry in a DB-driven batch commit: the disguised remote path,
// the LFS oid (== the chunk's stored sha256 of its ciphertext), and its size.
type CommitFile struct {
	Path string
	OID  string
	Size int64
}

// BatchDeleter is an optional interface for adapters that can remove many chunks
// from a repo in a SINGLE commit. This is essential for platforms that rate-limit
// commits (HuggingFace: 128 commits/hour/repo) — deleting one-file-per-commit
// storms that limit, so a bulk trash-empty must collapse into one commit.
type BatchDeleter interface {
	// BatchDelete removes the given paths from one repo in a single commit. Paths
	// that no longer exist are treated as already-deleted (skipped), so a queue of
	// never-committed / 404 paths drains without a wasted commit. A rate-limit
	// (HTTP 429) is returned as an error the caller can detect and back off on.
	BatchDelete(ctx context.Context, repo string, remotePaths []string) error
}

// DirectUploader is an optional interface for adapters that support presigned URL uploads.
// When available, clients upload chunks directly to the platform storage,
// bypassing the server relay and eliminating the double-hop bottleneck.
type DirectUploader interface {
	// GetUploadURL obtains a presigned upload URL from the platform.
	// Returns ("", nil, nil) if the object already exists (dedup).
	GetUploadURL(ctx context.Context, repo string, oid string, size int64) (url string, headers map[string]string, err error)

	// RegisterUpload records a directly-uploaded chunk for later batch commit.
	RegisterUpload(remotePath, oid string, size int64)
}
