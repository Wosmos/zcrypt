package cmd

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/zcrypt/zcrypt/adapters"
	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/disguise"
	"github.com/zcrypt/zcrypt/pipeline"
	"github.com/zcrypt/zcrypt/types"
)

// Max encrypted chunk size: 16MB data (ultra tier) + 12B IV + 16B tag + margin
const maxChunkSize = 17 * 1024 * 1024

// maxUploadBytes caps a single file at 10 GiB. Not a monetization limit —
// browser-side encrypt/chunk beyond that is unreliable (tab memory pressure,
// eviction mid-upload) and repos rotate long before one file that size pays
// off. A future desktop/MTProto path can lift this per-client.
const maxUploadBytes = int64(10) << 30

// chunkUploadSem limits concurrent chunk uploads being processed server-wide.
// Each chunk can use ~35MB (raw data + base64 for GitHub API), so 10 concurrent = ~350MB.
// Suitable for containers with 1-4GB RAM. For direct upload platforms (HuggingFace),
// the data never passes through the server so this only applies to relay uploads (GitHub).
var chunkUploadSem = make(chan struct{}, 10)

// repoUploadSems limits concurrent relay uploads per repository.
// GitHub's Contents API creates one commit per file — concurrent commits to the same repo
// cause 409 SHA conflicts. Limiting to 2 concurrent uploads per repo drastically reduces
// contention while keeping throughput reasonable.
var repoUploadSems sync.Map // map[string]chan struct{}

const perRepoMaxConcurrent = 2

