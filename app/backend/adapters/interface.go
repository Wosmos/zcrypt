package adapters

import (
	"context"

	"github.com/zpush/zpush/types"
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
	// FlushCommits creates a single commit for all pending uploaded chunks.
	FlushCommits(ctx context.Context, repo string) error
}
