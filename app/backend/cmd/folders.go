package cmd

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/zcrypt/zcrypt/index"
	"github.com/zcrypt/zcrypt/types"
)

// HandleListFolders returns live folders under an optional parent for the current user.
// GET /api/folders?parent_id=optional  (omit parent_id for root folders)
func (s *Server) HandleListFolders(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var parentID *string
	if v := r.URL.Query().Get("parent_id"); v != "" {
		parentID = &v
	}

	folders, err := s.db.ListFolders(ctx, userID, parentID)
	if err != nil {
		log.Printf("folders: list: %v", err)
		http.Error(w, `{"error":"failed to list folders"}`, http.StatusInternalServerError)
		return
	}

	if folders == nil {
		folders = []types.Folder{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(folders)
}

// HandleListFolderSubtree returns a folder and all of its live descendants (any
// depth) in one response. Used by folder sharing to assign each file its
// relative path reliably in a single request.
// GET /api/folders/tree?root=<folderId>
func (s *Server) HandleListFolderSubtree(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	rootID := r.URL.Query().Get("root")
	if rootID == "" {
		http.Error(w, `{"error":"root required"}`, http.StatusBadRequest)
		return
	}

	folders, err := s.db.ListFolderSubtree(ctx, userID, rootID)
	if err != nil {
		log.Printf("folders: subtree: %v", err)
		http.Error(w, `{"error":"failed to list folder subtree"}`, http.StatusInternalServerError)
		return
	}

	if folders == nil {
		folders = []types.Folder{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(folders)
}

// HandleCreateFolder creates a new folder.
// POST /api/folders
func (s *Server) HandleCreateFolder(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req types.FolderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	if req.EncryptedName == "" {
		http.Error(w, `{"error":"folder name is required"}`, http.StatusBadRequest)
		return
	}

	folder, err := s.db.CreateFolder(ctx, userID, req)
	if err != nil {
		log.Printf("folders: create: %v", err)
		http.Error(w, `{"error":"failed to create folder"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(folder)
}

// HandleRenameFolder updates a folder's encrypted name.
// PATCH /api/folders/{id}
func (s *Server) HandleRenameFolder(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	folderID := r.PathValue("id")

	var req struct {
		EncryptedName string `json:"encrypted_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	if req.EncryptedName == "" {
		http.Error(w, `{"error":"folder name is required"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.RenameFolder(ctx, userID, folderID, req.EncryptedName); err != nil {
		log.Printf("folders: rename: %v", err)
		http.Error(w, `{"error":"failed to rename folder"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// HandleUpdateFolderStyle sets or clears a folder's opaque encrypted style blob (icon + color).
// PATCH /api/folders/{id}/style  body { encrypted_style }
// encrypted_style is an opaque client-encrypted base64 string, exactly like encrypted_name; the
// server never decrypts or interprets it. An empty string or null clears the style (falls back
// to the client's auto/default styling).
func (s *Server) HandleUpdateFolderStyle(w http.ResponseWriter, r *http.Request) {
	updateStyle(w, r, "folder", s.db.UpdateFolderStyle)
}

// updateStyle backs both the folder and file "set/clear encrypted style" handlers
// (identical request shape + response); `noun` labels the logs/error, `update`
// is the matching index call. encrypted_style is opaque client ciphertext, an
// empty string or null clears it.
func updateStyle(
	w http.ResponseWriter,
	r *http.Request,
	noun string,
	update func(ctx context.Context, userID, id string, encryptedStyle *string) error,
) {
	var req struct {
		EncryptedStyle *string `json:"encrypted_style"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	if req.EncryptedStyle != nil && *req.EncryptedStyle == "" {
		req.EncryptedStyle = nil
	}

	if err := update(r.Context(), GetUserID(r), r.PathValue("id"), req.EncryptedStyle); err != nil {
		log.Printf("%s: update style: %v", noun, err)
		http.Error(w, `{"error":"failed to update `+noun+` style"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]bool{"success": true}); err != nil {
		log.Printf("%s: encode style response: %v", noun, err)
	}
}

// HandleMoveFolder reparents a folder. A null parent_id moves it to root.
// PATCH /api/folders/{id}/move
func (s *Server) HandleMoveFolder(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	folderID := r.PathValue("id")

	var req types.FolderMoveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.MoveFolder(ctx, userID, folderID, req.ParentID); err != nil {
		if errors.Is(err, index.ErrFolderCycle) {
			http.Error(w, `{"error":"cannot move a folder into its own subfolder"}`, http.StatusBadRequest)
			return
		}
		log.Printf("folders: move: %v", err)
		http.Error(w, `{"error":"failed to move folder"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// HandleDeleteFolder soft-deletes a folder and its entire subtree (folders + files).
// DELETE /api/folders/{id}
func (s *Server) HandleDeleteFolder(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	folderID := r.PathValue("id")

	if err := s.db.SoftDeleteFolder(ctx, userID, folderID); err != nil {
		log.Printf("folders: delete: %v", err)
		http.Error(w, `{"error":"failed to delete folder"}`, http.StatusInternalServerError)
		return
	}

	s.audit(r, &userID, "folder_delete", map[string]interface{}{"folder_id": folderID})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// HandleMoveFile reparents a file into a folder. A null folder_id moves it to root.
// PATCH /api/files/{id}/move
func (s *Server) HandleMoveFile(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	fileID := r.PathValue("id")

	var req types.FileMoveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	// A move across a protection boundary carries the file's re-wrapped envelope
	// so the key and the folder change together: applied separately, a failure
	// between them leaves a file keyed for one folder sitting in the other.
	var salt []byte
	if req.Salt != "" || req.WrappedCEK != "" {
		var ok bool
		if salt, ok = decodeRekeySalt(req.Salt); !ok || req.WrappedCEK == "" {
			http.Error(w, `{"error":"salt must be 32 bytes base64-encoded and wrapped_cek is required"}`, http.StatusBadRequest)
			return
		}
	}

	if err := s.db.MoveFileWithKey(ctx, userID, fileID, req.FolderID, salt, req.WrappedCEK); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
			return
		}
		if errors.Is(err, index.ErrProtectionMismatch) {
			http.Error(w, `{"error":"folder protection changed; reload and try again"}`, http.StatusConflict)
			return
		}
		log.Printf("files: move: %v", err)
		http.Error(w, `{"error":"failed to move file"}`, http.StatusInternalServerError)
		return
	}
	if salt != nil {
		s.audit(r, &userID, "file_rekey", map[string]interface{}{"file_id": fileID})
	}

	// Cross-device: the file's folder changed: notify the user's other devices.
	s.emitFileChange(ctx, userID, fileID, "moved")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// HandleUpdateFileStyle sets or clears a file's opaque encrypted style blob (icon + color).
// PATCH /api/files/{id}/style  body { encrypted_style }
// encrypted_style is an opaque client-encrypted base64 string, exactly like encrypted_name; the
// server never decrypts or interprets it. An empty string or null clears the style (falls back
// to the client's auto/default styling).
// HandleSetFileName serves PATCH /api/files/{id}/name {encrypted_name}. The client
// calls this the first time it lists a legacy (plaintext-named) file while
// unlocked, handing back the name sealed under its name key; the server stores
// the ciphertext and blanks every plaintext copy it held. In a decoy session the
// id addresses a decoy_files row instead: its names are sealed under the decoy
// password with the same enc1: convention (see cmd/list.go).
func (s *Server) HandleSetFileName(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	id := r.PathValue("id")
	var req struct {
		EncryptedName string `json:"encrypted_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.EncryptedName == "" {
		http.Error(w, `{"error":"encrypted_name is required"}`, http.StatusBadRequest)
		return
	}
	var (
		found bool
		err   error
	)
	if IsDecoy(r) {
		found, err = s.db.SetDecoyFileName(ctx, userID, id, sealedPrefix+req.EncryptedName)
	} else {
		found, err = s.db.SetFileEncryptedName(ctx, userID, id, req.EncryptedName)
	}
	if err != nil {
		http.Error(w, `{"error":"failed to update file name"}`, http.StatusInternalServerError)
		return
	}
	if !found {
		http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (s *Server) HandleUpdateFileStyle(w http.ResponseWriter, r *http.Request) {
	updateStyle(w, r, "file", s.db.UpdateFileStyle)
}

// HandleSetFolderPassword sets (or replaces) a folder's password protection.
// POST /api/folders/{id}/password  body { pw_salt, pw_verifier }
// The body fields are opaque client-computed base64 blobs; the server stores them verbatim
// and never derives, sees, or logs the folder password or any key. Audit records only the
// folder id, never the salt, verifier, or any key material.
func (s *Server) HandleSetFolderPassword(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	folderID := r.PathValue("id")

	var req types.FolderPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	if req.PwSalt == "" || req.PwVerifier == "" {
		http.Error(w, `{"error":"pw_salt and pw_verifier are required"}`, http.StatusBadRequest)
		return
	}

	keys, ok := decodeRekeys(req.Rekeys)
	if !ok {
		http.Error(w, `{"error":"each rekey needs a file_id, a 32-byte base64 salt and a wrapped_cek"}`, http.StatusBadRequest)
		return
	}
	if err := s.db.SetFolderProtection(ctx, userID, folderID, req.PwSalt, req.PwVerifier, keys); err != nil {
		if errors.Is(err, index.ErrRekeyTargetMissing) {
			http.Error(w, `{"error":"the re-keyed files do not match this folder's files; reload and try again"}`, http.StatusConflict)
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, `{"error":"folder not found"}`, http.StatusNotFound)
			return
		}
		log.Printf("folders: set password: %v", err)
		http.Error(w, `{"error":"failed to set folder password"}`, http.StatusInternalServerError)
		return
	}

	s.audit(r, &userID, "folder_password_set", map[string]interface{}{"folder_id": folderID})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// HandleRemoveFolderPassword clears a folder's password protection (sets both columns NULL).
// DELETE /api/folders/{id}/password  optional body { rekeys: [{file_id, salt, wrapped_cek}] }
// The folder's files re-keyed back to the vault passphrase are applied in the same
// transaction as the removal, so a failure can never leave them half-converted.
func (s *Server) HandleRemoveFolderPassword(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	folderID := r.PathValue("id")

	var req types.FolderUnprotectRequest
	if r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
			http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
			return
		}
	}
	keys, ok := decodeRekeys(req.Rekeys)
	if !ok {
		http.Error(w, `{"error":"each rekey needs a file_id, a 32-byte base64 salt and a wrapped_cek"}`, http.StatusBadRequest)
		return
	}
	if err := s.db.SetFolderProtection(ctx, userID, folderID, "", "", keys); err != nil {
		if errors.Is(err, index.ErrRekeyTargetMissing) {
			http.Error(w, `{"error":"the re-keyed files do not match this folder's files; reload and try again"}`, http.StatusConflict)
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, `{"error":"folder not found"}`, http.StatusNotFound)
			return
		}
		log.Printf("folders: remove password: %v", err)
		http.Error(w, `{"error":"failed to remove folder password"}`, http.StatusInternalServerError)
		return
	}

	s.audit(r, &userID, "folder_password_remove", map[string]interface{}{"folder_id": folderID})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// HandleRekeyFile re-keys a single file's envelope when it crosses a protection boundary
// (vault <-> folder password). PUT /api/files/{id}/rekey  body { salt, wrapped_cek }
// salt is base64 (decoded to 32 raw bytes, mirroring upload-init validation); wrapped_cek is
// the opaque base64 envelope. Updates ONLY this file's salt + wrapped_cek columns. The server
// never derives or sees any key; audit records only the file id.
func (s *Server) HandleRekeyFile(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	fileID := r.PathValue("id")

	var req types.FileRekeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	if req.Salt == "" || req.WrappedCEK == "" {
		http.Error(w, `{"error":"salt and wrapped_cek are required"}`, http.StatusBadRequest)
		return
	}

	// Decode salt to raw bytes (salt is BYTEA in the files table), mirroring upload-init.
	salt, ok := decodeRekeySalt(req.Salt)
	if !ok {
		http.Error(w, `{"error":"salt must be 32 bytes base64-encoded"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.UpdateFileKey(ctx, userID, fileID, salt, req.WrappedCEK); err != nil {
		log.Printf("files: rekey: %v", err)
		http.Error(w, `{"error":"failed to rekey file"}`, http.StatusInternalServerError)
		return
	}

	s.audit(r, &userID, "file_rekey", map[string]interface{}{"file_id": fileID})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// HandleListTrash returns the current user's soft-deleted (trashed) files.
// GET /api/files/trash
func (s *Server) HandleListTrash(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	files, err := s.db.ListTrashedFiles(ctx, userID)
	if err != nil {
		log.Printf("files: trash list: %v", err)
		http.Error(w, `{"error":"failed to list trash"}`, http.StatusInternalServerError)
		return
	}

	if files == nil {
		files = []types.FileMetadata{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}

// HandleRestoreFile brings a file back from the trash.
// POST /api/files/{id}/restore
func (s *Server) HandleRestoreFile(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	fileID := r.PathValue("id")

	if err := s.db.RestoreFile(ctx, userID, fileID); err != nil {
		log.Printf("files: restore: %v", err)
		http.Error(w, `{"error":"failed to restore file"}`, http.StatusInternalServerError)
		return
	}

	s.audit(r, &userID, "file_restore", map[string]interface{}{"file_id": fileID})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// decodeRekeySalt decodes a base64 file salt, which must be 32 raw bytes
// (mirroring upload-init).
func decodeRekeySalt(b64 string) ([]byte, bool) {
	salt, err := base64.StdEncoding.DecodeString(b64)
	if err != nil || len(salt) != 32 {
		return nil, false
	}
	return salt, true
}

// decodeRekeys validates a bulk folder (un)protect's file envelopes.
func decodeRekeys(entries []types.FileRekeyEntry) ([]index.FileKey, bool) {
	keys := make([]index.FileKey, 0, len(entries))
	for _, e := range entries {
		salt, ok := decodeRekeySalt(e.Salt)
		if !ok || e.FileID == "" || e.WrappedCEK == "" {
			return nil, false
		}
		keys = append(keys, index.FileKey{FileID: e.FileID, Salt: salt, WrappedCEK: e.WrappedCEK})
	}
	return keys, true
}
