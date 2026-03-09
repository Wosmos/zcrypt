package pipeline

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"

	"log"

	"github.com/google/uuid"
	"github.com/zpush/zpush/adapters"
	"github.com/zpush/zpush/chunks"
	"github.com/zpush/zpush/compression"
	"github.com/zpush/zpush/config"
	"github.com/zpush/zpush/crypto"
	"github.com/zpush/zpush/disguise"
	"github.com/zpush/zpush/index"
	"github.com/zpush/zpush/reppool"
	"github.com/zpush/zpush/types"
)

// AdapterResolver resolves the correct adapter for a given chunk reference.
type AdapterResolver func(ref types.ChunkRef) adapters.PlatformAdapter

// PreparedFile holds the result of Phase 1 (local processing).
type PreparedFile struct {
	FileID     string
	Meta       *types.FileMetadata
	StagingDir string
	ChunkInfos []ChunkInfo
	RepoURL    string
	RepoID     string
	Account    string
	Platform   string
}

// ChunkInfo holds metadata about a single chunk on disk.
type ChunkInfo struct {
	Path  string
	Hash  string
	Size  int64
	Index int
}

// PipelineEngine orchestrates upload and download operations.
type PipelineEngine struct {
	db              *index.DB
	adapter         adapters.PlatformAdapter
	pool            *reppool.Manager
	progress        *ProgressEmitter
	userID          string
	account         string
	adapterResolver AdapterResolver
}

// NewPipelineEngine creates a new pipeline engine for pushing.
func NewPipelineEngine(db *index.DB, adapter adapters.PlatformAdapter, pool *reppool.Manager, progress *ProgressEmitter, userID, account string) *PipelineEngine {
	return &PipelineEngine{
		db:       db,
		adapter:  adapter,
		pool:     pool,
		progress: progress,
		userID:   userID,
		account:  account,
	}
}

// NewPullEngine creates a pipeline engine for pulling with per-chunk adapter resolution.
func NewPullEngine(db *index.DB, progress *ProgressEmitter, userID string, resolver AdapterResolver) *PipelineEngine {
	return &PipelineEngine{
		db:              db,
		progress:        progress,
		userID:          userID,
		adapterResolver: resolver,
	}
}