func acquireRepoSlot(ctx context.Context, repoURL string) (release func(), err error) {
	val, _ := repoUploadSems.LoadOrStore(repoURL, make(chan struct{}, perRepoMaxConcurrent))
	sem := val.(chan struct{})
	select {
	case sem <- struct{}{}:
		return func() { <-sem }, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// HandleUploadInit creates a new chunked upload session.
// POST /api/upload/init
func (s *Server) HandleUploadInit(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req types.UploadInitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// A zero-knowledge client sends encrypted_name (opaque base64) and an empty
	// filename; a legacy client sends the plaintext filename. Require at least one.
	if (req.Filename == "" && req.EncryptedName == "") || req.OriginalSize <= 0 || req.SHA256 == "" || req.Salt == "" || req.ChunkCount <= 0 {
		http.Error(w, `{"error":"a name (filename or encrypted_name), original_size, sha256, salt, and chunk_count are required"}`, http.StatusBadRequest)
		return
	}
	if req.OriginalSize > maxUploadBytes {
		http.Error(w, `{"error":"file exceeds the 10 GB per-file limit"}`, http.StatusRequestEntityTooLarge)
		return
	}
	// chunk_size is optional (0 = legacy client that doesn't send it) but must
	// not be negative — it is persisted for cross-device resume.
	if req.ChunkSize < 0 {
		http.Error(w, `{"error":"chunk_size must be non-negative"}`, http.StatusBadRequest)
		return
	}

	// Path-safety validation applies ONLY to a legacy plaintext filename. It must
	// NOT run on encrypted_name: standard base64 contains '/' and '+' and is long,
	// so it would falsely reject every encrypted name.
	if req.Filename != "" && (strings.Contains(req.Filename, "..") || strings.Contains(req.Filename, "/") ||
		strings.Contains(req.Filename, "\\") || len(req.Filename) > 255) {
		http.Error(w, `{"error":"invalid filename"}`, http.StatusBadRequest)
		return
	}

	// Decode salt
	salt, err := base64.StdEncoding.DecodeString(req.Salt)
	if err != nil || len(salt) != 32 {
		http.Error(w, `{"error":"salt must be 32 bytes base64-encoded"}`, http.StatusBadRequest)
		return
	}

	// Server-authoritative resume: if an active, unexpired session for this
	// exact file (user + sha256 + size) already exists, hand it back instead of
	// creating a duplicate. This pins the resume to the ORIGINAL session and
	// platform with zero client-side state — a re-init from another device (or
	// after cleared localStorage) resumes instead of restarting from byte 0 and
	// orphaning the old session's staged chunks. The request's fresh salt and
	// wrapped_cek are deliberately discarded; the client fetches the stored
	// envelope via the file meta endpoint. A client that can't use the resumed
	// session (e.g. wrong passphrase for the stored envelope) cancels it via
	// DELETE /api/upload/{sid} and re-inits fresh.
	if existing, ferr := s.db.FindActiveUploadSession(ctx, userID, req.SHA256, req.OriginalSize); ferr == nil {
		// A byos-direct session resumes as byos-direct regardless of adapter type
		// (the client pushes with its own token); relay sessions keep the
		// adapter-capability answer (HuggingFace presign vs GitHub/Telegram relay).
		directUpload := existing.Mode == "byos-direct"
		if !directUpload {
			adapter := s.resolveAdapterForUser(ctx, userID, existing.Platform, existing.Account)
			_, directUpload = adapter.(adapters.DirectUploader)
		}

		// Deliberately no filename: for a zero-knowledge upload it is empty, and
		// logging a legacy plaintext name would persist it in audit_events.
		s.audit(r, &userID, "upload_resume", map[string]interface{}{
			"file_id":    existing.FileID,
			"session_id": existing.ID,
			"size":       existing.OriginalSize,
			"chunks":     existing.ChunkCount,
		})

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"session_id":    existing.ID,
			"file_id":       existing.FileID,
			"repo_url":      existing.RepoURL,
			"platform":      existing.Platform,
			"chunk_size":    existing.ChunkSize,
			"chunk_count":   existing.ChunkCount,
			"direct_upload": directUpload,
			"mode":          existing.Mode,
			"resumed":       true,
		})
		return
	} else if !errors.Is(ferr, pgx.ErrNoRows) {
		// A real lookup failure must not block uploads — log and init fresh.
		log.Printf("upload: find resumable session for user %s: %v", userID, ferr)
	}

	// Data-plane selection. Two modes:
	//   relay        — bytes transit the server, which stages + pushes to the
	//                  platform (managed pool or the user's token). Legacy default.
	//   byos-direct  — the client pushes chunks to the user's OWN platform with the
	//                  user's OWN token and only confirms metadata. No server repo
	//                  is created here (the client registers + places its own via
	//                  POST /api/repos/register); the managed pool is never used.
	mode := req.Mode
	if mode == "" {
		mode = "relay"
	}

	var platform, account, repoID, repoURL string
	var directUpload bool

	if mode == "byos-direct" {
		if req.Platform == "" || !byosPlatforms[req.Platform] {
			http.Error(w, `{"error":"byos-direct requires a supported platform (telegram, github, gitlab, huggingface)"}`, http.StatusBadRequest)
			return
		}
		// Require a PERSONAL (non-global) token: byos-direct means the client
		// uploads with its own credentials, so it must have connected its own
		// account. The shared managed-pool token is never eligible.
		acct, ok, perr := s.db.PersonalTokenAccount(ctx, userID, req.Platform)
		if perr != nil {
			log.Printf("upload: personal token lookup for user %s: %v", userID, perr)
			http.Error(w, `{"error":"failed to start upload"}`, http.StatusInternalServerError)
			return
		}
		if !ok {
			http.Error(w, `{"error":"connect your own account for this platform to upload directly"}`, http.StatusForbidden)
			return
		}
		platform = req.Platform
		account = acct
		directUpload = true
		// repoID/repoURL stay empty — the client owns placement in this mode.
	} else {
		// zcrypt is free and open source: there are no artificial plan/quota
		// limits. Users are bounded only by the real git-platform thresholds
		// enforced in reppool. Select the adapter + repo pool to use.
		key, _, pool, err := s.selectAdapter(ctx, userID, req.Platform)
		if err != nil {
			hasPersonal, _ := s.db.UserHasPersonalTokens(ctx, userID)
			if hasPersonal {
				log.Printf("upload: platform not available for user %s: %v", userID, err)
				http.Error(w, `{"error":"storage platform not available"}`, http.StatusBadRequest)
			} else {
				http.Error(w, `{"error":"storage not available yet — managed storage is being configured"}`, http.StatusServiceUnavailable)
			}
			return
		}

		repo, err := pool.GetOrCreateRepo(ctx)
		if err != nil {
			log.Printf("upload: get repo failed: %v", err)
			http.Error(w, `{"error":"storage not available"}`, http.StatusInternalServerError)
			return
		}

		// Extract platform and account from key
		parts := strings.SplitN(key, ":", 2)
		platform = parts[0]
		if len(parts) > 1 {
			account = parts[1]
		}
		repoID = repo.ID
		repoURL = repo.URL
	}

	// Create file record. An optional folder_id lets the file be born directly in
	// its target folder (atomic), avoiding a best-effort post-upload move that, on
	// failure, would strand a folder-keyed file at Root. Omitted/null => NULL (Root),
	// exactly as before. Ownership of the folder is validated inside InsertFile; an
	// unknown/foreign folder_id is treated as NULL (Root) rather than failing the
	// upload, so a stale client folder reference can never block an upload.
	fileID := uuid.New().String()
	fileMeta := &types.FileMetadata{
		ID:            fileID,
		UserID:        userID,
		OriginalName:  req.Filename,      // '' for zero-knowledge uploads (name lives in EncryptedName)
		EncryptedName: req.EncryptedName, // opaque base64; server never decrypts it
		OriginalSize:  req.OriginalSize,
		ChunkCount:    req.ChunkCount,
		SHA256:        req.SHA256,
		SHA256Scheme:  req.SHA256Scheme, // '' → stored as 'plain' (legacy); 'hmac_v1' from upgraded clients
		Salt:          salt,
		IV:            []byte{}, // not used for client-side encryption
		WrappedCEK:    req.WrappedCEK,
		Status:        "uploading",
		FolderID:      req.FolderID,
	}

	if err := s.db.InsertFile(ctx, userID, fileMeta); err != nil {
		log.Printf("upload: create file record failed for user %s: %v", userID, err)
		http.Error(w, `{"error":"create file record failed"}`, http.StatusInternalServerError)
		return
	}

	// Create upload session
	session := &types.UploadSession{
		UserID:        userID,
		FileID:        fileID,
		Filename:      req.Filename,
		EncryptedName: req.EncryptedName,
		OriginalSize:  req.OriginalSize,
		Salt:          salt,
		SHA256:        req.SHA256,
		SHA256Scheme:  req.SHA256Scheme,
		ChunkCount:    req.ChunkCount,
		ChunkSize:     req.ChunkSize,
		Platform:      platform,
		Account:       account,
		RepoID:        repoID,
		RepoURL:       repoURL,
		Mode:          mode,
	}

	sessionID, err := s.db.CreateUploadSession(ctx, session)
	if err != nil {
		log.Printf("upload: create session failed: %v", err)
		http.Error(w, `{"error":"failed to start upload"}`, http.StatusInternalServerError)
		return
	}

	// Relay path: does the adapter support presigned direct upload (HuggingFace)?
	// byos-direct already set directUpload = true above (the client pushes with
	// its own token, independent of adapter type).
	if mode != "byos-direct" {
		adapter := s.resolveAdapterForUser(ctx, userID, platform, account)
		_, directUpload = adapter.(adapters.DirectUploader)
	}

	// No filename in the audit trail — a zero-knowledge upload has none, and a
	// legacy plaintext name must not be persisted in audit_events.
	s.audit(r, &userID, "upload_init", map[string]interface{}{
		"file_id":    fileID,
		"session_id": sessionID,
		"size":       req.OriginalSize,
		"chunks":     req.ChunkCount,
		"mode":       mode,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"session_id":    sessionID,
		"file_id":       fileID,
		"repo_url":      repoURL,
		"platform":      platform,
		"mode":          mode,
		"chunk_size":    req.ChunkSize,
		"chunk_count":   req.ChunkCount,
		"direct_upload": directUpload,
		"resumed":       false,
	})
}

