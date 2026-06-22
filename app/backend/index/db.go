package index

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DB wraps the PostgreSQL connection pool.
type DB struct {
	pool *pgxpool.Pool
}

// Open connects to PostgreSQL and runs migrations.
func Open(databaseURL string) (*DB, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	// Neon already pools via PgBouncer (the -pooler URL), so this is a client-side
	// cap on concurrent server-bound connections. 5 was too tight: parallel uploads,
	// background workers, and user traffic serialized behind it. MinConns stays 0 and
	// idle conns drain in 30s so Neon can still auto-suspend when the app is idle —
	// MaxConns is only a ceiling, never a floor, so raising it doesn't keep Neon awake.
	config.MaxConns = 25
	config.MinConns = 0
	config.MaxConnIdleTime = 30 * time.Second
	config.MaxConnLifetime = 5 * time.Minute
	config.HealthCheckPeriod = time.Hour

	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return nil, fmt.Errorf("connect to database: %w", err)
	}

	if err := pool.Ping(context.Background()); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	db := &DB{pool: pool}
	if err := db.runMigrations(context.Background()); err != nil {
		pool.Close()
		return nil, fmt.Errorf("run migrations: %w", err)
	}

	return db, nil
}

// runMigrations creates tables if they don't exist.
func (db *DB) runMigrations(ctx context.Context) error {
	_, err := db.pool.Exec(ctx, schemaSQL)
	if err != nil {
		return fmt.Errorf("apply schema: %w", err)
	}
	db.applyOptionalExtensions(ctx)
	return nil
}

// applyOptionalExtensions installs nice-to-have but non-essential database objects
// (currently the pg_trgm trigram index that accelerates filename ILIKE search).
// These run OUTSIDE the boot-critical schema migration: CREATE EXTENSION can fail on
// a DB role without the privilege, and we never want a search optimization to brick
// startup. On failure the app simply falls back to a (correct, slower) sequential
// scan for substring search.
func (db *DB) applyOptionalExtensions(ctx context.Context) {
	// Ordered: the GIN index depends on the extension, so bail on the first failure.
	stmts := []string{
		`CREATE EXTENSION IF NOT EXISTS pg_trgm`,
		`CREATE INDEX IF NOT EXISTS idx_files_name_trgm ON files USING GIN (original_name gin_trgm_ops)`,
	}
	for _, stmt := range stmts {
		if _, err := db.pool.Exec(ctx, stmt); err != nil {
			log.Printf("index: optional pg_trgm migration skipped (filename search will use a scan): %v", err)
			return
		}
	}
}

// Close closes the database connection pool.
func (db *DB) Close() {
	db.pool.Close()
}

// Pool returns the underlying pgxpool.Pool.
func (db *DB) Pool() *pgxpool.Pool {
	return db.pool
}