// Prepare executes Phase 1 of the upload pipeline (all local, fast):
// VALIDATE → COMPRESS → ENCRYPT → CHUNK → HASH → INDEX
// Chunks are written to a persistent staging directory.
func (pe *PipelineEngine) Prepare(ctx context.Context, filePath, originalFilename, passphrase, fileID string) (*PreparedFile, error) {
	// --- VALIDATE ---
	pe.progress.Emit(types.ProgressEvent{FileID: fileID, Stage: "validating", Percent: 0})

	info, err := os.Stat(filePath)
	if err != nil {
		return nil, fmt.Errorf("file not found: %w", err)
	}
	if passphrase == "" {
		return nil, fmt.Errorf("passphrase cannot be empty")
	}

	originalName := originalFilename
	if originalName == "" {
		originalName = filepath.Base(filePath)
	}
	originalSize := info.Size()

	// Compute original file hash (streaming to avoid loading entire file into memory)
	originalSHA, err := hashFileStreaming(filePath)
	if err != nil {
		return nil, fmt.Errorf("hash file: %w", err)
	}

	// Setup temp directory for intermediate files
	tmpDir, err := config.TmpDir()
	if err != nil {
		return nil, err
	}
	opDir := filepath.Join(tmpDir, fileID)
	if err := os.MkdirAll(opDir, 0700); err != nil {
		return nil, fmt.Errorf("create temp dir: %w", err)
	}
	defer os.RemoveAll(opDir)

	// Setup persistent staging directory for chunks
	stagingBase, err := config.StagingDir()
	if err != nil {
		return nil, err
	}
	stagingDir := filepath.Join(stagingBase, fileID)
	if err := os.MkdirAll(stagingDir, 0700); err != nil {
		return nil, fmt.Errorf("create staging dir: %w", err)
	}

	// --- COMPRESS ---
	pe.progress.Emit(types.ProgressEvent{FileID: fileID, Stage: "compressing", Percent: 10, TotalBytes: originalSize})

	compressedPath := filepath.Join(opDir, fileID+".zst")
	if err := compression.CompressFile(filePath, compressedPath); err != nil {
		return nil, fmt.Errorf("compress: %w", err)
	}

	compressedInfo, err := os.Stat(compressedPath)
	if err != nil {
		return nil, err
	}
	compressedSize := compressedInfo.Size()

	sourceForEncrypt := compressedPath
	if compressedSize >= originalSize {
		log.Printf("[compress] %s: skipped (compressed %d >= original %d)", originalName, compressedSize, originalSize)
		os.Remove(compressedPath)
		sourceForEncrypt = filePath
		compressedSize = originalSize
	} else {
		ratio := float64(originalSize-compressedSize) / float64(originalSize) * 100
		log.Printf("[compress] %s: %d → %d (%.1f%% saved)", originalName, originalSize, compressedSize, ratio)
	}

	// --- ENCRYPT ---
	pe.progress.Emit(types.ProgressEvent{FileID: fileID, Stage: "encrypting", Percent: 30, BytesProcessed: compressedSize, TotalBytes: originalSize})

	encryptedPath := filepath.Join(opDir, fileID+".enc")
	salt, iv, err := crypto.EncryptFile(sourceForEncrypt, encryptedPath, passphrase)
	if err != nil {
		return nil, fmt.Errorf("encrypt: %w", err)
	}

	encryptedInfo, err := os.Stat(encryptedPath)
	if err != nil {
		return nil, err
	}
	encryptedSize := encryptedInfo.Size()

	if sourceForEncrypt == compressedPath {
		os.Remove(compressedPath)
	}

	// --- CHUNK (into staging dir) ---
	pe.progress.Emit(types.ProgressEvent{FileID: fileID, Stage: "chunking", Percent: 50, BytesProcessed: encryptedSize, TotalBytes: originalSize})

	chunkPaths, err := chunks.SplitFile(encryptedPath, stagingDir)
	if err != nil {
		return nil, fmt.Errorf("chunk: %w", err)
	}

	os.Remove(encryptedPath)

	// --- HASH ---
	pe.progress.Emit(types.ProgressEvent{FileID: fileID, Stage: "hashing", Percent: 60})

	var chunkInfos []ChunkInfo
	for i, cp := range chunkPaths {
		hash, err := chunks.HashFile(cp)
		if err != nil {
			return nil, fmt.Errorf("hash chunk: %w", err)
		}
		ci, _ := os.Stat(cp)
		chunkInfos = append(chunkInfos, ChunkInfo{Path: cp, Hash: hash, Size: ci.Size(), Index: i})
	}

	// --- GET REPO ---
	repo, err := pe.pool.GetOrCreateRepo(ctx)
	if err != nil {
		return nil, fmt.Errorf("get repo: %w", err)
	}

	// --- INDEX (with status='uploading') ---
	pe.progress.Emit(types.ProgressEvent{FileID: fileID, Stage: "indexing", Percent: 65})

	fileMeta := &types.FileMetadata{
		ID:             fileID,
		OriginalName:   originalName,
		OriginalSize:   originalSize,
		CompressedSize: compressedSize,
		EncryptedSize:  encryptedSize,
		ChunkCount:     len(chunkInfos),
		SHA256:         originalSHA,
		Salt:           salt,
		IV:             iv,
		Status:         "uploading",
	}

	if err := pe.db.InsertFile(ctx, pe.userID, fileMeta); err != nil {
		return nil, fmt.Errorf("index file: %w", err)
	}

	// Insert all chunk placeholders in a single batch query
	chunkRefs := make([]*types.ChunkRef, len(chunkInfos))
	for i, ci := range chunkInfos {
		chunkRefs[i] = &types.ChunkRef{
			ChunkID:    uuid.New().String(),
			FileID:     fileID,
			Index:      ci.Index,
			Size:       ci.Size,
			SHA256:     ci.Hash,
			Platform:   repo.Platform,
			Account:    pe.account,
			Repo:       repo.URL,
			RemotePath: "",
		}
	}
	if err := pe.db.InsertChunksBatch(ctx, pe.userID, chunkRefs); err != nil {
		return nil, fmt.Errorf("index chunk placeholders: %w", err)
	}

	return &PreparedFile{
		FileID:     fileID,
		Meta:       fileMeta,
		StagingDir: stagingDir,
		ChunkInfos: chunkInfos,
		RepoURL:    repo.URL,
		RepoID:     repo.ID,
		Account:    pe.account,
		Platform:   repo.Platform,
	}, nil
}

