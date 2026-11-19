package cmd

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/zcrypt/zcrypt/types"
)

// HandleGetMyKey returns the caller's own key record (incl. the wrapped private
// key), or JSON null when they haven't published a keypair yet.
// GET /api/keys/me
func (s *Server) HandleGetMyKey(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	key, err := s.db.GetUserKey(ctx, userID)
	if err != nil {
		log.Printf("keys: get me: %v", err)
		http.Error(w, `{"error":"failed to load key"}`, http.StatusInternalServerError)
		return
	}

	if key != nil {
		key.MasterKeyWrites = s.masterKeyWritesEnabled(ctx)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(key) // nil → JSON null (client then generates)
}

// HandlePublishKey publishes the caller's keypair, or replaces it when the
// caller proves the current fingerprint (409 otherwise). Every field is
// produced client-side; the wrapped private key is opaque ciphertext to us.
// POST /api/keys
func (s *Server) HandlePublishKey(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req types.PublishKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	if req.PublicKey == "" || req.WrappedPrivateKey == "" || req.KDFSalt == "" || req.Fingerprint == "" {
		http.Error(w, `{"error":"public_key, wrapped_private_key, kdf_salt and fingerprint are required"}`, http.StatusBadRequest)
		return
	}

	stored, err := s.db.PublishUserKey(ctx, userID, req.PublicKey, req.WrappedPrivateKey, req.KDFSalt, req.Fingerprint, req.CurrentFingerprint)
	if err != nil {
		log.Printf("keys: publish: %v", err)
		http.Error(w, `{"error":"failed to publish key"}`, http.StatusInternalServerError)
		return
	}
	if !stored {
		http.Error(w, `{"error":"a key is already published; send current_fingerprint to replace it"}`, http.StatusConflict)
		return
	}

	s.announcePendingKeys(ctx, userID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

const (
	keyLookupLimit  = 30
	keyLookupWindow = 10 * time.Minute
	inviteLimit     = 30
	inviteWindow    = 10 * time.Minute
)

// HandleLookupUserKey resolves an account by email or username so an admin can
// seal a space key to it before inviting. The three outcomes are distinct so
// the invite UI can say what is wrong, which makes it an email-existence
// oracle: each caller gets keyLookupLimit lookups per keyLookupWindow.
//
//	200 {user_id, public_key, fingerprint, status:"ready"}  account with a key
//	404 {error, code:"no_key", user_id}                      account, no key yet
//	404 {error, code:"not_found"}                            no such account
//	429 {error, code:"rate_limited"}
//
// GET /api/keys/lookup?identifier=<email-or-username>
func (s *Server) HandleLookupUserKey(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	identifier := strings.TrimSpace(r.URL.Query().Get("identifier"))
	if identifier == "" {
		http.Error(w, `{"error":"identifier required"}`, http.StatusBadRequest)
		return
	}
	if !s.keyLookupLimiter.allow(GetUserID(r)) {
		w.Header().Set("Retry-After", strconv.Itoa(int(keyLookupWindow.Seconds())))
		writeCodedError(w, http.StatusTooManyRequests, "rate_limited", "too many lookups, try again later")
		return
	}

	if strings.Contains(identifier, "@") {
		identifier = strings.ToLower(identifier)
	}
	userID, pk, found, err := s.db.LookupUserForInvite(ctx, identifier)
	if err != nil {
		log.Printf("keys: lookup: %v", err)
		http.Error(w, `{"error":"lookup failed"}`, http.StatusInternalServerError)
		return
	}
	if !found {
		writeCodedError(w, http.StatusNotFound, "not_found", "no account with this email")
		return
	}
	if pk == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{
			"error": "this account has no key yet", "code": "no_key", "user_id": userID,
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"user_id": pk.UserID, "public_key": pk.PublicKey, "fingerprint": pk.Fingerprint, "status": "ready",
	})
}

// HandleGetUserPublicKey returns another user's PUBLIC key (never the wrapped
// private key), for wrapping a shared-space key to them.
// GET /api/keys/user/{id}
func (s *Server) HandleGetUserPublicKey(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	targetID := strings.TrimSpace(r.PathValue("id"))
	if targetID == "" {
		http.Error(w, `{"error":"user id required"}`, http.StatusBadRequest)
		return
	}

	pk, err := s.db.GetPublicKey(ctx, targetID)
	if err != nil {
		log.Printf("keys: get public: %v", err)
		http.Error(w, `{"error":"failed to load key"}`, http.StatusInternalServerError)
		return
	}
	if pk == nil {
		http.Error(w, `{"error":"user has no published key"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pk)
}
