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
	wrapped_cek     TEXT NOT NULL DEFAULT '',
	status          TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('uploading', 'complete')),
	created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
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
	platform        TEXT NOT NULL CHECK (platform IN ('github', 'gitlab', 'huggingface', 'telegram')),
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

-- File listing hot path: WHERE user_id=$1 AND status='complete' ORDER BY created_at DESC.
-- This partial composite serves the exact filter and the sort in a single index-ordered scan,
-- so the list is an O(log n) seek + O(limit) read with no separate sort step.
-- (The pg_trgm extension + trigram index for ILIKE search are applied best-effort in db.go,
--  outside this boot-critical batch, since CREATE EXTENSION can fail on restricted DB roles.)
CREATE INDEX IF NOT EXISTS idx_files_user_created_complete ON files(user_id, created_at DESC) WHERE status = 'complete';

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

-- Sync attempt counter: lets the sync worker stop retrying a permanently-broken
-- chunk (e.g. its staging file is gone) instead of looping on it forever.
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS sync_attempts INTEGER NOT NULL DEFAULT 0;

-- Drop the standalone status index: 'status' has only two values ('uploading','complete'),
-- so it is too low-cardinality to help. The file-list query is fully served by the partial
-- composite idx_files_user_created_complete above.
DROP INDEX IF EXISTS idx_files_status;

-- Envelope encryption: per-file Content Encryption Key, wrapped (encrypted) with
-- the passphrase-derived key, base64-encoded. Empty for legacy files encrypted
-- directly with the passphrase-derived key.
ALTER TABLE files ADD COLUMN IF NOT EXISTS wrapped_cek TEXT NOT NULL DEFAULT '';

-- Migrate email_tokens kind constraint for magic links
ALTER TABLE email_tokens DROP CONSTRAINT IF EXISTS email_tokens_kind_check;
ALTER TABLE email_tokens ADD CONSTRAINT email_tokens_kind_check
	CHECK (kind IN ('verify', 'reset', 'magic_link'));

-- Migrate platform_tokens platform constraint to allow telegram
ALTER TABLE platform_tokens DROP CONSTRAINT IF EXISTS platform_tokens_platform_check;
ALTER TABLE platform_tokens ADD CONSTRAINT platform_tokens_platform_check
	CHECK (platform IN ('github', 'gitlab', 'huggingface', 'telegram'));

-- Refresh token client binding (IP + User-Agent)
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS ip TEXT NOT NULL DEFAULT '';
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS user_agent TEXT NOT NULL DEFAULT '';

-- Token version for JWT revocation
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- User feedback
CREATE TABLE IF NOT EXISTS feedback (
	id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	rating     INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
	message    TEXT NOT NULL DEFAULT '',
	context    TEXT NOT NULL DEFAULT '',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_time ON feedback(created_at DESC);

-- File sharing via public links
CREATE TABLE IF NOT EXISTS shares (
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	file_id         UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
	user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token           TEXT NOT NULL UNIQUE,
	password_hash   TEXT NOT NULL DEFAULT '',
	wrapped_cek     TEXT NOT NULL DEFAULT '',
	expires_at      TIMESTAMPTZ,
	max_downloads   INTEGER NOT NULL DEFAULT 0,
	download_count  INTEGER NOT NULL DEFAULT 0,
	revoked         BOOLEAN NOT NULL DEFAULT FALSE,
	created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token);
CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id);
CREATE INDEX IF NOT EXISTS idx_shares_file ON shares(file_id);

-- Envelope-encryption: the file's CEK wrapped under the share's random key
-- (the key itself travels only in the share URL fragment, never to the server).
ALTER TABLE shares ADD COLUMN IF NOT EXISTS wrapped_cek TEXT NOT NULL DEFAULT '';

-- Anonymous encrypted file sharing (zcrypt Send)
CREATE TABLE IF NOT EXISTS send_transfers (
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	token           TEXT NOT NULL UNIQUE,
	original_name   TEXT NOT NULL,
	original_size   BIGINT NOT NULL,
	encrypted_size  BIGINT NOT NULL DEFAULT 0,
	chunk_count     INTEGER NOT NULL,
	sha256          TEXT NOT NULL DEFAULT '',
	salt            BYTEA NOT NULL DEFAULT '',
	status          TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'complete', 'expired')),
	burn_after_read BOOLEAN NOT NULL DEFAULT FALSE,
	max_downloads   INTEGER NOT NULL DEFAULT 0,
	download_count  INTEGER NOT NULL DEFAULT 0,
	expires_at      TIMESTAMPTZ NOT NULL,
	sender_ip       TEXT NOT NULL DEFAULT '',
	created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_send_transfers_token ON send_transfers(token);