const maxConcurrentChunkUploads = 3

// Upload executes Phase 2 of the upload pipeline (network, resumable):
// Uploads pending chunks concurrently, then commits and cleans up.
func (pe *PipelineEngine) Upload(ctx context.Context, prepared *PreparedFile) error {
	fileID := prepared.FileID

	// Query DB for chunks that still need uploading
	pendingChunks, err := pe.db.GetPendingChunksForFile(ctx, fileID)
	if err != nil {
		return fmt.Errorf("get pending chunks: %w", err)
	}

	if len(pendingChunks) == 0 {
		// All chunks already uploaded, just finalize
		return pe.finalizeUpload(ctx, prepared)
	}

	totalChunks := prepared.Meta.ChunkCount
	uploadedCount := totalChunks - len(pendingChunks)

	pe.progress.Emit(types.ProgressEvent{
		FileID:  fileID,
		Stage:   "uploading",
		Percent: 70 + (25 * uploadedCount / totalChunks),
	})

	// Upload chunks concurrently with semaphore
	sem := make(chan struct{}, maxConcurrentChunkUploads)
	var mu sync.Mutex
	var uploadErr error
	var wg sync.WaitGroup

	for _, chunkRef := range pendingChunks {
		select {
		case <-ctx.Done():
			wg.Wait()
			return ctx.Err()
		default:
		}

		// Check if a previous goroutine failed
		mu.Lock()
		if uploadErr != nil {
			mu.Unlock()
			break
		}
		mu.Unlock()

		sem <- struct{}{} // acquire
		wg.Add(1)

		go func(ref types.ChunkRef) {
			defer wg.Done()
			defer func() { <-sem }() // release
			defer func() {
				if r := recover(); r != nil {
					mu.Lock()
					if uploadErr == nil {
						uploadErr = fmt.Errorf("upload chunk %d panicked: %v", ref.Index, r)
					}
					mu.Unlock()
				}
			}()

			// Find the chunk file on disk
			chunkPath := filepath.Join(prepared.StagingDir, fmt.Sprintf("chunk_%03d", ref.Index))

			data, readErr := os.ReadFile(chunkPath)
			if readErr != nil {
				mu.Lock()
				if uploadErr == nil {
					uploadErr = fmt.Errorf("read chunk %d: %w", ref.Index, readErr)
				}
				mu.Unlock()
				return
			}

			remotePath, genErr := disguise.ChunkFilename()
			if genErr != nil {
				mu.Lock()
				if uploadErr == nil {
					uploadErr = fmt.Errorf("generate chunk filename: %w", genErr)
				}
				mu.Unlock()
				return
			}

			chunk := types.Chunk{
				Ref: types.ChunkRef{
					ChunkID:    ref.ChunkID,
					FileID:     fileID,
					Index:      ref.Index,
					Size:       ref.Size,
					SHA256:     ref.SHA256,
					Account:    prepared.Account,
					RemotePath: remotePath,
				},
				Data: data,
			}

			uploadedRef, upErr := pe.adapter.Upload(ctx, prepared.RepoURL, chunk)
			if upErr != nil {
				mu.Lock()
				if uploadErr == nil {
					uploadErr = fmt.Errorf("upload chunk %d: %w", ref.Index, upErr)
				}
				mu.Unlock()
				return
			}

			// Use the path the adapter actually stored (may differ from original on retry)
			actualPath := uploadedRef.RemotePath

			// Mark chunk as uploaded in DB
			if dbErr := pe.db.UpdateChunkRemotePath(ctx, ref.ChunkID, actualPath); dbErr != nil {
				mu.Lock()
				if uploadErr == nil {
					uploadErr = fmt.Errorf("update chunk %d path: %w", ref.Index, dbErr)
				}
				mu.Unlock()
				return
			}

			// Emit per-chunk progress
			mu.Lock()
			uploadedCount++
			percent := 70 + (25 * uploadedCount / totalChunks)
			mu.Unlock()

			pe.progress.Emit(types.ProgressEvent{
				FileID:         fileID,
				Stage:          fmt.Sprintf("uploading chunk %d/%d", uploadedCount, totalChunks),
				Percent:        percent,
				BytesProcessed: ref.Size,
				TotalBytes:     prepared.Meta.EncryptedSize,
			})
		}(chunkRef)
	}

	wg.Wait()

	if uploadErr != nil {
		return uploadErr
	}

	return pe.finalizeUpload(ctx, prepared)
}

