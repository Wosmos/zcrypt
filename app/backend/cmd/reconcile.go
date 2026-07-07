package cmd

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"sort"
)

// orphanSampleCap bounds how many orphan paths a report lists per repo. The count
// is always exact; the sample is just enough to eyeball what leaked without
// returning an unbounded blob for a badly-drifted repo.
const orphanSampleCap = 50

// RepoReconcileReport is the per-repo result of the reconciliation sweep: what is
// physically on the platform versus what the DB accounts for. It is REPORT ONLY —
// producing it never deletes anything.
type RepoReconcileReport struct {
	RepoID      string   `json:"repo_id"`
	Platform    string   `json:"platform"`
	Account     string   `json:"account"`
	Repo        string   `json:"repo"`
	Listable    bool     `json:"listable"`
	RemoteBlobs int      `json:"remote_blobs"`
	KnownPaths  int      `json:"known_paths"`
	OrphanCount int      `json:"orphan_count"`
	Orphans     []string `json:"orphans,omitempty"`
	Note        string   `json:"note,omitempty"`
	Error       string   `json:"error,omitempty"`
}

// ReconcileReport aggregates the per-repo results for one user.
type ReconcileReport struct {
	UserID       string                `json:"user_id"`
	Repos        []RepoReconcileReport `json:"repos"`
	TotalOrphans int                   `json:"total_orphans"`
	Note         string                `json:"note"`
}

// ReconcileUserOrphans enumerates every repo a user owns, lists what is
// physically stored on each platform, and diffs it against what the DB accounts
// for (live chunks, planned-but-unsynced chunks, and already-queued deletions).
// Anything on the platform that the DB does not reference is a historical orphan.
//
// This is strictly REPORT-ONLY: it never deletes a blob. Auto-deleting on a
// listing diff is unsafe — a listing that is incomplete or path-mismatched would
// classify LIVE data as orphaned. The forward-completeness fix (planned_remote_path)
// prevents NEW orphans; this surfaces pre-existing ones for manual review.
//
// Telegram is intentionally skipped: the Bot API cannot enumerate a chat, so its
// blobs can only be tracked via the DB (which is why never losing that tracking
// matters). Such repos are reported with Listable=false and a note.
func (s *Server) ReconcileUserOrphans(ctx context.Context, userID string) (ReconcileReport, error) {
	report := ReconcileReport{
		UserID: userID,
		Note:   "Report only — no blobs were deleted. Review orphans before acting.",
	}

	repos, err := s.db.ListRepos(ctx, userID, "")
	if err != nil {
		return report, fmt.Errorf("list repos: %w", err)
	}

	for _, repo := range repos {
		rr := RepoReconcileReport{
			RepoID:   repo.ID,
			Platform: repo.Platform,
			Account:  repo.Account,
			Repo:     repo.URL,
		}

		if repo.Platform == "telegram" {
			rr.Listable = false
			rr.Note = "Telegram cannot be enumerated via the Bot API; its blobs are tracked only in the DB, so orphan detection is not possible here."
			report.Repos = append(report.Repos, rr)
			continue
		}

		adapter := s.resolveAdapterForUser(ctx, userID, repo.Platform, repo.Account)
		if adapter == nil {
			rr.Error = "no adapter available (platform token missing?)"
			report.Repos = append(report.Repos, rr)
			continue
		}

		remote, err := adapter.ListChunks(ctx, repo.URL)
		if err != nil {
			rr.Error = fmt.Sprintf("list platform blobs: %v", err)
			report.Repos = append(report.Repos, rr)
			continue
		}
		rr.Listable = true
		rr.RemoteBlobs = len(remote)

		known, err := s.db.KnownRemotePaths(ctx, userID, repo.Platform, repo.Account, repo.URL)
		if err != nil {
			rr.Error = fmt.Sprintf("load known paths: %v", err)
			report.Repos = append(report.Repos, rr)
			continue
		}
		rr.KnownPaths = len(known)

		var orphans []string
		for _, blob := range remote {
			if !known[blob.RemotePath] {
				orphans = append(orphans, blob.RemotePath)
			}
		}
		sort.Strings(orphans)
		rr.OrphanCount = len(orphans)
		if len(orphans) > orphanSampleCap {
			rr.Orphans = orphans[:orphanSampleCap]
			rr.Note = fmt.Sprintf("showing first %d of %d orphans", orphanSampleCap, len(orphans))
		} else {
			rr.Orphans = orphans
		}

		report.TotalOrphans += rr.OrphanCount
		report.Repos = append(report.Repos, rr)
	}

	return report, nil
}

// HandleAdminReconcile reports platform blobs that the DB no longer references
// (historical orphans), for one user. Report-only — deletes nothing.
//
// GET /api/admin/reconcile          — reconcile the calling admin's own repos
// GET /api/admin/reconcile?user_id= — reconcile a specific user's repos
func (s *Server) HandleAdminReconcile(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		userID = GetUserID(r)
	}

	report, err := s.ReconcileUserOrphans(r.Context(), userID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	adminID := GetUserID(r)
	s.audit(r, &adminID, "admin_reconcile", map[string]interface{}{
		"target_user":   userID,
		"total_orphans": report.TotalOrphans,
	})
	if report.TotalOrphans > 0 {
		log.Printf("reconcile: user %s has %d orphaned platform blobs across %d repos (report-only)",
			userID, report.TotalOrphans, len(report.Repos))
	}

	writeJSON(w, http.StatusOK, report)
}
