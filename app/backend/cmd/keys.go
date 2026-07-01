package cmd

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(key) // nil → JSON null (client then generates)
}

// HandlePublishKey publishes (or rotates) the caller's keypair. Every field is
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

	if err := s.db.UpsertUserKey(ctx, userID, req.PublicKey, req.WrappedPrivateKey, req.KDFSalt, req.Fingerprint); err != nil {
		log.Printf("keys: publish: %v", err)
		http.Error(w, `{"error":"failed to publish key"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// HandleLookupUserKey resolves a user's PUBLIC key by email or username, so an
// admin can seal a space key to them before inviting. Returns 404 both when no
// such user exists and when they exist but have no published key (don't
// distinguish — reduces user enumeration; rate-limiting is the real mitigation).
// GET /api/keys/lookup?identifier=<email-or-username>
func (s *Server) HandleLookupUserKey(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	identifier := strings.TrimSpace(r.URL.Query().Get("identifier"))
	if identifier == "" {
		http.Error(w, `{"error":"identifier required"}`, http.StatusBadRequest)
		return
	}

	pk, err := s.db.ResolveUserPublicKey(ctx, identifier)
	if err != nil {
		log.Printf("keys: lookup: %v", err)
		http.Error(w, `{"error":"lookup failed"}`, http.StatusInternalServerError)
		return
	}
	if pk == nil {
		http.Error(w, `{"error":"no user with a published key"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pk)
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
