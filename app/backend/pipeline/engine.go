package pipeline

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"

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

// PipelineEngine orchestrates upload and download operations.
type PipelineEngine struct {
	db              *index.DB
	adapter         adapters.PlatformAdapter
	pool            *reppool.Manager
	progress        *ProgressEmitter
	account         string
	adapterResolver AdapterResolver
}

// NewPipelineEngine creates a new pipeline engine for pushing.
func NewPipelineEngine(db *index.DB, adapter adapters.PlatformAdapter, pool *reppool.Manager, progress *ProgressEmitter, account string) *PipelineEngine {
	return &PipelineEngine{
		db:       db,
		adapter:  adapter,
		pool:     pool,
		progress: progress,
		account:  account,
	}
}

// NewPullEngine creates a pipeline engine for pulling with per-chunk adapter resolution.
func NewPullEngine(db *index.DB, progress *ProgressEmitter, resolver AdapterResolver) *PipelineEngine {
	return &PipelineEngine{
		db:              db,
		progress:        progress,
		adapterResolver: resolver,
	}
}

// Push executes the full upload pipeline:
// VALIDATE → COMPRESS → ENCRYPT → CHUNK → HASH → UPLOAD → INDEX → CLEANUP
func (pe *PipelineEngine) Push(ctx context.Context, filePath, originalFilename, passphrase string) (*types.FileMetadata, error) {
	// --- VALIDATE ---
	pe.progress.Emit(types.ProgressEvent{Stage: "validating", Percent: 0})

	info, err := os.Stat(filePath)
	if err != nil {
		return nil, fmt.Errorf("file not found: %w", err)
	}
	if passphrase == "" {
		return nil, fmt.Errorf("passphrase cannot be empty")
	}

	fileID := uuid.New().String()
	originalName := originalFilename
	if originalName == "" {
		originalName = filepath.Base(filePath)
	}
	originalSize := info.Size()

	// Compute original file hash
	originalData, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("read file: %w", err)
	}
	originalHash := sha256.Sum256(originalData)
	originalSHA := hex.EncodeToString(originalHash[:])
	originalData = nil // free memory

	// Setup temp directory
	tmpDir, err := config.TmpDir()
	if err != nil {
		return nil, err
	}
	opDir := filepath.Join(tmpDir, fileID)
	if err := os.MkdirAll(opDir, 0700); err != nil {
		return nil, fmt.Errorf("create temp dir: %w", err)
	}
	defer os.RemoveAll(opDir) // CLEANUP on any exit

	// --- COMPRESS ---
	pe.progress.Emit(types.ProgressEvent{Stage: "compressing", Percent: 10, TotalBytes: originalSize})

	compressedPath := filepath.Join(opDir, fileID+".zst")
	if err := compression.CompressFile(filePath, compressedPath); err != nil {
		return nil, fmt.Errorf("compress: %w", err)
	}

	compressedInfo, err := os.Stat(compressedPath)
	if err != nil {
		return nil, err
	}
	compressedSize := compressedInfo.Size()

	// If compression didn't help (file grew or stayed same), use the original file instead
	sourceForEncrypt := compressedPath
	if compressedSize >= originalSize {
		os.Remove(compressedPath)
		sourceForEncrypt = filePath
		compressedSize = originalSize
	}

	// --- ENCRYPT ---
	pe.progress.Emit(types.ProgressEvent{Stage: "encrypting", Percent: 30, BytesProcessed: compressedSize, TotalBytes: originalSize})

	encryptedPath := filepath.Join(opDir, fileID+".enc")
	salt, iv, err := crypto.EncryptFile(sourceForEncrypt, encryptedPath, passphrase)
	if err != nil {
		return nil, fmt.Errorf("encrypt: %w", err)
	}
	// passphrase no longer needed after this point

	encryptedInfo, err := os.Stat(encryptedPath)
	if err != nil {
		return nil, err
	}
	encryptedSize := encryptedInfo.Size()

	// Remove compressed temp file (no longer needed)
	if sourceForEncrypt == compressedPath {
		os.Remove(compressedPath)
	}

	// --- CHUNK ---
	pe.progress.Emit(types.ProgressEvent{Stage: "chunking", Percent: 50, BytesProcessed: encryptedSize, TotalBytes: originalSize})

	chunkDir := filepath.Join(opDir, "chunks")
	chunkPaths, err := chunks.SplitFile(encryptedPath, chunkDir)
	if err != nil {
		return nil, fmt.Errorf("chunk: %w", err)
	}

	// Remove encrypted temp file
	os.Remove(encryptedPath)

	// --- HASH ---
	pe.progress.Emit(types.ProgressEvent{Stage: "hashing", Percent: 60})

	type chunkInfo struct {
		path   string
		hash   string
		size   int64
	}
	var chunkInfos []chunkInfo

	for _, cp := range chunkPaths {
		hash, err := chunks.HashFile(cp)
		if err != nil {
			return nil, fmt.Errorf("hash chunk: %w", err)
		}
		ci, _ := os.Stat(cp)
		chunkInfos = append(chunkInfos, chunkInfo{path: cp, hash: hash, size: ci.Size()})
	}

	// --- UPLOAD ---
	pe.progress.Emit(types.ProgressEvent{Stage: "uploading", Percent: 70})

	repo, err := pe.pool.GetOrCreateRepo(ctx)
	if err != nil {
		return nil, fmt.Errorf("get repo: %w", err)
	}

	var chunkRefs []types.ChunkRef
	for i, ci := range chunkInfos {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		chunkID := uuid.New().String()
		remotePath, err := disguise.ChunkFilename()
		if err != nil {
			return nil, fmt.Errorf("generate chunk filename: %w", err)
		}

		data, err := os.ReadFile(ci.path)
		if err != nil {
			return nil, fmt.Errorf("read chunk %d: %w", i, err)
		}

		chunk := types.Chunk{
			Ref: types.ChunkRef{
				ChunkID:    chunkID,
				FileID:     fileID,
				Index:      i,
				Size:       ci.size,
				SHA256:     ci.hash,
				Account:    pe.account,
				RemotePath: remotePath,
			},
			Data: data,
		}

		ref, err := pe.adapter.Upload(ctx, repo.URL, chunk)
		if err != nil {
			return nil, fmt.Errorf("upload chunk %d: %w", i, err)
		}

		chunkRefs = append(chunkRefs, ref)

		percent := 70 + (25 * (i + 1) / len(chunkInfos))
		pe.progress.Emit(types.ProgressEvent{
			Stage:          "uploading",
			Percent:        percent,
			BytesProcessed: ci.size,
			TotalBytes:     encryptedSize,
		})
	}

	// Update repo usage
	if err := pe.pool.UpdateUsage(repo.ID, encryptedSize); err != nil {
		// Non-fatal, log but continue
		fmt.Fprintf(os.Stderr, "warn: update repo usage: %v\n", err)
	}

	// --- INDEX ---
	pe.progress.Emit(types.ProgressEvent{Stage: "indexing", Percent: 96})

	fileMeta := &types.FileMetadata{
		ID:             fileID,
		OriginalName:   originalName,
		OriginalSize:   originalSize,
		CompressedSize: compressedSize,
		EncryptedSize:  encryptedSize,
		ChunkCount:     len(chunkRefs),
		SHA256:         originalSHA,
		Salt:           salt,
		IV:             iv,
	}

	if err := pe.db.InsertFile(fileMeta); err != nil {
		return nil, fmt.Errorf("index file: %w", err)
	}

	for _, ref := range chunkRefs {
		if err := pe.db.InsertChunk(&ref); err != nil {
			return nil, fmt.Errorf("index chunk: %w", err)
		}
	}

	// --- DONE ---
	pe.progress.Emit(types.ProgressEvent{Stage: "done", Percent: 100})

	return fileMeta, nil
}

