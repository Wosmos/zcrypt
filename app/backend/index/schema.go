package index

const schemaSQL = `
CREATE TABLE IF NOT EXISTS files (
	id            TEXT PRIMARY KEY,
	original_name TEXT NOT NULL,
	original_size INTEGER NOT NULL,
	compressed_size INTEGER NOT NULL DEFAULT 0,
	encrypted_size INTEGER NOT NULL DEFAULT 0,
	chunk_count   INTEGER NOT NULL DEFAULT 0,
	sha256        TEXT NOT NULL,
	salt          BLOB NOT NULL,
	iv            BLOB NOT NULL,
	status        TEXT NOT NULL DEFAULT 'complete',
	created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chunks (
	chunk_id    TEXT PRIMARY KEY,
	file_id     TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
	idx         INTEGER NOT NULL,
	size        INTEGER NOT NULL,
	sha256      TEXT NOT NULL,
	platform    TEXT NOT NULL,
	account     TEXT NOT NULL DEFAULT '',
	repo        TEXT NOT NULL,
	remote_path TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id);

CREATE TABLE IF NOT EXISTS repos (
	id        TEXT PRIMARY KEY,
	platform  TEXT NOT NULL,
	account   TEXT NOT NULL DEFAULT '',
	name      TEXT NOT NULL,
	url       TEXT NOT NULL DEFAULT '',
	used_bytes INTEGER NOT NULL DEFAULT 0,
	max_bytes  INTEGER NOT NULL,
	active    INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_repos_platform ON repos(platform);

CREATE TABLE IF NOT EXISTS users (
	id             TEXT PRIMARY KEY,
	email          TEXT NOT NULL UNIQUE,
	username       TEXT NOT NULL UNIQUE,
	password_hash  TEXT NOT NULL,
	email_verified INTEGER NOT NULL DEFAULT 0,
	totp_secret    TEXT NOT NULL DEFAULT '',
	totp_enabled   INTEGER NOT NULL DEFAULT 0,
	created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
	id         TEXT PRIMARY KEY,
	user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token_hash TEXT NOT NULL UNIQUE,
	expires_at DATETIME NOT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

CREATE TABLE IF NOT EXISTS email_tokens (
	id         TEXT PRIMARY KEY,
	user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token_hash TEXT NOT NULL UNIQUE,
	kind       TEXT NOT NULL,
	expires_at DATETIME NOT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_tokens_hash ON email_tokens(token_hash);

CREATE TABLE IF NOT EXISTS pending_deletions (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	platform    TEXT NOT NULL,
	account     TEXT NOT NULL DEFAULT '',
	repo        TEXT NOT NULL,
	remote_path TEXT NOT NULL,
	created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	attempts    INTEGER NOT NULL DEFAULT 0,
	last_error  TEXT NOT NULL DEFAULT ''
);
`
