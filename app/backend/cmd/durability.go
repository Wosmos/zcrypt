package cmd

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/zcrypt/zcrypt/index"
	"github.com/zcrypt/zcrypt/types"
)

// HandleRetryFileSync gives a degraded file's not-yet-durable chunks a fresh
// retry budget and wakes the sync worker.
// POST /api/files/{id}/retry-sync
func (s *Server) HandleRetryFileSync(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	fileID := r.PathValue("id")

	if _, err := s.db.GetFileByID(ctx, userID, fileID); err != nil {
		http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
		return
	}
	n, err := s.db.RequeueFileSync(ctx, userID, fileID)
	if err != nil {
		log.Printf("files: retry sync: %v", err)
		http.Error(w, `{"error":"failed to retry sync"}`, http.StatusInternalServerError)
		return
	}
	select {
	case s.syncCh <- struct{}{}:
	default:
	}
	s.emitFileChange(ctx, userID, fileID, "updated")
	writeJSON(w, http.StatusOK, map[string]interface{}{"requeued": n})
}

// RepoChunkDiff is the result of checking one repo's DB chunks against what the
// platform lists. Missing holds the chunks the DB says are durable but the
// platform does not have.
type RepoChunkDiff struct {
	Expected []index.RepoChunk
	Missing  []index.RepoChunk
	Note     string
}

// diffRepoChunks lists one repo and reports which of the user's committed chunks
// in it are absent. A listing that comes back empty while the DB expects chunks
// is not trusted (a revoked token on a private GitHub repo reads the same as an
// empty repo), so it reports nothing missing and says why.
func (s *Server) diffRepoChunks(ctx context.Context, userID string, repo types.RepoInfo, remote []types.ChunkRef) (RepoChunkDiff, error) {
	expected, err := s.db.ListCommittedRepoChunks(ctx, userID, repo.Platform, repo.Account, repo.URL)
	if err != nil {
		return RepoChunkDiff{}, err
	}
	d := RepoChunkDiff{Expected: expected}
	if len(remote) == 0 && len(expected) > 0 {
		d.Note = "platform listed no blobs for a repo the index expects to hold chunks; not treating that as data loss"
		return d, nil
	}
	present := make(map[string]struct{}, len(remote))
	for _, b := range remote {
		present[b.RemotePath] = struct{}{}
	}
	for _, c := range expected {
		if _, ok := present[c.RemotePath]; !ok {
			d.Missing = append(d.Missing, c)
		}
	}
	return d, nil
}

// VerifyReport is what a user's "verify my files" run found.
type VerifyReport struct {
	CheckedFiles    int      `json:"checked_files"`
	DamagedFiles    []string `json:"damaged_files"`
	RecoveredFiles  []string `json:"recovered_files"`
	UnverifiedRepos int      `json:"unverified_repos"`
}

// VerifyUserFiles lists every repo the user owns, marks files with a chunk
// missing on the platform as damaged, and returns previously damaged files
// whose chunks are all present again to ok. Files with any chunk in a repo that
// could not be listed are left untouched.
func (s *Server) VerifyUserFiles(ctx context.Context, userID string) (VerifyReport, error) {
	report := VerifyReport{DamagedFiles: []string{}, RecoveredFiles: []string{}}
	repos, err := s.db.ListRepos(ctx, userID, "")
	if err != nil {
		return report, fmt.Errorf("list repos: %w", err)
	}

	checked := map[string]bool{}
	damaged := map[string]bool{}
	unverified := map[string]bool{}
	for _, repo := range repos {
		d, ok := s.verifyRepo(ctx, userID, repo)
		if !ok {
			report.UnverifiedRepos++
			for _, c := range d.Expected {
				unverified[c.FileID] = true
			}
			continue
		}
		for _, c := range d.Expected {
			checked[c.FileID] = true
		}
		for _, c := range d.Missing {
			damaged[c.FileID] = true
		}
	}

	var damagedIDs, intactIDs []string
	for id := range checked {
		switch {
		case damaged[id]:
			damagedIDs = append(damagedIDs, id)
		case !unverified[id]:
			intactIDs = append(intactIDs, id)
		}
	}
	report.CheckedFiles = len(checked)

	changed, err := s.db.MarkFilesDamaged(ctx, damagedIDs)
	if err != nil {
		return report, err
	}
	recovered, err := s.db.ClearFilesDamaged(ctx, intactIDs)
	if err != nil {
		return report, err
	}
	report.DamagedFiles = append(report.DamagedFiles, damagedIDs...)
	report.RecoveredFiles = append(report.RecoveredFiles, recovered...)
	s.emitFileChanges(ctx, userID, append(changed, recovered...), "updated")
	return report, nil
}

// verifyRepo diffs one repo, returning ok=false when it can't be listed
// (Telegram, no adapter, a listing error, or an untrusted empty listing).
func (s *Server) verifyRepo(ctx context.Context, userID string, repo types.RepoInfo) (RepoChunkDiff, bool) {
	expected := func() RepoChunkDiff {
		e, _ := s.db.ListCommittedRepoChunks(ctx, userID, repo.Platform, repo.Account, repo.URL)
		return RepoChunkDiff{Expected: e}
	}
	if repo.Platform == "telegram" {
		return expected(), false
	}
	adapter := s.resolveAdapterForUser(ctx, userID, repo.Platform, repo.Account)
	if adapter == nil {
		return expected(), false
	}
	remote, err := adapter.ListChunks(ctx, repo.URL)
	if err != nil {
		log.Printf("verify: list %s repo %s: %v", repo.Platform, repo.URL, err)
		return expected(), false
	}
	d, err := s.diffRepoChunks(ctx, userID, repo, remote)
	if err != nil {
		log.Printf("verify: diff %s repo %s: %v", repo.Platform, repo.URL, err)
		return expected(), false
	}
	if d.Note != "" {
		return d, false
	}
	return d, true
}

// verifyInFlight keeps one verify run per user at a time: each run lists every
// repo on the platform, which is slow and counts against platform rate limits.
var verifyInFlight sync.Map

// HandleVerifyFiles runs a verify sweep over the caller's files.
// POST /api/files/verify
func (s *Server) HandleVerifyFiles(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	if _, busy := verifyInFlight.LoadOrStore(userID, true); busy {
		http.Error(w, `{"error":"a verify run is already in progress"}`, http.StatusTooManyRequests)
		return
	}
	defer verifyInFlight.Delete(userID)

	report, err := s.VerifyUserFiles(r.Context(), userID)
	if err != nil {
		log.Printf("verify: user %s: %v", logSafe(userID), err) // #nosec G706 -- control chars stripped via logSafe
		http.Error(w, `{"error":"failed to verify files"}`, http.StatusInternalServerError)
		return
	}
	if len(report.DamagedFiles) > 0 {
		log.Printf("verify: user %s has %d damaged file(s)", logSafe(userID), len(report.DamagedFiles)) // #nosec G706 -- control chars stripped via logSafe
	}
	s.audit(r, &userID, "files_verify", map[string]interface{}{
		"checked": report.CheckedFiles,
		"damaged": len(report.DamagedFiles),
	})
	writeJSON(w, http.StatusOK, report)
}