// HandleChunkUpload receives a single pre-encrypted chunk, stages it to disk, and returns immediately.
// The actual upload to the git platform happens asynchronously via the background sync worker.
// PUT /api/upload/{sid}/chunk/{idx}
func (s *Server) HandleChunkUpload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	sessionID := r.PathValue("sid")
	chunkIndexStr := r.PathValue("idx")
	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		http.Error(w, `{"error":"invalid chunk index"}`, http.StatusBadRequest)
		return
	}

	expectedHash := r.Header.Get("X-Chunk-SHA256")
	if expectedHash == "" {
		http.Error(w, `{"error":"X-Chunk-SHA256 header required"}`, http.StatusBadRequest)
		return
	}

	compressed := r.Header.Get("X-Chunk-Compressed") == "true"

	// Acquire semaphore slot — limits server-wide concurrent chunk processing to prevent OOM
	select {
	case chunkUploadSem <- struct{}{}:
		defer func() { <-chunkUploadSem }()
	case <-ctx.Done():
		http.Error(w, `{"error":"request cancelled"}`, http.StatusServiceUnavailable)
		return
	}

	// Validate session
	session, err := s.db.GetUploadSession(ctx, sessionID, userID)
	if err != nil {
		http.Error(w, `{"error":"upload session not found"}`, http.StatusNotFound)
		return
	}
	if session.Status != "active" {
		http.Error(w, `{"error":"upload session is not active"}`, http.StatusBadRequest)
		return
	}
	if chunkIndex < 0 || chunkIndex >= session.ChunkCount {
		http.Error(w, `{"error":"chunk index out of range"}`, http.StatusBadRequest)
		return
	}

	// Idempotency: check if chunk already received — BEFORE reading the body,
	// so a duplicate 4-17MB chunk is rejected without receiving it. The response
	// is written with the body unread; the HTTP server handles draining.
	existing, _ := s.db.GetChunkByID(ctx, session.FileID+"-"+strconv.Itoa(chunkIndex))
	if existing != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"chunk_index": chunkIndex,
			"stored":      true,
			"duplicate":   true,
		})
		return
	}
	// Also check by file_id + index (the original idempotency check)
	existingByIdx, _ := s.db.GetChunkByIndex(ctx, session.FileID, chunkIndex)
	if existingByIdx != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"chunk_index": chunkIndex,
			"stored":      true,
			"duplicate":   true,
		})
		return
	}

	// Read chunk body
	data, err := io.ReadAll(io.LimitReader(r.Body, int64(maxChunkSize)))
	if err != nil {
		http.Error(w, `{"error":"failed to read chunk data"}`, http.StatusBadRequest)
		return
	}

	if len(data) < 28 { // minimum: 12B IV + 16B tag
		http.Error(w, `{"error":"chunk too small"}`, http.StatusBadRequest)
		return
	}

	// Verify SHA-256
	hash := sha256.Sum256(data)
	actualHash := hex.EncodeToString(hash[:])
	if actualHash != expectedHash {
		http.Error(w, `{"error":"chunk hash mismatch"}`, http.StatusBadRequest)
		return
	}

	// Write chunk data to staging dir (survives server restarts)
	chunkID := uuid.New().String()
	stagingDir, err := config.StagingDir()
	if err != nil {
		log.Printf("upload: staging dir failed: %v", err)
		http.Error(w, `{"error":"upload failed"}`, http.StatusInternalServerError)
		return
	}
	stagingPath := filepath.Join(stagingDir, chunkID+".enc")
	if err := os.WriteFile(stagingPath, data, 0600); err != nil {
		log.Printf("upload: write staging file failed: %v", err)
		http.Error(w, `{"error":"upload failed"}`, http.StatusInternalServerError)
		return
	}

	// Insert chunk reference with empty remote_path (pending sync)
	dbChunk := &types.ChunkRef{
		ChunkID:    chunkID,
		FileID:     session.FileID,
		Index:      chunkIndex,
		Size:       int64(len(data)),
		SHA256:     actualHash,
		Platform:   session.Platform,
		Account:    session.Account,
		Repo:       session.RepoURL,
		RemotePath: "", // pending — will be set by background sync worker
		Compressed: compressed,
	}

	inserted, err := s.db.InsertClientChunk(ctx, userID, dbChunk)
	if err != nil {
		os.Remove(stagingPath) // clean up staging file
		log.Printf("upload: store chunk ref failed: %v", err)
		http.Error(w, `{"error":"failed to store chunk"}`, http.StatusInternalServerError)
		return
	}

	// Wake sync worker immediately — non-blocking, channel is buffered(1)
	select {
	case s.syncCh <- struct{}{}:
	default:
	}

	// Only a NEW chunk row advances the counter. A duplicate re-PUT of the same
	// index (racy client / retry) hits ON CONFLICT DO NOTHING and must NOT
	// double-count — double-counting produced >100% progress and false
	// "not all chunks" completion failures.
	uploadedCount := session.UploadedChunks
	if inserted {
		if c, incErr := s.db.IncrementSessionChunks(ctx, sessionID); incErr != nil {
			fmt.Printf("warn: increment session chunks: %v\n", incErr)
			uploadedCount = session.UploadedChunks + 1
		} else {
			uploadedCount = c
		}
	}

	// Emit progress
	percent := int(float64(uploadedCount) / float64(session.ChunkCount) * 100)
	s.progress.Emit(types.ProgressEvent{
		FileID:         session.FileID,
		UserID:         userID,
		Stage:          fmt.Sprintf("uploading chunk %d/%d", chunkIndex+1, session.ChunkCount),
		Percent:        percent,
		BytesProcessed: int64(len(data)),
		TotalBytes:     session.OriginalSize,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"chunk_index": chunkIndex,
		"stored":      true,
	})
}

