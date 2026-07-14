package cmd

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/zcrypt/zcrypt/pipeline"
	"github.com/zcrypt/zcrypt/types"
)

// byosPlatforms is the set of platforms that support byos-direct (client pushes
// to the user's own storage with the user's own token). All four in v1.
var byosPlatforms = map[string]bool{
	"telegram":    true,
	"github":      true,
	"gitlab":      true,
	"huggingface": true,
}

// HandleRegisterRepo records a repo the client created on the user's own
// platform for byos-direct uploads. The client generates the globally-unique
// id (mirroring the server pool's scheme) and reports it here so later confirms
// and locators reference a stable id. Idempotent.
// POST /api/repos/register
func (s *Server) HandleRegisterRepo(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req struct {
		ID       string `json:"id"`
		Platform string `json:"platform"`
		Account  string `json:"account"`
		Name     string `json:"name"`
		URL      string `json:"url"`
		MaxBytes int64  `json:"max_bytes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.ID == "" || req.Platform == "" {
		http.Error(w, `{"error":"id and platform are required"}`, http.StatusBadRequest)
		return
	}
	if !byosPlatforms[req.Platform] {
		http.Error(w, `{"error":"unsupported platform"}`, http.StatusBadRequest)
		return
	}

	// The user must actually own a personal (non-global) token for this platform
	// — otherwise a client could seed repos into the pool it has no credentials
	// to write to, and the managed pool token must never be usable this way.
	if _, ok, err := s.db.PersonalTokenAccount(ctx, userID, req.Platform); err != nil {
		log.Printf("repos/register: personal token lookup for user %s: %v", userID, err)
		http.Error(w, `{"error":"failed to register repo"}`, http.StatusInternalServerError)
		return
	} else if !ok {
		http.Error(w, `{"error":"no personal token for this platform"}`, http.StatusForbidden)
		return
	}

	repo := &types.RepoInfo{
		ID:       req.ID,
		Platform: req.Platform,
		Account:  req.Account,
		Name:     req.Name,
		URL:      req.URL,
		MaxBytes: req.MaxBytes,
		Active:   true,
	}
	if err := s.db.RegisterClientRepo(ctx, userID, repo); err != nil {
		log.Printf("repos/register: %v", err)
		http.Error(w, `{"error":"failed to register repo"}`, http.StatusInternalServerError)
		return
	}

	s.audit(r, &userID, "repo_register", map[string]interface{}{
		"repo_id":  req.ID,
		"platform": req.Platform,
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"repo_id": req.ID,
		"stored":  true,
	})
}

// HandleGetFileLocators returns the per-chunk platform locations for a file so a
// byos-direct client can download each chunk directly from the user's own
// storage. OWNER-ONLY: never exposed through a share or space membership — the
// query is scoped to files.user_id. Web/share downloads keep using the relay
// (/api/files/{id}/chunks/{idx}); this endpoint is the direct-download map.
// GET /api/files/{id}/locators
func (s *Server) HandleGetFileLocators(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	fileID := r.PathValue("id")
	if fileID == "" {
		http.Error(w, `{"error":"file id required"}`, http.StatusBadRequest)
		return
	}

	chunks, err := s.db.GetFileLocatorsForOwner(ctx, userID, fileID)
	if err != nil {
		log.Printf("locators: %v", err)
		http.Error(w, `{"error":"failed to get locators"}`, http.StatusInternalServerError)
		return
	}

	locators := make([]map[string]interface{}, 0, len(chunks))
	for _, c := range chunks {
		locators = append(locators, map[string]interface{}{
			"idx":         c.Index,
			"platform":    c.Platform,
			"account":     c.Account,
			"repo":        c.Repo,
			"remote_path": c.RemotePath,
			"size":        c.Size,
			"sha256":      c.SHA256,
			"compressed":  c.Compressed,
		})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"file_id":  fileID,
		"locators": locators,
	})
}

// HandleGetChanges returns the cross-device delta: every file of the caller's
// whose rev is greater than ?since=<cursor> (0 = full snapshot), plus the new
// cursor to pass next time. Paired with the live SSE "file" events, this is how
// a device that was offline catches up ("upload on Android, open on iOS").
// GET /api/changes?since=<rev>
func (s *Server) HandleGetChanges(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	since := int64(0)
	if raw := r.URL.Query().Get("since"); raw != "" {
		v, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || v < 0 {
			http.Error(w, `{"error":"since must be a non-negative integer"}`, http.StatusBadRequest)
			return
		}
		since = v
	}

	changes, cursor, err := s.db.GetChangesSince(ctx, userID, since, 1000)
	if err != nil {
		log.Printf("changes: %v", err)
		http.Error(w, `{"error":"failed to get changes"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"changes": changes,
		"cursor":  cursor,
	})
}

// emitFileChange stamps a file with the next per-user rev and pushes a live SSE
// "file" event {op, file_id, rev} to the user's other connected devices/tabs.
// Best-effort: a failure to bump/emit is logged, never fatal to the mutation
// that triggered it (the client still reconciles via GET /api/changes). op is
// one of: added | updated | deleted | moved | renamed.
func (s *Server) emitFileChange(ctx context.Context, userID, fileID, op string) {
	rev, err := s.db.BumpUserFileRev(ctx, userID, fileID)
	if err != nil {
		// A hard-deleted file has no row to stamp; that's not an error worth
		// surfacing, but a real DB failure is worth a log line.
		if !errors.Is(err, pgx.ErrNoRows) {
			log.Printf("file-change: bump rev for %s: %v", logSafe(fileID), err)
		}
		return
	}
	s.progress.EmitToUser(userID, pipeline.SSEEvent{
		Type: "file",
		Payload: map[string]interface{}{
			"op":      op,
			"file_id": fileID,
			"rev":     rev,
		},
	})
}

// emitFileChanges applies emitFileChange to a batch of files (bulk
// delete/restore/purge), so every affected file gets its own rev + SSE event.
func (s *Server) emitFileChanges(ctx context.Context, userID string, fileIDs []string, op string) {
	for _, id := range fileIDs {
		s.emitFileChange(ctx, userID, id, op)
	}
}