// finalizeUpload commits to the platform, marks file as complete, and cleans up staging.
func (pe *PipelineEngine) finalizeUpload(ctx context.Context, prepared *PreparedFile) error {
	fileID := prepared.FileID

	// Flush batch commits if the adapter supports it (e.g., HuggingFace)
	if bc, ok := pe.adapter.(adapters.BatchCommitter); ok {
		pe.progress.Emit(types.ProgressEvent{FileID: fileID, Stage: "committing", Percent: 96})
		if err := bc.FlushCommits(ctx, prepared.RepoURL); err != nil {
			return fmt.Errorf("flush commits: %w", err)
		}
	}

	// Update repo usage
	if err := pe.pool.UpdateUsage(prepared.RepoID, prepared.Meta.EncryptedSize); err != nil {
		fmt.Fprintf(os.Stderr, "warn: update repo usage: %v\n", err)
	}

	// Mark file as complete
	pe.progress.Emit(types.ProgressEvent{FileID: fileID, Stage: "finalizing", Percent: 98})

	if err := pe.db.UpdateFileStatus(ctx, fileID, "complete"); err != nil {
		return fmt.Errorf("update file status: %w", err)
	}

	// Clean up staging directory
	os.RemoveAll(prepared.StagingDir)

	pe.progress.Emit(types.ProgressEvent{FileID: fileID, Stage: "done", Percent: 100})
	return nil
}

// Push executes the full upload pipeline (convenience wrapper for non-resumable use).
func (pe *PipelineEngine) Push(ctx context.Context, filePath, originalFilename, passphrase string) (*types.FileMetadata, error) {
	fileID := uuid.New().String()

	prepared, err := pe.Prepare(ctx, filePath, originalFilename, passphrase, fileID)
	if err != nil {
		return nil, err
	}

	if err := pe.Upload(ctx, prepared); err != nil {
		return nil, err
	}

	return prepared.Meta, nil
}