// HandleUploadComplete finalizes a chunked upload.
// POST /api/upload/{sid}/complete
func (s *Server) HandleUploadComplete(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	sessionID := r.PathValue("sid")

	var req types.UploadCompleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Validate session
	session, err := s.db.GetUploadSession(ctx, sessionID, userID)
	if err != nil {
		http.Error(w, `{"error":"upload session not found"}`, http.StatusNotFound)
		return
	}
	if session.Status != "active" {
		http.Error(w, `{"error":"upload session is not active"}`, http.StatusBadRequest)
		return
	}

	// Verify all chunks received (includes pending-sync chunks)
	uploadedIndices, err := s.db.GetReceivedChunkIndices(ctx, session.FileID)
	if err != nil {
		log.Printf("upload: check chunks failed: %v", err)
		http.Error(w, `{"error":"failed to verify chunks"}`, http.StatusInternalServerError)
		return
	}
	if len(uploadedIndices) != session.ChunkCount {
		http.Error(w, `{"error":"not all chunks have been uploaded"}`, http.StatusBadRequest)
		return
	}

	// Mark file as complete and return immediately.
	// Size verification, FlushCommits, and bookkeeping run in the background.
	if err := s.db.UpdateFileStatus(ctx, session.FileID, "complete"); err != nil {
		log.Printf("upload: update file status failed: %v", err)
		http.Error(w, `{"error":"failed to complete upload"}`, http.StatusInternalServerError)
		return
	}
	if err := s.db.CompleteUploadSession(ctx, sessionID); err != nil {
		fmt.Printf("warn: complete session: %v\n", err)
	}

	// Emit completion event
	s.progress.Emit(types.ProgressEvent{
		FileID:  session.FileID,
		UserID:  userID,
		Stage:   "done",
		Percent: 100,
	})

	// Cross-device sync: stamp the new file's rev and push a "file" event so the
	// user's other devices/tabs learn about it live (and can pull it via
	// /api/changes if they were offline). "upload on Android, see on iOS."
	s.emitFileChange(ctx, userID, session.FileID, "added")

	// Audit synchronously, before returning — s.audit reads the request (IP,
	// User-Agent) and must not be called from the background goroutine after the
	// handler returns and the request context is cancelled.
	s.audit(r, &userID, "upload_complete", map[string]interface{}{
		"file_id":    session.FileID,
		"session_id": sessionID,
		"chunks":     session.ChunkCount,
	})

	// Return success to client immediately
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"file_id": session.FileID,
	})

	// Background: commit+verify, size verification, repo usage. Capture the
	// values needed off the request now — the goroutine outlives the request, so
	// it must not touch r.
	bgUserID := userID
	bgSession := session
	compressedSize := req.CompressedSize
	encryptedSize := req.EncryptedSize
	go func() {
		bgCtx := context.Background()

		// Commit + VERIFY this file's uploaded-but-uncommitted chunks (HuggingFace
		// LFS). DB-driven — NOT the old in-memory pendingCommits buffer that a
		// per-user adapter-cache eviction between confirm and here would silently
		// discard (the ~50% silent-loss bug). commitAndVerify flips committed=TRUE
		// only after confirming each object is actually present on the platform;
		// anything still uncommitted is left for the sync worker's reconcile to
		// retry. Either way a chunk is never trusted durable on an object we
		// haven't seen land.
		if uncommitted, err := s.db.GetUncommittedChunksForFile(bgCtx, bgSession.FileID); err != nil {
			log.Printf("upload: WARNING loading uncommitted chunks for file %s failed: %v — reconcile will retry", logSafe(bgSession.FileID), err) // #nosec G706 -- control chars stripped via logSafe
			select {
			case s.syncCh <- struct{}{}:
			default:
			}
		} else if len(uncommitted) > 0 {
			s.commitAndVerify(bgCtx, uncommitted)
			// Nudge the reconcile in case any chunk still failed to commit/verify.
			select {
			case s.syncCh <- struct{}{}:
			default:
			}
		}

		// Verify and update sizes. The client-reported sizes are written first;
		// the server-computed chunk total then overwrites encrypted_size so the
		// verified value wins (writing them in the other order let the client
		// value clobber the verified one).
		s.db.UpdateFileSizes(bgCtx, bgSession.FileID, compressedSize, encryptedSize)
		actualEncrypted, err := s.db.GetTotalReceivedChunkSize(bgCtx, bgSession.FileID)
		if err == nil {
			s.db.UpdateFileOriginalSizeVerified(bgCtx, bgSession.FileID, actualEncrypted)
		}

		// Update repo usage with the SERVER-computed total, not the client-reported
		// req.EncryptedSize — a client reporting 0 (or lying) must not keep the
		// repo pool from rotating at the real platform thresholds.
		usageBytes := encryptedSize
		if err == nil {
			usageBytes = actualEncrypted
		} else {
			log.Printf("upload: WARNING falling back to client-reported encrypted size for repo usage (file %s): %v", bgSession.FileID, err)
		}
		pools, _ := s.getUserPools(bgCtx, bgUserID)
		key := bgSession.Platform + ":" + bgSession.Account
		if pool, ok := pools[key]; ok {
			pool.UpdateUsage(bgSession.RepoID, usageBytes)
		}
	}()
}