CREATE INDEX IF NOT EXISTS idx_send_transfers_expires ON send_transfers(expires_at);
CREATE INDEX IF NOT EXISTS idx_send_transfers_status ON send_transfers(status);

CREATE TABLE IF NOT EXISTS send_chunks (
	id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	transfer_id UUID NOT NULL REFERENCES send_transfers(id) ON DELETE CASCADE,
	idx         INTEGER NOT NULL,
	size        BIGINT NOT NULL,
	sha256      TEXT NOT NULL,
	platform    TEXT NOT NULL,
	account     TEXT NOT NULL DEFAULT '',
	repo        TEXT NOT NULL,
	remote_path TEXT NOT NULL,
	compressed  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_send_chunks_transfer ON send_chunks(transfer_id);

-- Encrypted text pads (zcrypt Pad)
CREATE TABLE IF NOT EXISTS pads (
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	token           TEXT NOT NULL UNIQUE,
	encrypted_blob  BYTEA NOT NULL,
	content_size    INTEGER NOT NULL,
	burn_after_read BOOLEAN NOT NULL DEFAULT FALSE,
	view_count      INTEGER NOT NULL DEFAULT 0,
	expires_at      TIMESTAMPTZ NOT NULL,
	creator_ip      TEXT NOT NULL DEFAULT '',
	created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pads_token ON pads(token);
CREATE INDEX IF NOT EXISTS idx_pads_expires ON pads(expires_at);

-- Clipboard sync (authenticated, per-user)
CREATE TABLE IF NOT EXISTS clipboard_items (
	id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	content_type   TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'link')),
	encrypted_blob BYTEA NOT NULL,
	content_size   INTEGER NOT NULL,
	created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clipboard_user ON clipboard_items(user_id, created_at DESC);

-- Selective folder sync configuration
CREATE TABLE IF NOT EXISTS sync_folders (
	id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	folder_path TEXT NOT NULL,
	label       TEXT NOT NULL DEFAULT '',
	device_name TEXT NOT NULL DEFAULT '',
	enabled     BOOLEAN NOT NULL DEFAULT TRUE,
	last_synced TIMESTAMPTZ,
	file_count  INTEGER NOT NULL DEFAULT 0,
	total_size  BIGINT NOT NULL DEFAULT 0,
	created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE(user_id, folder_path, device_name)
);

CREATE INDEX IF NOT EXISTS idx_sync_folders_user ON sync_folders(user_id);

-- Plausible deniability: decoy vault
CREATE TABLE IF NOT EXISTS decoy_vaults (
	id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
	decoy_password_hash TEXT NOT NULL,
	enabled           BOOLEAN NOT NULL DEFAULT TRUE,
	created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS decoy_files (
	id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name        TEXT NOT NULL,
	size        BIGINT NOT NULL DEFAULT 0,
	created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decoy_files_user ON decoy_files(user_id);

-- Dead man's switch
CREATE TABLE IF NOT EXISTS dead_man_switches (
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
	contact_email   TEXT NOT NULL,
	contact_name    TEXT NOT NULL DEFAULT '',
	timeout_days    INTEGER NOT NULL DEFAULT 90,
	message         TEXT NOT NULL DEFAULT '',
	include_files   BOOLEAN NOT NULL DEFAULT FALSE,
	enabled         BOOLEAN NOT NULL DEFAULT TRUE,
	last_checkin    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	triggered       BOOLEAN NOT NULL DEFAULT FALSE,
	triggered_at    TIMESTAMPTZ,
	created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Expiring vaults
CREATE TABLE IF NOT EXISTS expiring_vaults (
	id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name        TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	expires_at  TIMESTAMPTZ NOT NULL,
	expired     BOOLEAN NOT NULL DEFAULT FALSE,
	file_ids    TEXT[] NOT NULL DEFAULT '{}',
	created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expiring_vaults_user ON expiring_vaults(user_id);
CREATE INDEX IF NOT EXISTS idx_expiring_vaults_expires ON expiring_vaults(expires_at);

-- Secure notes (encrypted markdown)
CREATE TABLE IF NOT EXISTS notes (
	id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	encrypted_title BYTEA NOT NULL DEFAULT '',
	encrypted_body  BYTEA NOT NULL DEFAULT '',
	content_size   INTEGER NOT NULL DEFAULT 0,
	tags           TEXT[] NOT NULL DEFAULT '{}',
	pinned         BOOLEAN NOT NULL DEFAULT FALSE,
	created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);

-- File integrity monitor (hash snapshots)
CREATE TABLE IF NOT EXISTS integrity_snapshots (
	id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	file_id   UUID NOT NULL,
	file_name TEXT NOT NULL,
	sha256    TEXT NOT NULL,
	size      BIGINT NOT NULL,
	status    TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'changed', 'missing')),
	checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integrity_user ON integrity_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_integrity_file ON integrity_snapshots(file_id);

-- Vault snapshots (time travel / point-in-time)
CREATE TABLE IF NOT EXISTS vault_snapshots (
	id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	label       TEXT NOT NULL DEFAULT '',
	file_count  INTEGER NOT NULL DEFAULT 0,
	total_size  BIGINT NOT NULL DEFAULT 0,
	file_ids    TEXT[] NOT NULL DEFAULT '{}',
	created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_snapshots_user ON vault_snapshots(user_id);

-- Shared vaults (team collaboration)
CREATE TABLE IF NOT EXISTS shared_vaults (
	id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	name        TEXT NOT NULL,
	owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	description TEXT NOT NULL DEFAULT '',
	file_ids    TEXT[] NOT NULL DEFAULT '{}',
	created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_vaults_owner ON shared_vaults(owner_id);

CREATE TABLE IF NOT EXISTS shared_vault_members (
	id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	vault_id  UUID NOT NULL REFERENCES shared_vaults(id) ON DELETE CASCADE,
	user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	role      TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'admin')),
	joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE(vault_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_vault_members_vault ON shared_vault_members(vault_id);
CREATE INDEX IF NOT EXISTS idx_shared_vault_members_user ON shared_vault_members(user_id);

-- Offline vault (pinned files for offline access)
CREATE TABLE IF NOT EXISTS offline_pins (
	id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	file_id   UUID NOT NULL,
	device_id TEXT NOT NULL DEFAULT '',
	pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE(user_id, file_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_offline_pins_user ON offline_pins(user_id);

-- Nested folders + trash (soft-delete) + encrypted names.
-- encrypted_name holds a client-side-encrypted (base64) name; the server never decrypts it.
-- parent_id NULL = root folder; deleted_at NULL = live, non-null = in trash.
CREATE TABLE IF NOT EXISTS folders (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id      UUID REFERENCES folders(id) ON DELETE CASCADE,
    encrypted_name TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

ALTER TABLE files ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
ALTER TABLE files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE files ADD COLUMN IF NOT EXISTS encrypted_name TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);

-- Optional per-folder password protection (zero-knowledge). Both nullable; NULL = unprotected
-- (behaves exactly as today). The server stores ONLY opaque client-computed base64 blobs and
-- never derives, sees, or logs the folder password or any key.
--   pw_salt     = random per-folder salt (base64) used to derive the folder-password KEK client-side.
--   pw_verifier = base64 AES-256-GCM ciphertext of a fixed constant under that KEK, used by the
--                 client to verify a typed password locally (no server round-trip).
-- A folder is "protected" iff pw_salt IS NOT NULL.
ALTER TABLE folders ADD COLUMN IF NOT EXISTS pw_salt TEXT;
ALTER TABLE folders ADD COLUMN IF NOT EXISTS pw_verifier TEXT;

-- Per-device UI preferences (color theme + light/dark mode). Keyed by a
-- client-generated device_id so each device keeps its own look ("per-device
-- set, per-device consistent"). Display-only and non-sensitive; one row per
-- (user, device).
CREATE TABLE IF NOT EXISTS device_preferences (
	user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	device_id   TEXT NOT NULL,
	color_theme TEXT NOT NULL DEFAULT 'default',
	mode        TEXT NOT NULL DEFAULT 'system',
	updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	PRIMARY KEY (user_id, device_id)
);

-- Per-user X25519 keypair for zero-knowledge sharing. The server stores the
-- PUBLIC key (public by design) plus the private key ONLY as ciphertext
-- (wrapped_private_key), encrypted client-side under the user's
-- passphrase-derived key — the server can never read it. fingerprint is a
-- short public hash of public_key for out-of-band verification (MITM defense).
CREATE TABLE IF NOT EXISTS user_keys (
	user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	public_key          TEXT NOT NULL,
	wrapped_private_key TEXT NOT NULL,
	kdf_salt            TEXT NOT NULL,
	fingerprint         TEXT NOT NULL,
	created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`
