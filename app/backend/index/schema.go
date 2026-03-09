package index

const schemaSQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
	version    INTEGER PRIMARY KEY,
	applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
	id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	email          TEXT NOT NULL UNIQUE,
	username       TEXT NOT NULL UNIQUE,
	password_hash  TEXT NOT NULL,
	email_verified BOOLEAN NOT NULL DEFAULT FALSE,
	totp_secret    TEXT NOT NULL DEFAULT '',
	totp_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
	role                TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
	storage_quota_bytes BIGINT DEFAULT NULL,
	created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS refresh_tokens (
	id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token_hash TEXT NOT NULL UNIQUE,
	expires_at TIMESTAMPTZ NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

CREATE TABLE IF NOT EXISTS email_tokens (
	id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token_hash TEXT NOT NULL UNIQUE,
	kind       TEXT NOT NULL CHECK (kind IN ('verify', 'reset')),
	expires_at TIMESTAMPTZ NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_tokens_hash ON email_tokens(token_hash);

CREATE TABLE IF NOT EXISTS files (
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	original_name   TEXT NOT NULL,
	original_size   BIGINT NOT NULL,
	compressed_size BIGINT NOT NULL DEFAULT 0,
	encrypted_size  BIGINT NOT NULL DEFAULT 0,
	chunk_count     INTEGER NOT NULL DEFAULT 0,
	sha256          TEXT NOT NULL,
	salt            BYTEA NOT NULL,
	iv              BYTEA NOT NULL,
	status          TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('uploading', 'complete')),
	created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
CREATE INDEX IF NOT EXISTS idx_files_user_name ON files(user_id, original_name);

CREATE TABLE IF NOT EXISTS chunks (
	chunk_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	file_id     UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
	user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	idx         INTEGER NOT NULL,
	size        BIGINT NOT NULL,
	sha256      TEXT NOT NULL,
	platform    TEXT NOT NULL,
	account     TEXT NOT NULL DEFAULT '',
	repo        TEXT NOT NULL,
	remote_path TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id);
CREATE INDEX IF NOT EXISTS idx_chunks_user ON chunks(user_id);

CREATE TABLE IF NOT EXISTS repos (
	id         TEXT PRIMARY KEY,
	user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	platform   TEXT NOT NULL,
	account    TEXT NOT NULL DEFAULT '',
	name       TEXT NOT NULL,
	url        TEXT NOT NULL DEFAULT '',
	used_bytes BIGINT NOT NULL DEFAULT 0,
	max_bytes  BIGINT NOT NULL,
	active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_repos_platform ON repos(platform);
CREATE INDEX IF NOT EXISTS idx_repos_user ON repos(user_id);

CREATE TABLE IF NOT EXISTS pending_deletions (
	id          BIGSERIAL PRIMARY KEY,
	user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	platform    TEXT NOT NULL,
	account     TEXT NOT NULL DEFAULT '',
	repo        TEXT NOT NULL,
	remote_path TEXT NOT NULL,
	created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	attempts    INTEGER NOT NULL DEFAULT 0,
	last_error  TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_pending_deletions_user ON pending_deletions(user_id);

CREATE TABLE IF NOT EXISTS platform_tokens (
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	platform        TEXT NOT NULL CHECK (platform IN ('github', 'gitlab', 'huggingface')),
	username        TEXT NOT NULL DEFAULT '',
	token_encrypted BYTEA NOT NULL,
	token_nonce     BYTEA NOT NULL,
	is_global       BOOLEAN NOT NULL DEFAULT FALSE,
	created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (user_id, platform, username)
);

CREATE INDEX IF NOT EXISTS idx_platform_tokens_user ON platform_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_tokens_user_platform ON platform_tokens(user_id, platform);

CREATE TABLE IF NOT EXISTS system_settings (
	key        TEXT PRIMARY KEY,
	value      TEXT NOT NULL,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrations for existing databases: add columns that may be missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
`
