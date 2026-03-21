package index

import (
	"context"
	"time"

	"github.com/zcrypt/zcrypt/types"
)

func (db *DB) CreateNote(ctx context.Context, userID string, req types.NoteRequest) (*types.Note, error) {
	note := &types.Note{}
	err := db.pool.QueryRow(ctx, `
		INSERT INTO notes (user_id, encrypted_title, encrypted_body, content_size, tags, pinned)
		VALUES ($1, decode($2, 'base64'), decode($3, 'base64'), $4, $5, COALESCE($6, FALSE))
		RETURNING id, user_id, encrypted_title, encrypted_body, content_size, tags, pinned, created_at, updated_at`,
		userID, req.EncryptedTitle, req.EncryptedBody, req.ContentSize, req.Tags, req.Pinned,
	).Scan(&note.ID, &note.UserID, &note.EncryptedTitle, &note.EncryptedBody, &note.ContentSize,
		&note.Tags, &note.Pinned, &note.CreatedAt, &note.UpdatedAt)
	return note, err
}

func (db *DB) ListNotes(ctx context.Context, userID string) ([]types.Note, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT id, user_id, encrypted_title, encrypted_body, content_size, tags, pinned, created_at, updated_at
		FROM notes WHERE user_id = $1
		ORDER BY pinned DESC, updated_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notes []types.Note
	for rows.Next() {
		var n types.Note
		if err := rows.Scan(&n.ID, &n.UserID, &n.EncryptedTitle, &n.EncryptedBody, &n.ContentSize,
			&n.Tags, &n.Pinned, &n.CreatedAt, &n.UpdatedAt); err != nil {
			return nil, err
		}
		notes = append(notes, n)
	}
	return notes, nil
}

func (db *DB) GetNote(ctx context.Context, userID, noteID string) (*types.Note, error) {
	note := &types.Note{}
	err := db.pool.QueryRow(ctx, `
		SELECT id, user_id, encrypted_title, encrypted_body, content_size, tags, pinned, created_at, updated_at
		FROM notes WHERE id = $1 AND user_id = $2`, noteID, userID,
	).Scan(&note.ID, &note.UserID, &note.EncryptedTitle, &note.EncryptedBody, &note.ContentSize,
		&note.Tags, &note.Pinned, &note.CreatedAt, &note.UpdatedAt)
	return note, err
}

func (db *DB) UpdateNote(ctx context.Context, userID, noteID string, req types.NoteRequest) (*types.Note, error) {
	note := &types.Note{}
	err := db.pool.QueryRow(ctx, `
		UPDATE notes SET
			encrypted_title = decode($3, 'base64'),
			encrypted_body = decode($4, 'base64'),
			content_size = $5,
			tags = $6,
			pinned = COALESCE($7, pinned),
			updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING id, user_id, encrypted_title, encrypted_body, content_size, tags, pinned, created_at, updated_at`,
		noteID, userID, req.EncryptedTitle, req.EncryptedBody, req.ContentSize, req.Tags, req.Pinned,
	).Scan(&note.ID, &note.UserID, &note.EncryptedTitle, &note.EncryptedBody, &note.ContentSize,
		&note.Tags, &note.Pinned, &note.CreatedAt, &note.UpdatedAt)
	return note, err
}

func (db *DB) DeleteNote(ctx context.Context, userID, noteID string) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM notes WHERE id = $1 AND user_id = $2`, noteID, userID)
	return err
}

func (db *DB) CountNotes(ctx context.Context, userID string) (int, error) {
	var count int
	err := db.pool.QueryRow(ctx, `SELECT COUNT(*) FROM notes WHERE user_id = $1`, userID).Scan(&count)
	return count, err
}

// CleanupOldNotes deletes notes not updated in 365 days (safety net).
func (db *DB) CleanupOldNotes(ctx context.Context) (int, error) {
	cutoff := time.Now().AddDate(0, 0, -365)
	tag, err := db.pool.Exec(ctx, `DELETE FROM notes WHERE updated_at < $1`, cutoff)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}