// Pull executes the full download pipeline:
// LOOKUP → FETCH → VERIFY → REASSEMBLE → DECRYPT → DECOMPRESS → WRITE → CLEANUP
func (pe *PipelineEngine) Pull(ctx context.Context, filename, passphrase, outputDir string) error {
	// --- LOOKUP ---
	pe.progress.Emit(types.ProgressEvent{Stage: "looking up", Percent: 0})

	fileMeta, err := pe.db.GetFile(ctx, pe.userID, filename)
	if err != nil {
		return fmt.Errorf("file not found in index: %w", err)
	}

	if fileMeta.Status != "complete" {
		return fmt.Errorf("file upload is not complete (status: %s)", fileMeta.Status)
	}

	chunkRefs, err := pe.db.GetChunksForFile(ctx, fileMeta.ID)
	if err != nil {
		return fmt.Errorf("get chunks: %w", err)
	}

	if len(chunkRefs) != fileMeta.ChunkCount {
		return fmt.Errorf("incomplete chunks: expected %d, got %d uploaded", fileMeta.ChunkCount, len(chunkRefs))
	}

	if passphrase == "" {
		return fmt.Errorf("passphrase cannot be empty")
	}

	// Setup temp directory
	tmpDir, err := config.TmpDir()
	if err != nil {
		return err
	}
	opID := uuid.New().String()
	opDir := filepath.Join(tmpDir, opID)
	if err := os.MkdirAll(opDir, 0700); err != nil {
		return fmt.Errorf("create temp dir: %w", err)
	}
	defer os.RemoveAll(opDir)

	// --- FETCH (concurrent) ---
	pe.progress.Emit(types.ProgressEvent{Stage: "downloading", Percent: 10})

	const maxConcurrentDownloads = 5
	chunkPaths := make([]string, len(chunkRefs))
	dlSem := make(chan struct{}, maxConcurrentDownloads)
	var dlWg sync.WaitGroup
	var dlMu sync.Mutex
	var dlErr error
	var dlCount int

	for i, ref := range chunkRefs {
		dlMu.Lock()
		if dlErr != nil {
			dlMu.Unlock()
			break
		}
		dlMu.Unlock()

		select {
		case <-ctx.Done():
			dlWg.Wait()
			return ctx.Err()
		default:
		}

		dlSem <- struct{}{}
		dlWg.Add(1)

		go func(i int, ref types.ChunkRef) {
			defer dlWg.Done()
			defer func() { <-dlSem }()
			defer func() {
				if r := recover(); r != nil {
					dlMu.Lock()
					if dlErr == nil {
						dlErr = fmt.Errorf("download chunk %d panicked: %v", i, r)
					}
					dlMu.Unlock()
				}
			}()

			dlAdapter := pe.adapter
			if pe.adapterResolver != nil {
				dlAdapter = pe.adapterResolver(ref)
			}
			if dlAdapter == nil {
				dlMu.Lock()
				if dlErr == nil {
					dlErr = fmt.Errorf("no adapter for chunk %d (platform=%s, account=%s)", i, ref.Platform, ref.Account)
				}
				dlMu.Unlock()
				return
			}

			data, err := dlAdapter.Download(ctx, ref)
			if err != nil {
				dlMu.Lock()
				if dlErr == nil {
					dlErr = fmt.Errorf("download chunk %d: %w", i, err)
				}
				dlMu.Unlock()
				return
			}

			chunkPath := filepath.Join(opDir, fmt.Sprintf("chunk_%03d", ref.Index))
			if err := os.WriteFile(chunkPath, data, 0600); err != nil {
				dlMu.Lock()
				if dlErr == nil {
					dlErr = fmt.Errorf("write chunk %d: %w", i, err)
				}
				dlMu.Unlock()
				return
			}

			if err := chunks.VerifyChunk(chunkPath, ref.SHA256); err != nil {
				dlMu.Lock()
				if dlErr == nil {
					dlErr = fmt.Errorf("verify chunk %d: %w", i, err)
				}
				dlMu.Unlock()
				return
			}

			chunkPaths[i] = chunkPath

			dlMu.Lock()
			dlCount++
			percent := 10 + (40 * dlCount / len(chunkRefs))
			dlMu.Unlock()

			pe.progress.Emit(types.ProgressEvent{
				Stage:          fmt.Sprintf("downloading chunk %d/%d", dlCount, len(chunkRefs)),
				Percent:        percent,
				BytesProcessed: ref.Size,
				TotalBytes:     fileMeta.EncryptedSize,
			})
		}(i, ref)
	}

	dlWg.Wait()
	if dlErr != nil {
		return dlErr
	}

	// --- REASSEMBLE ---
	pe.progress.Emit(types.ProgressEvent{Stage: "reassembling", Percent: 55})

	encryptedPath := filepath.Join(opDir, "reassembled.enc")
	if err := chunks.MergeFiles(chunkPaths, encryptedPath); err != nil {
		return fmt.Errorf("reassemble: %w", err)
	}

	// --- DECRYPT ---
	pe.progress.Emit(types.ProgressEvent{Stage: "decrypting", Percent: 70})

	wasCompressed := fileMeta.CompressedSize < fileMeta.OriginalSize
	outputPath := filepath.Join(outputDir, fileMeta.OriginalName)

	if wasCompressed {
		compressedPath := filepath.Join(opDir, "decrypted.zst")
		if err := crypto.DecryptFile(encryptedPath, compressedPath, passphrase); err != nil {
			return fmt.Errorf("decrypt: %w", err)
		}

		// --- DECOMPRESS ---
		pe.progress.Emit(types.ProgressEvent{Stage: "decompressing", Percent: 85})

		if err := compression.DecompressFile(compressedPath, outputPath); err != nil {
			return fmt.Errorf("decompress: %w", err)
		}
	} else {
		if err := crypto.DecryptFile(encryptedPath, outputPath, passphrase); err != nil {
			return fmt.Errorf("decrypt: %w", err)
		}
	}

	// --- VERIFY OUTPUT ---
	outputHash, err := chunks.HashFile(outputPath)
	if err != nil {
		return fmt.Errorf("hash output: %w", err)
	}
	if outputHash != fileMeta.SHA256 {
		os.Remove(outputPath)
		return fmt.Errorf("output integrity check failed: expected %s, got %s", fileMeta.SHA256, outputHash)
	}

	// --- DONE ---
	pe.progress.Emit(types.ProgressEvent{Stage: "done", Percent: 100})

	return nil
}

// hashFileStreaming computes SHA-256 without loading the entire file into memory.
func hashFileStreaming(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
