package cmd

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/zcrypt/zcrypt/types"
)

// HandleListNotes returns all notes for the current user.
// GET /api/notes
func (s *Server) HandleListNotes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	notes, err := s.db.ListNotes(ctx, userID)
	if err != nil {
		log.Printf("notes: list: %v", err)
		http.Error(w, `{"error":"failed to list notes"}`, http.StatusInternalServerError)
		return
	}

	if notes == nil {
		notes = []types.Note{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(notes)
}

// HandleCreateNote creates a new encrypted note.
// POST /api/notes
func (s *Server) HandleCreateNote(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req types.NoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if req.EncryptedTitle == "" && req.EncryptedBody == "" {
		http.Error(w, `{"error":"note content is required"}`, http.StatusBadRequest)
		return
	}

	note, err := s.db.CreateNote(ctx, userID, req)
	if err != nil {
		log.Printf("notes: create: %v", err)
		http.Error(w, `{"error":"failed to create note"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(note)
}

// HandleGetNote returns a single note.
// GET /api/notes/{id}
func (s *Server) HandleGetNote(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	noteID := r.PathValue("id")

	note, err := s.db.GetNote(ctx, userID, noteID)
	if err != nil {
		http.Error(w, `{"error":"note not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(note)
}

// HandleUpdateNote updates an existing note.
// PUT /api/notes/{id}
func (s *Server) HandleUpdateNote(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	noteID := r.PathValue("id")

	var req types.NoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	note, err := s.db.UpdateNote(ctx, userID, noteID, req)
	if err != nil {
		log.Printf("notes: update: %v", err)
		http.Error(w, `{"error":"failed to update note"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(note)
}

// HandleDeleteNote deletes a note.
// DELETE /api/notes/{id}
func (s *Server) HandleDeleteNote(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	noteID := r.PathValue("id")

	if err := s.db.DeleteNote(ctx, userID, noteID); err != nil {
		log.Printf("notes: delete: %v", err)
		http.Error(w, `{"error":"failed to delete note"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
