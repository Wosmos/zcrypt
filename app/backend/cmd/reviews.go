package cmd

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/zcrypt/zcrypt/types"
)

const (
	reviewQuoteMax = 280
	reviewNameMax  = 40
	reviewPublicN  = 24
)

var reviewStatuses = map[string]bool{"pending": true, "approved": true, "rejected": true}

// HandleSubmitReview creates or replaces the caller's review. Saving always
// puts it back in the moderation queue.
// POST /api/reviews
func (s *Server) HandleSubmitReview(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	var req struct {
		Rating      int    `json:"rating"`
		Quote       string `json:"quote"`
		DisplayName string `json:"display_name"`
		PublicOK    bool   `json:"public_ok"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	if req.Rating < 1 || req.Rating > 5 {
		http.Error(w, `{"error":"rating must be between 1 and 5"}`, http.StatusBadRequest)
		return
	}
	quote, ok := boundedField(req.Quote, reviewQuoteMax)
	if !ok || quote == "" {
		http.Error(w, `{"error":"quote is required (max 280 characters)"}`, http.StatusBadRequest)
		return
	}
	name, ok := boundedField(req.DisplayName, reviewNameMax)
	if !ok || name == "" {
		http.Error(w, `{"error":"display name is required (max 40 characters)"}`, http.StatusBadRequest)
		return
	}

	review := &types.Review{
		UserID:      userID,
		Rating:      req.Rating,
		Quote:       quote,
		DisplayName: name,
		PublicOK:    req.PublicOK,
	}
	if err := s.db.UpsertReview(r.Context(), review); err != nil {
		internalError(w, "upsert review", err)
		return
	}

	s.audit(r, &userID, "review_submit", map[string]interface{}{"rating": review.Rating, "public_ok": review.PublicOK})
	writeJSON(w, http.StatusOK, review)
}

// HandleGetMyReview returns the caller's review, or null when none exists.
// GET /api/reviews/me
func (s *Server) HandleGetMyReview(w http.ResponseWriter, r *http.Request) {
	review, err := s.db.GetReviewByUser(r.Context(), GetUserID(r))
	if err != nil {
		internalError(w, "get review", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"review": review})
}

// HandlePublicReviews serves approved, consented reviews to the website.
// GET /api/reviews/public
func (s *Server) HandlePublicReviews(w http.ResponseWriter, r *http.Request) {
	items, err := s.db.ListPublicReviews(r.Context(), reviewPublicN)
	if err != nil {
		internalError(w, "list public reviews", err)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=300")
	writeJSON(w, http.StatusOK, map[string]interface{}{"reviews": items})
}

// HandleAdminListReviews lists reviews for moderation.
// GET /api/admin/reviews?status=&limit=&offset=
func (s *Server) HandleAdminListReviews(w http.ResponseWriter, r *http.Request) {
	adminListByStatus(w, r, "reviews", reviewStatuses, s.db.ListReviews)
}

// HandleAdminUpdateReview approves or rejects a review.
// PATCH /api/admin/reviews/{id}
func (s *Server) HandleAdminUpdateReview(w http.ResponseWriter, r *http.Request) {
	s.adminSetStatus(w, r, reviewStatuses, "status must be pending, approved or rejected", "review", "admin_review_status", s.db.UpdateReviewStatus)
}

func adminListByStatus[T any](w http.ResponseWriter, r *http.Request, key string, valid map[string]bool, list func(ctx context.Context, status string, limit, offset int) ([]T, int, error)) {
	status := r.URL.Query().Get("status")
	if status != "" && !valid[status] {
		http.Error(w, `{"error":"invalid status"}`, http.StatusBadRequest)
		return
	}
	limit, offset := 50, 0
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && n > 0 && n <= 100 {
		limit = n
	}
	if n, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil && n >= 0 {
		offset = n
	}
	items, total, err := list(r.Context(), status, limit, offset)
	if err != nil {
		internalError(w, "list "+key, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		key:      items,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (s *Server) adminSetStatus(w http.ResponseWriter, r *http.Request, valid map[string]bool, badMsg, noun, action string, update func(ctx context.Context, id, status string) (bool, error)) {
	id := r.PathValue("id")
	if _, err := uuid.Parse(id); err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || !valid[req.Status] {
		http.Error(w, `{"error":"`+badMsg+`"}`, http.StatusBadRequest)
		return
	}
	found, err := update(r.Context(), id, req.Status)
	if err != nil {
		internalError(w, "update "+noun, err)
		return
	}
	if !found {
		http.Error(w, `{"error":"`+noun+` not found"}`, http.StatusNotFound)
		return
	}
	adminID := GetUserID(r)
	s.audit(r, &adminID, action, map[string]interface{}{"id": id, "status": req.Status})
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "status": req.Status})
}
