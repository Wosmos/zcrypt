package index

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

// DB wraps the SQLite connection.
type DB struct {
	conn *sql.DB
}

// Open opens (or creates) the SQLite database at the given path and runs migrations.
func Open(dbPath string) (*DB, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, fmt.Errorf("create db directory: %w", err)
	}

	conn, err := sql.Open("sqlite", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	conn.SetMaxOpenConns(1) // serialize writes

	if _, err := conn.Exec("PRAGMA foreign_keys = ON"); err != nil {
		conn.Close()
		return nil, fmt.Errorf("enable foreign keys: %w", err)
	}

	if _, err := conn.Exec(schemaSQL); err != nil {
		conn.Close()
		return nil, fmt.Errorf("run migrations: %w", err)
	}

	db := &DB{conn: conn}
	if err := db.runMigrations(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("run migrations: %w", err)
	}

	return db, nil
}

// runMigrations applies incremental schema changes using PRAGMA user_version.
func (db *DB) runMigrations() error {
	var version int
	if err := db.conn.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		return fmt.Errorf("get user_version: %w", err)
	}

	if version < 1 {
		// Add account column to chunks, repos, pending_deletions
		stmts := []string{
			"ALTER TABLE chunks ADD COLUMN account TEXT NOT NULL DEFAULT ''",
			"ALTER TABLE repos ADD COLUMN account TEXT NOT NULL DEFAULT ''",
			"ALTER TABLE pending_deletions ADD COLUMN account TEXT NOT NULL DEFAULT ''",
			"CREATE INDEX IF NOT EXISTS idx_repos_platform_account ON repos(platform, account)",
			"PRAGMA user_version = 1",
		}
		for _, stmt := range stmts {
			if _, err := db.conn.Exec(stmt); err != nil {
				// Column may already exist if schema was created fresh
				if isColumnAlreadyExists(err) {
					continue
				}
				return fmt.Errorf("migration v1: %w", err)
			}
		}
	}

	if version < 2 {
		stmts := []string{
			"ALTER TABLE files ADD COLUMN status TEXT NOT NULL DEFAULT 'complete'",
			"CREATE INDEX IF NOT EXISTS idx_files_status ON files(status)",
			"PRAGMA user_version = 2",
		}
		for _, stmt := range stmts {
			if _, err := db.conn.Exec(stmt); err != nil {
				if isColumnAlreadyExists(err) {
					continue
				}
				return fmt.Errorf("migration v2: %w", err)
			}
		}
	}

	return nil
}

// isColumnAlreadyExists checks if an ALTER TABLE error is because the column already exists.
func isColumnAlreadyExists(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "duplicate column") || strings.Contains(msg, "already exists")
}

// Close closes the database connection.
func (db *DB) Close() error {
	return db.conn.Close()
}

// Conn returns the underlying sql.DB for direct queries.
func (db *DB) Conn() *sql.DB {
	return db.conn
}
