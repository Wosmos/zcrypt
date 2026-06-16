package localdb

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// DB is the local SQLite database for the desktop sidecar.
type DB struct {
	db *sql.DB
}

// Open creates or opens the local database at ~/.zcrypt-desktop/db.sqlite.
func Open() (*DB, error) {
	dir, err := dataDir()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	dbPath := filepath.Join(dir, "db.sqlite")
	db, err := sql.Open("sqlite", dbPath+"?_journal_mode=WAL&_synchronous=NORMAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	// Performance pragmas
	for _, pragma := range []string{
		"PRAGMA cache_size = -64000",       // 64MB cache
		"PRAGMA mmap_size = 268435456",     // 256MB mmap
		"PRAGMA temp_store = MEMORY",
	} {
		if _, err := db.Exec(pragma); err != nil {
			db.Close()
			return nil, fmt.Errorf("pragma %s: %w", pragma, err)
		}
	}

	d := &DB{db: db}
	if err := d.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return d, nil
}

// Close closes the database.
func (d *DB) Close() error {
	return d.db.Close()
}

func (d *DB) migrate() error {
	_, err := d.db.Exec(`
		CREATE TABLE IF NOT EXISTS files (
			id           TEXT PRIMARY KEY,
			original_name TEXT NOT NULL,
			original_size INTEGER NOT NULL,
			sha256       TEXT NOT NULL,
			salt         BLOB NOT NULL,
			wrapped_cek  BLOB NOT NULL DEFAULT '',
			chunk_count  INTEGER NOT NULL,
			status       TEXT NOT NULL DEFAULT 'pending',
			sync_status  TEXT NOT NULL DEFAULT 'pending',
			backend_file_id TEXT NOT NULL DEFAULT '',
			session_id   TEXT NOT NULL DEFAULT '',
			platform     TEXT NOT NULL DEFAULT '',
			repo_url     TEXT NOT NULL DEFAULT '',
			direct_upload INTEGER NOT NULL DEFAULT 0,
			error_msg    TEXT NOT NULL DEFAULT '',
			created_at   TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS chunks (
			id           TEXT PRIMARY KEY,
			file_id      TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
			idx          INTEGER NOT NULL,
			size         INTEGER NOT NULL,
			encrypted_size INTEGER NOT NULL,
			compressed_size INTEGER NOT NULL,
			sha256       TEXT NOT NULL,
			compressed   INTEGER NOT NULL DEFAULT 0,
			staging_path TEXT NOT NULL,
			sync_status  TEXT NOT NULL DEFAULT 'pending',
			remote_path  TEXT NOT NULL DEFAULT '',
			error_msg    TEXT NOT NULL DEFAULT ''
		);

		CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id);
		CREATE INDEX IF NOT EXISTS idx_chunks_pending ON chunks(sync_status) WHERE sync_status = 'pending';
		CREATE INDEX IF NOT EXISTS idx_files_pending ON files(sync_status) WHERE sync_status != 'synced';
	`)
	if err != nil {
		return err
	}

	// Additive migration for DBs created before envelope encryption. SQLite has
	// no "ADD COLUMN IF NOT EXISTS", so tolerate the duplicate-column error.
	if _, aerr := d.db.Exec(`ALTER TABLE files ADD COLUMN wrapped_cek BLOB NOT NULL DEFAULT ''`); aerr != nil {
		if !strings.Contains(aerr.Error(), "duplicate column name") {
			return fmt.Errorf("add wrapped_cek column: %w", aerr)
		}
	}
	return nil
}

// StagingDir returns the path for storing encrypted chunks.
func StagingDir() (string, error) {
	dir, err := dataDir()
	if err != nil {
		return "", err
	}
	p := filepath.Join(dir, "staging")
	if err := os.MkdirAll(p, 0700); err != nil {
		return "", fmt.Errorf("create staging dir: %w", err)
	}
	return p, nil
}

func dataDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("get home dir: %w", err)
	}
	if runtime.GOOS == "darwin" {
		return filepath.Join(home, "Library", "Application Support", "zcrypt-desktop"), nil
	}
	return filepath.Join(home, ".zcrypt-desktop"), nil
}

// --- File operations ---

type LocalFile struct {
	ID            string
	OriginalName  string
	OriginalSize  int64
	SHA256        string
	Salt          []byte
	WrappedCek    []byte
	ChunkCount    int
	Status        string
	SyncStatus    string
	BackendFileID string
	SessionID     string
	Platform      string
	RepoURL       string
	DirectUpload  bool
	ErrorMsg      string
	CreatedAt     time.Time
}