// Pull executes the full download pipeline:
// LOOKUP → FETCH → VERIFY → REASSEMBLE → DECRYPT → DECOMPRESS → WRITE → CLEANUP
func (pe *PipelineEngine) Pull(ctx context.Context, filename, passphrase, outputDir string) error {
	// --- LOOKUP ---
	pe.progress.Emit(types.ProgressEvent{Stage: "looking up", Percent: 0})

	fileMeta, err := pe.db.GetFile(filename)
	if err != nil {
		return fmt.Errorf("file not found in index: %w", err)
	}

	chunkRefs, err := pe.db.GetChunksForFile(fileMeta.ID)
	if err != nil {
		return fmt.Errorf("get chunks: %w", err)
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

	// --- FETCH ---
	pe.progress.Emit(types.ProgressEvent{Stage: "downloading", Percent: 10})

	var chunkPaths []string
	for i, ref := range chunkRefs {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		dlAdapter := pe.adapter
		if pe.adapterResolver != nil {
			dlAdapter = pe.adapterResolver(ref)
		}
		if dlAdapter == nil {
			return fmt.Errorf("no adapter for chunk %d (platform=%s, account=%s)", i, ref.Platform, ref.Account)
		}

		data, err := dlAdapter.Download(ctx, ref)
		if err != nil {
			return fmt.Errorf("download chunk %d: %w", i, err)
		}

		chunkPath := filepath.Join(opDir, fmt.Sprintf("chunk_%03d", ref.Index))
		if err := os.WriteFile(chunkPath, data, 0600); err != nil {
			return fmt.Errorf("write chunk %d: %w", i, err)
		}

		// --- VERIFY ---
		if err := chunks.VerifyChunk(chunkPath, ref.SHA256); err != nil {
			return fmt.Errorf("verify chunk %d: %w", i, err)
		}

		chunkPaths = append(chunkPaths, chunkPath)

		percent := 10 + (40 * (i + 1) / len(chunkRefs))
		pe.progress.Emit(types.ProgressEvent{
			Stage:          "downloading",
			Percent:        percent,
			BytesProcessed: ref.Size,
			TotalBytes:     fileMeta.EncryptedSize,
		})
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
		// Compression was skipped during upload, decrypt directly to output
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