// HandleListIncompleteUploads returns the caller's active (not-yet-complete,
// unexpired) upload sessions so the UI can show unfinished uploads — filename,
// platform, progress and expiry — and offer Resume / Discard.
// GET /api/upload/incomplete
func (s *Server) HandleListIncompleteUploads(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	sessions, err := s.db.ListActiveUploadSessions(ctx, userID)
	if err != nil {
		log.Printf("upload: list incomplete: %v", err)
		http.Error(w, `{"error":"failed to list incomplete uploads"}`, http.StatusInternalServerError)
		return
	}

	out := make([]map[string]interface{}, 0, len(sessions))
	for _, sess := range sessions {
		out = append(out, map[string]interface{}{
			"session_id":      sess.ID,
			"file_id":         sess.FileID,
			"filename":        sess.Filename,      // '' for zk sessions; client dual-reads encrypted_name
			"encrypted_name":  sess.EncryptedName, // client decrypts for the "unfinished uploads" UI
			"original_size":   sess.OriginalSize,
			"platform":        sess.Platform,
			"account":         sess.Account,
			"chunk_count":     sess.ChunkCount,
			"chunk_size":      sess.ChunkSize,
			"uploaded_chunks": sess.UploadedChunks,
			"created_at":      sess.CreatedAt,
			"expires_at":      sess.ExpiresAt,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"uploads": out,
	})
}

// HandleUploadCancel cancels an active upload session.
// DELETE /api/upload/{sid}
func (s *Server) HandleUploadCancel(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	sessionID := r.PathValue("sid")

	session, err := s.db.GetUploadSession(ctx, sessionID, userID)
	if err != nil {
		http.Error(w, `{"error":"upload session not found"}`, http.StatusNotFound)
		return
	}
	if session.Status != "active" {
		http.Error(w, `{"error":"upload session is not active"}`, http.StatusBadRequest)
		return
	}

	// Cancel session
	if err := s.db.CancelUploadSession(ctx, sessionID); err != nil {
		log.Printf("upload: cancel session failed: %v", err)
		http.Error(w, `{"error":"failed to cancel upload"}`, http.StatusInternalServerError)
		return
	}

	// Delete file and queue synced chunks for remote deletion; staged-but-unsynced
	// chunks never reached a platform, so their .enc files are removed locally.
	if staged, err := s.db.DeleteFile(ctx, userID, session.FileID); err != nil {
		fmt.Printf("warn: delete file on cancel: %v\n", err)
	} else {
		removeStagedChunkFiles(staged)
		s.signalDeletion()
	}

	// Emit error event so frontend knows
	cancelEvent := pipeline.ErrorEvent(session.FileID, "upload cancelled")
	cancelEvent.UserID = userID
	s.progress.Emit(cancelEvent)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

// HandleUploadStatus returns the status of an upload session including which chunks are uploaded.
// GET /api/upload/{sid}/status
func (s *Server) HandleUploadStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	sessionID := r.PathValue("sid")

	session, err := s.db.GetUploadSession(ctx, sessionID, userID)
	if err != nil {
		http.Error(w, `{"error":"upload session not found"}`, http.StatusNotFound)
		return
	}

	// Count all RECEIVED chunks (including staged-but-unsynced ones, matching
	// HandleUploadComplete) so resume doesn't re-send chunks that are already
	// staged and merely waiting on the background sync worker.
	uploadedIndices, err := s.db.GetReceivedChunkIndices(ctx, session.FileID)
	if err != nil {
		log.Printf("upload: get chunk status failed: %v", err)
		http.Error(w, `{"error":"failed to get upload status"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"session_id":      session.ID,
		"file_id":         session.FileID,
		"status":          session.Status,
		"platform":        session.Platform,
		"chunk_count":     session.ChunkCount,
		"chunk_size":      session.ChunkSize,
		"uploaded_chunks": uploadedIndices,
		"completed_count": len(uploadedIndices),
	})
}

// HandlePresignChunk returns a presigned URL for direct client upload to the platform.
// This bypasses the server relay — data goes directly from client to platform storage.
// POST /api/upload/{sid}/presign/{idx}
func (s *Server) HandlePresignChunk(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	sessionID := r.PathValue("sid")
	chunkIndexStr := r.PathValue("idx")
	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		http.Error(w, `{"error":"invalid chunk index"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		SHA256 string `json:"sha256"`
		Size   int64  `json:"size"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.SHA256 == "" || req.Size <= 0 {
		http.Error(w, `{"error":"sha256 and size are required"}`, http.StatusBadRequest)
		return
	}

	// Validate session
	session, err := s.db.GetUploadSession(ctx, sessionID, userID)
	if err != nil {
		http.Error(w, `{"error":"upload session not found"}`, http.StatusNotFound)
		return
	}
	if session.Status != "active" {
		http.Error(w, `{"error":"upload session is not active"}`, http.StatusBadRequest)
		return
	}
	if chunkIndex < 0 || chunkIndex >= session.ChunkCount {
		http.Error(w, `{"error":"chunk index out of range"}`, http.StatusBadRequest)
		return
	}

	// Resolve adapter and check DirectUploader support
	adapter := s.resolveAdapterForUser(ctx, userID, session.Platform, session.Account)
	if adapter == nil {
		http.Error(w, `{"error":"platform adapter not available"}`, http.StatusInternalServerError)
		return
	}
	du, ok := adapter.(adapters.DirectUploader)
	if !ok {
		http.Error(w, `{"error":"platform does not support direct upload"}`, http.StatusBadRequest)
		return
	}

	// Generate disguised remote path. Git platforms get a 2-hex-char shard
	// directory so no folder ever approaches HuggingFace's hard 10k-entries-
	// per-folder limit; Telegram keeps the flat name (a chat has no folders).
	var remotePath string
	if session.Platform == "telegram" {
		remotePath, err = disguise.ChunkFilename()
	} else {
		remotePath, err = disguise.ShardedChunkFilename()
	}
	if err != nil {
		log.Printf("upload: generate filename failed: %v", err)
		http.Error(w, `{"error":"upload failed"}`, http.StatusInternalServerError)
		return
	}

	// Get presigned URL from platform
	uploadURL, uploadHeaders, err := du.GetUploadURL(ctx, session.RepoURL, req.SHA256, req.Size)
	if err != nil && isRepoNotFound(err) {
		// The platform removed this repo out from under the session (e.g.
		// HuggingFace deleting a repo for policy reasons). Self-heal instead of
		// failing every remaining chunk until someone intervenes manually:
		// deactivate the dead repo so the pool stops routing to it, rotate the
		// session to a fresh (or existing active) repo, and retry the presign
		// once against the new target.
		log.Printf("upload: repo %s gone on %s — rotating session %s: %v", // #nosec G706 -- control chars stripped via logSafe
			logSafe(session.RepoURL), logSafe(session.Platform), logSafe(session.ID), err)
		if healErr := s.healDeadRepo(ctx, session); healErr != nil {
			log.Printf("upload: repo self-heal failed: %v", healErr)
		} else {
			uploadURL, uploadHeaders, err = du.GetUploadURL(ctx, session.RepoURL, req.SHA256, req.Size)
		}
	}
	if err != nil {
		log.Printf("upload: get upload url failed: %v", err)
		http.Error(w, `{"error":"failed to get upload URL"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"upload_url":     uploadURL,
		"upload_headers": uploadHeaders,
		"remote_path":    remotePath,
		"already_exists": uploadURL == "",
	})
}

// logSafe strips CR/LF (and other control characters) from a value before it is
// interpolated into a log line, so a crafted id/url can't forge extra log
// entries (gosec G706 log-injection).
func logSafe(s string) string {
	return strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, s)
}

// isRepoNotFound reports whether an adapter error means the repo itself is GONE
// on the platform (deleted, renamed, or removed for policy reasons) — as opposed
// to a transient failure worth retrying against the same repo. HuggingFace's LFS
// batch endpoint surfaces this as a 404 with "Repository not found" in the body.
func isRepoNotFound(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "repository not found") ||
		(strings.Contains(msg, "404") && strings.Contains(msg, "not found"))
}

// healDeadRepo recovers an upload session whose repo the platform has removed:
// deactivate the dead repo so the pool never routes to it again, rotate to a
// fresh (or existing active) repo from the same platform:account pool, and
// persist the session's new target so every remaining chunk — and any future
// resume — goes straight there. Mutates session.RepoID/RepoURL on success.
func (s *Server) healDeadRepo(ctx context.Context, session *types.UploadSession) error {
	if session.RepoID != "" {
		if err := s.db.DeactivateRepo(ctx, session.RepoID); err != nil {
			return fmt.Errorf("deactivate dead repo: %w", err)
		}
	}
	pools, err := s.getUserPools(ctx, session.UserID)
	if err != nil {
		return fmt.Errorf("load repo pools: %w", err)
	}
	pool, ok := pools[session.Platform+":"+session.Account]
	if !ok {
		return fmt.Errorf("no repo pool for %s:%s", session.Platform, session.Account)
	}
	// GetOrCreateRepo reads the DB fresh, so it skips the repo just deactivated
	// and returns the next active repo (creating one if the pool is empty).
	repo, err := pool.GetOrCreateRepo(ctx)
	if err != nil {
		return fmt.Errorf("rotate to new repo: %w", err)
	}
	if err := s.db.UpdateUploadSessionRepo(ctx, session.ID, repo.ID, repo.URL); err != nil {
		return fmt.Errorf("repoint session: %w", err)
	}
	session.RepoID = repo.ID
	session.RepoURL = repo.URL
	return nil
}

// HandleConfirmChunk confirms a directly-uploaded chunk and stores its reference.
// Called after the client has uploaded data directly to the platform via presigned URL.
// POST /api/upload/{sid}/confirm/{idx}
func (s *Server) HandleConfirmChunk(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	sessionID := r.PathValue("sid")
	chunkIndexStr := r.PathValue("idx")
	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		http.Error(w, `{"error":"invalid chunk index"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		SHA256     string `json:"sha256"`
		Size       int64  `json:"size"`
		RemotePath string `json:"remote_path"`
		Compressed bool   `json:"compressed"`
		// byos-direct extras: the client uploaded to its OWN platform with its OWN
		// token and (for git/Telegram) already committed, so it reports where the
		// chunk lives. Absent on the relay/presign path.
		Platform  string `json:"platform"`
		Account   string `json:"account"`
		RepoID    string `json:"repo_id"`
		Committed bool   `json:"committed"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.SHA256 == "" || req.Size <= 0 || req.RemotePath == "" {
		http.Error(w, `{"error":"sha256, size, and remote_path are required"}`, http.StatusBadRequest)
		return
	}

	// Validate session
	session, err := s.db.GetUploadSession(ctx, sessionID, userID)
	if err != nil {
		http.Error(w, `{"error":"upload session not found"}`, http.StatusNotFound)
		return
	}
	if session.Status != "active" {
		http.Error(w, `{"error":"upload session is not active"}`, http.StatusBadRequest)
		return
	}
	if chunkIndex < 0 || chunkIndex >= session.ChunkCount {
		http.Error(w, `{"error":"chunk index out of range"}`, http.StatusBadRequest)
		return
	}

	// Idempotency: check if chunk already stored
	existing, _ := s.db.GetChunkByIndex(ctx, session.FileID, chunkIndex)
	if existing != nil && existing.RemotePath != "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"chunk_index": chunkIndex,
			"stored":      true,
			"duplicate":   true,
		})
		return
	}

	chunkID := uuid.New().String()
	var inserted bool

	if session.Mode == "byos-direct" {
		// byos-direct: the client pushed the ciphertext to its OWN platform with
		// its OWN token and (git/Telegram atomic, HF LFS+commit) already committed
		// it. Record committed = TRUE immediately — there is no server-side commit
		// pass. Trust the client's location fields but pin the repo to one the
		// caller actually OWNS (never store an unvalidated client repo_id).
		repoURL := session.RepoURL
		if req.RepoID != "" {
			repo, rerr := s.db.GetRepoByID(ctx, userID, req.RepoID)
			if rerr != nil {
				http.Error(w, `{"error":"unknown or unowned repo_id"}`, http.StatusBadRequest)
				return
			}
			repoURL = repo.URL
		}
		platform := req.Platform
		if platform == "" {
			platform = session.Platform
		}
		account := req.Account
		if account == "" {
			account = session.Account
		}
		dbChunk := &types.ChunkRef{
			ChunkID:    chunkID,
			FileID:     session.FileID,
			Index:      chunkIndex,
			Size:       req.Size,
			SHA256:     req.SHA256,
			Platform:   platform,
			Account:    account,
			Repo:       repoURL,
			RemotePath: req.RemotePath,
			Compressed: req.Compressed,
		}
		inserted, err = s.db.InsertDirectChunk(ctx, userID, dbChunk)
		if err != nil {
			log.Printf("upload: store direct chunk ref failed: %v", err)
			http.Error(w, `{"error":"failed to store chunk"}`, http.StatusInternalServerError)
			return
		}
		// Credit the user's own repo usage from the confirmed size (the server
		// never saw the bytes). Best-effort — never fail the confirm on this.
		if inserted && req.RepoID != "" {
			if uerr := s.db.BumpRepoUsage(ctx, req.RepoID, req.Size); uerr != nil {
				log.Printf("upload: bump repo usage: %v", uerr)
			}
		}
	} else {
		// Presign/relay path (HuggingFace): store committed = FALSE. The LFS blob
		// is uploaded but has no tree pointer yet; durability is established later
		// by commit+verify (on upload-complete and by the reconcile worker),
		// driven entirely from this DB row — no fragile in-memory commit buffer.
		dbChunk := &types.ChunkRef{
			ChunkID:    chunkID,
			FileID:     session.FileID,
			Index:      chunkIndex,
			Size:       req.Size,
			SHA256:     req.SHA256,
			Platform:   session.Platform,
			Account:    session.Account,
			Repo:       session.RepoURL,
			RemotePath: req.RemotePath,
			Compressed: req.Compressed,
		}
		inserted, err = s.db.InsertClientChunk(ctx, userID, dbChunk)
		if err != nil {
			log.Printf("upload: store chunk ref failed: %v", err)
			http.Error(w, `{"error":"failed to store chunk"}`, http.StatusInternalServerError)
			return
		}
	}

	// Increment session counter only for a NEW chunk; a duplicate re-PUT of the
	// same index hits ON CONFLICT DO NOTHING and must not double-count
	// (see HandleChunkUpload).
	uploadedCount := session.UploadedChunks
	if inserted {
		if c, incErr := s.db.IncrementSessionChunks(ctx, sessionID); incErr != nil {
			fmt.Printf("warn: increment session chunks: %v\n", incErr)
			uploadedCount = session.UploadedChunks + 1
		} else {
			uploadedCount = c
		}
	}

	// Emit progress
	percent := int(float64(uploadedCount) / float64(session.ChunkCount) * 100)
	s.progress.Emit(types.ProgressEvent{
		FileID:         session.FileID,
		UserID:         userID,
		Stage:          fmt.Sprintf("uploading chunk %d/%d", chunkIndex+1, session.ChunkCount),
		Percent:        percent,
		BytesProcessed: req.Size,
		TotalBytes:     session.OriginalSize,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"chunk_index": chunkIndex,
		"stored":      true,
	})
}