func (d *DB) InsertFile(f *LocalFile) error {
	_, err := d.db.Exec(
		`INSERT INTO files (id, original_name, original_size, sha256, salt, wrapped_cek, chunk_count, status)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		f.ID, f.OriginalName, f.OriginalSize, f.SHA256, f.Salt, f.WrappedCek, f.ChunkCount, f.Status,
	)
	return err
}

func (d *DB) UpdateFileSyncState(fileID, syncStatus, sessionID, backendFileID, platform, repoURL string, directUpload bool) error {
	_, err := d.db.Exec(
		`UPDATE files SET sync_status = ?, session_id = ?, backend_file_id = ?, platform = ?, repo_url = ?, direct_upload = ? WHERE id = ?`,
		syncStatus, sessionID, backendFileID, platform, repoURL, directUpload, fileID,
	)
	return err
}

func (d *DB) UpdateFileSyncStatus(fileID, status string) error {
	_, err := d.db.Exec(`UPDATE files SET sync_status = ? WHERE id = ?`, status, fileID)
	return err
}

func (d *DB) UpdateFileSyncError(fileID, errMsg string) error {
	_, err := d.db.Exec(`UPDATE files SET sync_status = 'error', error_msg = ? WHERE id = ?`, errMsg, fileID)
	return err
}

func (d *DB) GetPendingFiles() ([]LocalFile, error) {
	rows, err := d.db.Query(
		`SELECT id, original_name, original_size, sha256, salt, wrapped_cek, chunk_count, status, sync_status,
		        backend_file_id, session_id, platform, repo_url, direct_upload, error_msg
		 FROM files WHERE sync_status IN ('pending', 'init_done', 'uploading') ORDER BY created_at`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []LocalFile
	for rows.Next() {
		var f LocalFile
		if err := rows.Scan(&f.ID, &f.OriginalName, &f.OriginalSize, &f.SHA256, &f.Salt, &f.WrappedCek,
			&f.ChunkCount, &f.Status, &f.SyncStatus, &f.BackendFileID, &f.SessionID,
			&f.Platform, &f.RepoURL, &f.DirectUpload, &f.ErrorMsg); err != nil {
			return nil, err
		}
		files = append(files, f)
	}
	return files, rows.Err()
}

func (d *DB) GetFileByID(fileID string) (*LocalFile, error) {
	f := &LocalFile{}
	err := d.db.QueryRow(
		`SELECT id, original_name, original_size, sha256, salt, wrapped_cek, chunk_count, status, sync_status,
		        backend_file_id, session_id, platform, repo_url, direct_upload, error_msg
		 FROM files WHERE id = ?`, fileID,
	).Scan(&f.ID, &f.OriginalName, &f.OriginalSize, &f.SHA256, &f.Salt, &f.WrappedCek,
		&f.ChunkCount, &f.Status, &f.SyncStatus, &f.BackendFileID, &f.SessionID,
		&f.Platform, &f.RepoURL, &f.DirectUpload, &f.ErrorMsg)
	if err != nil {
		return nil, err
	}
	return f, nil
}

// --- Chunk operations ---

type LocalChunk struct {
	ID             string
	FileID         string
	Index          int
	Size           int64
	EncryptedSize  int
	CompressedSize int
	SHA256         string
	Compressed     bool
	StagingPath    string
	SyncStatus     string
	RemotePath     string
	ErrorMsg       string
}

func (d *DB) InsertChunk(c *LocalChunk) error {
	_, err := d.db.Exec(
		`INSERT INTO chunks (id, file_id, idx, size, encrypted_size, compressed_size, sha256, compressed, staging_path)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.ID, c.FileID, c.Index, c.Size, c.EncryptedSize, c.CompressedSize, c.SHA256, c.Compressed, c.StagingPath,
	)
	return err
}

func (d *DB) GetPendingChunks(fileID string) ([]LocalChunk, error) {
	rows, err := d.db.Query(
		`SELECT id, file_id, idx, size, encrypted_size, compressed_size, sha256, compressed, staging_path, sync_status
		 FROM chunks WHERE file_id = ? AND sync_status = 'pending' ORDER BY idx`, fileID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var chunks []LocalChunk
	for rows.Next() {
		var c LocalChunk
		if err := rows.Scan(&c.ID, &c.FileID, &c.Index, &c.Size, &c.EncryptedSize,
			&c.CompressedSize, &c.SHA256, &c.Compressed, &c.StagingPath, &c.SyncStatus); err != nil {
			return nil, err
		}
		chunks = append(chunks, c)
	}
	return chunks, rows.Err()
}

func (d *DB) UpdateChunkSynced(chunkID, remotePath string) error {
	_, err := d.db.Exec(
		`UPDATE chunks SET sync_status = 'synced', remote_path = ? WHERE id = ?`, remotePath, chunkID,
	)
	return err
}

func (d *DB) UpdateChunkError(chunkID, errMsg string) error {
	_, err := d.db.Exec(
		`UPDATE chunks SET sync_status = 'error', error_msg = ? WHERE id = ?`, errMsg, chunkID,
	)
	return err
}

func (d *DB) AllChunksSynced(fileID string) (bool, error) {
	var pending int
	err := d.db.QueryRow(
		`SELECT COUNT(*) FROM chunks WHERE file_id = ? AND sync_status != 'synced'`, fileID,
	).Scan(&pending)
	return pending == 0, err
}

func (d *DB) GetChunkTotals(fileID string) (totalEncrypted int64, totalCompressed int64, err error) {
	err = d.db.QueryRow(
		`SELECT COALESCE(SUM(encrypted_size), 0), COALESCE(SUM(compressed_size), 0) FROM chunks WHERE file_id = ?`, fileID,
	).Scan(&totalEncrypted, &totalCompressed)
	return
}

// --- Stats ---

type SyncStats struct {
	PendingFiles int `json:"pending_files"`
	SyncingFiles int `json:"syncing_files"`
	SyncedFiles  int `json:"synced_files"`
	ErrorFiles   int `json:"error_files"`
}

func (d *DB) GetSyncStats() (SyncStats, error) {
	var s SyncStats
	rows, err := d.db.Query(`SELECT sync_status, COUNT(*) FROM files GROUP BY sync_status`)
	if err != nil {
		return s, err
	}
	defer rows.Close()

	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return s, err
		}
		switch status {
		case "pending", "init_done":
			s.PendingFiles += count
		case "uploading":
			s.SyncingFiles += count
		case "synced":
			s.SyncedFiles += count
		case "error":
			s.ErrorFiles += count
		}
	}
	return s, rows.Err()
}
