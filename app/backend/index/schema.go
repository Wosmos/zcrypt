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
	kind       TEXT NOT NULL CHECK (kind IN ('verify', 'reset', 'magic_link')),
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
	iv              BYTEA NOT NULL DEFAULT '',
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
	remote_path TEXT NOT NULL DEFAULT '',
	compressed  BOOLEAN NOT NULL DEFAULT FALSE
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
CREATE INDEX IF NOT EXISTS idx_pending_deletions_cleanup ON pending_deletions(attempts, created_at);

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

-- Additional indexes for performance
CREATE INDEX IF NOT EXISTS idx_repos_user_platform_active ON repos(user_id, platform, account) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_chunks_file_pending ON chunks(file_id) WHERE remote_path = '';
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- OAuth linked accounts
CREATE TABLE IF NOT EXISTS oauth_providers (
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	provider        TEXT NOT NULL CHECK (provider IN ('google', 'github')),
	provider_id     TEXT NOT NULL,
	provider_email  TEXT NOT NULL DEFAULT '',
	created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (provider, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_providers_user ON oauth_providers(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_providers_lookup ON oauth_providers(provider, provider_id);

-- Audit events
CREATE TABLE IF NOT EXISTS audit_events (
	id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
	event_type TEXT NOT NULL,
	ip         TEXT NOT NULL DEFAULT '',
	user_agent TEXT NOT NULL DEFAULT '',
	metadata   JSONB NOT NULL DEFAULT '{}',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_type ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_time ON audit_events(created_at DESC);

-- Upload sessions for chunked client-side encrypted uploads
CREATE TABLE IF NOT EXISTS upload_sessions (
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	file_id         UUID NOT NULL,
	filename        TEXT NOT NULL,
	original_size   BIGINT NOT NULL,
	salt            BYTEA NOT NULL,
	sha256          TEXT NOT NULL,
	chunk_count     INTEGER NOT NULL,
	platform        TEXT NOT NULL,
	account         TEXT NOT NULL DEFAULT '',
	repo_id         TEXT NOT NULL,
	repo_url        TEXT NOT NULL,
	uploaded_chunks INTEGER NOT NULL DEFAULT 0,
	status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'complete', 'cancelled')),
	created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_user ON upload_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires ON upload_sessions(expires_at);

-- Migrations for existing databases: add columns that may be missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS compressed BOOLEAN NOT NULL DEFAULT FALSE;

-- Migrate email_tokens kind constraint for magic links
ALTER TABLE email_tokens DROP CONSTRAINT IF EXISTS email_tokens_kind_check;
ALTER TABLE email_tokens ADD CONSTRAINT email_tokens_kind_check
	CHECK (kind IN ('verify', 'reset', 'magic_link'));
`
