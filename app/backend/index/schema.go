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

-- user_id is nullable and detached from the user cascade (SET NULL): queued
-- platform deletions must survive account deletion, or every chunk the user
-- ever stored orphans on the platforms the moment the users row goes away.
CREATE TABLE IF NOT EXISTS pending_deletions (
	id          BIGSERIAL PRIMARY KEY,
	user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
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

-- Tamper-evident audit log: each event carries a monotonic seq and a hash that
-- chains the previous event's hash (hash = sha256(prev_hash || canonical fields)).
-- Editing or deleting any row breaks the chain from that point on, which a verify
-- sweep detects — so even someone with DB write access can't silently rewrite
-- history. Inserts serialize on an advisory lock (see InsertAuditEvent) to keep
-- the chain linear. Pre-existing rows are backfilled a seq for stable ordering
-- but keep an empty hash (legacy, pre-chain — not retroactively verifiable).
-- The audit log must be immutable and outlive the users it references. The
-- original FK used ON DELETE SET NULL, so deleting a user REWROTE user_id on
-- their audit rows — which both destroys accountability AND (now that user_id
-- is hashed) silently breaks the tamper-evidence chain for a legitimate reason.
-- Drop the FK: audit rows retain the actor id verbatim even after the user row
-- is gone. (user_id is a UUID, not PII; retaining it is the point of an audit log.)
ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_user_id_fkey;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS seq BIGINT;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS prev_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS hash TEXT NOT NULL DEFAULT '';
UPDATE audit_events a SET seq = o.rn FROM (
	SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM audit_events WHERE seq IS NULL
) o WHERE a.id = o.id AND a.seq IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_events_seq ON audit_events(seq);

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
	-- Plaintext chunk size the client is slicing with, so a cross-device resume
	-- can rebuild identical chunk boundaries. 0 = unknown (legacy client).
	chunk_size      BIGINT NOT NULL DEFAULT 0,
	uploaded_chunks INTEGER NOT NULL DEFAULT 0,
	status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'complete', 'cancelled')),
	created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	-- Incomplete uploads are kept for 7 days so an interrupted multi-GB upload
	-- stays resumable, instead of evaporating overnight.
	expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days'
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

-- Planned remote path: the disguised path the sync worker WILL upload a chunk to,
-- recorded BEFORE the upload call. remote_path is only set AFTER a successful
-- upload (it doubles as the "synced" sentinel), so without this a crash between
-- adapter.Upload succeeding and the remote_path write would strand the blob on the
-- platform with no DB record of its (random) path — a permanent, untrackable
-- orphan. With planned_remote_path persisted first, deletion can always locate the
-- blob via COALESCE(NULLIF(remote_path,''), planned_remote_path), so a crash-window
-- blob is still cleaned up on purge. Deleting a planned-but-never-uploaded path is
-- a harmless no-op (adapters treat a missing blob as a successful delete).
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS planned_remote_path TEXT NOT NULL DEFAULT '';

-- Drop the standalone status index: 'status' has only two values ('uploading','complete'),
-- so it is too low-cardinality to help. The file-list query is fully served by the partial
-- composite idx_files_user_created_complete above.
DROP INDEX IF EXISTS idx_files_status;

-- Envelope encryption: per-file Content Encryption Key, wrapped (encrypted) with
-- the passphrase-derived key, base64-encoded. Empty for legacy files encrypted
-- directly with the passphrase-derived key.
ALTER TABLE files ADD COLUMN IF NOT EXISTS wrapped_cek TEXT NOT NULL DEFAULT '';

-- Content-hash scheme discriminator. 'plain' = files.sha256 is SHA-256 of the
-- PLAINTEXT (legacy — lets anyone with DB access confirm a user stores a known
-- file: the confirmation-of-file leak). 'hmac_v1' = a per-user keyed MAC
-- (HMAC-SHA256 under a passphrase-derived key) the client computes; it stays
-- deterministic per (user, passphrase, content) so single-user dedup/resume
-- still matches on sha256+size, but a passphrase-less DB attacker cannot compute
-- it for a known file. DEFAULT 'plain' labels every existing row as legacy with
-- no backfill (the server is zero-knowledge and cannot recompute old hashes).
-- Values are intentionally unconstrained so a future hmac_v2 needs no migration.
ALTER TABLE files ADD COLUMN IF NOT EXISTS sha256_scheme TEXT NOT NULL DEFAULT 'plain';
ALTER TABLE upload_sessions ADD COLUMN IF NOT EXISTS sha256_scheme TEXT NOT NULL DEFAULT 'plain';

-- Migrate email_tokens kind constraint for magic links
ALTER TABLE email_tokens DROP CONSTRAINT IF EXISTS email_tokens_kind_check;
ALTER TABLE email_tokens ADD CONSTRAINT email_tokens_kind_check
	CHECK (kind IN ('verify', 'reset', 'magic_link'));

-- Keep incomplete uploads resumable for 7 days (was 24h) so an interrupted
-- large upload isn't auto-deleted overnight. Applies to newly-created sessions.
ALTER TABLE upload_sessions ALTER COLUMN expires_at SET DEFAULT NOW() + INTERVAL '7 days';

-- Migrate platform_tokens platform constraint to allow telegram
ALTER TABLE platform_tokens DROP CONSTRAINT IF EXISTS platform_tokens_platform_check;
ALTER TABLE platform_tokens ADD CONSTRAINT platform_tokens_platform_check
	CHECK (platform IN ('github', 'gitlab', 'huggingface', 'telegram'));

-- Server-authoritative upload resume: persist the client's plaintext chunk size
-- on the session so a resume from any device slices the file identically.
ALTER TABLE upload_sessions ADD COLUMN IF NOT EXISTS chunk_size BIGINT NOT NULL DEFAULT 0;

-- Zero-knowledge file names: the client-encrypted (base64) name, mirrored onto
-- the session so a cross-device resume and the "unfinished uploads" UI carry it.
-- files.encrypted_name already exists (see the folders/files name-encryption
-- column). '' = legacy plaintext-name upload (original_name/filename populated).
ALTER TABLE upload_sessions ADD COLUMN IF NOT EXISTS encrypted_name TEXT NOT NULL DEFAULT '';

-- pending_deletions must survive account deletion (queued platform deletions are
-- the ONLY remaining reference to the user's remote chunks once the users row is
-- gone). Replace the ON DELETE CASCADE FK with ON DELETE SET NULL and drop the
-- NOT NULL so orphaned queue items (and send-transfer deletions, which have no
-- user) are representable. Same drop-and-recreate pattern as the CHECK
-- constraints above; both statements are no-op-safe on an already-migrated DB.
ALTER TABLE pending_deletions DROP CONSTRAINT IF EXISTS pending_deletions_user_id_fkey;
ALTER TABLE pending_deletions ADD CONSTRAINT pending_deletions_user_id_fkey
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE pending_deletions ALTER COLUMN user_id DROP NOT NULL;

-- Refresh token client binding (IP + User-Agent)
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS ip TEXT NOT NULL DEFAULT '';
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS user_agent TEXT NOT NULL DEFAULT '';

-- Token version for JWT revocation
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- TOTP replay protection: the last accepted time-step counter (RFC 6238 §5.2).
-- A code is one-time-use — verification only succeeds if its counter is
-- strictly greater than this value.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_counter BIGINT NOT NULL DEFAULT 0;

-- One-time 2FA recovery codes. Only the sha256 hash is stored; the plaintext is
-- shown to the user once at enable/regenerate. A code is consumed by setting
-- used_at, so it can never be replayed. Rows are cleared when 2FA is disabled.
CREATE TABLE IF NOT EXISTS totp_backup_codes (
	id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	code_hash  TEXT NOT NULL,
	used_at    TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_totp_backup_codes_user ON totp_backup_codes(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_totp_backup_codes_user_hash ON totp_backup_codes(user_id, code_hash);

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

-- Per-member key grant: the space's symmetric key sealed (ECIES) to this
-- member's X25519 public key, base64. Opaque to the server; only the member's
-- private key can open it. Empty for legacy metadata-only memberships.
ALTER TABLE shared_vault_members ADD COLUMN IF NOT EXISTS wrapped_space_key TEXT NOT NULL DEFAULT '';

-- Files shared into a space, each with its CEK re-wrapped under the SPACE KEY
-- (not the owner's vault key), so any member can unwrap it with the space key
-- and decrypt the file. wrapped_cek is opaque base64; the server never sees the
-- space key or the plaintext CEK. This is what makes a shared file readable by
-- members without ever exposing the owner's vault passphrase. The owning file
-- (and its chunks) stays owner-scoped; membership here only grants read access
-- routed through the owner's storage backend.
CREATE TABLE IF NOT EXISTS shared_vault_files (
	vault_id    UUID NOT NULL REFERENCES shared_vaults(id) ON DELETE CASCADE,
	file_id     UUID NOT NULL,
	wrapped_cek TEXT NOT NULL,
	added_by    UUID REFERENCES users(id) ON DELETE SET NULL,
	added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	PRIMARY KEY (vault_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_vault_files_file ON shared_vault_files(file_id);

-- Optional per-space size cap (sum of shared files' original sizes). 0 = no limit.
ALTER TABLE shared_vaults ADD COLUMN IF NOT EXISTS size_limit_bytes BIGINT NOT NULL DEFAULT 0;

-- Public folder share links. Mirrors single-file shares (shares table) but for a
-- whole folder: one random folder-share key (kept only in the URL #fragment,
-- never sent here) wraps each contained file's CEK. Anyone with the link + key
-- can open it — no account needed — exactly like a file link. The name column is
-- a plaintext label the sharer supplies for the public page (folder names are
-- otherwise E2E-encrypted and opaque to the server).
CREATE TABLE IF NOT EXISTS folder_shares (
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	-- Soft reference to the source folder (no FK: the folders table is created
	-- later in this schema, and a stale id is harmless — the share stands on its
	-- own folder_share_files rows).
	folder_id       UUID,
	user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name            TEXT NOT NULL DEFAULT '',
	token           TEXT NOT NULL UNIQUE,
	password_hash   TEXT NOT NULL DEFAULT '',
	expires_at      TIMESTAMPTZ,
	max_downloads   INTEGER NOT NULL DEFAULT 0,
	download_count  INTEGER NOT NULL DEFAULT 0,
	revoked         BOOLEAN NOT NULL DEFAULT FALSE,
	created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folder_shares_token ON folder_shares(token);
CREATE INDEX IF NOT EXISTS idx_folder_shares_user ON folder_shares(user_id);

-- Files carried by a folder share, each with its CEK re-wrapped under the
-- folder-share key (opaque base64). The file (and its chunks) stays owner-scoped;
-- the share only grants read access routed through the owner's storage backend.
CREATE TABLE IF NOT EXISTS folder_share_files (
	folder_share_id UUID NOT NULL REFERENCES folder_shares(id) ON DELETE CASCADE,
	file_id         UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
	wrapped_cek     TEXT NOT NULL,
	PRIMARY KEY (folder_share_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_folder_share_files_file ON folder_share_files(file_id);

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

` + dedupeChunksSQL

// dedupeChunksSQL collapses chunk rows to exactly one per (file_id, idx) and then
// enforces it with a unique index. It is appended to schemaSQL (so it runs at
// every boot) but kept as its own const so it is individually testable — a test
// can drop the index, plant duplicates, and re-run this to assert the behavior.
//
// A racy check-then-insert historically allowed a second row for the same index,
// which over-counted uploaded_chunks (>100% progress) and could mask a missing
// index at completion. Keep the most-likely-valid duplicate: prefer a non-empty
// remote_path (a synced locator over a pending/broken one), then the larger size,
// then a stable chunk_id. Idempotent — after the first run there are no duplicates
// left and the index creation is a no-op.
//
// The losing duplicates were often ALSO synced (the sync worker uploads every
// pending row), so each may hold the only locator of a live platform blob. Queue
// those locators for deletion BEFORE dropping the rows — otherwise the blobs are
// stranded, irreversibly on Telegram where the remote_path (chat + message IDs)
// cannot be rediscovered by any sweep. Planned-but-unsynced paths are queued too
// for git platforms (a 404 delete is a no-op) but never for Telegram, whose
// planned paths are filenames the deletion worker cannot act on.
// DedupeChunksSQL exposes the chunk-dedupe migration statements for tests, which
// drop the unique index, plant duplicates, and re-run this to assert both the
// collapse and the loser-blob queueing (including the Telegram exclusion).
func DedupeChunksSQL() string { return dedupeChunksSQL }

const dedupeChunksSQL = `
INSERT INTO pending_deletions (user_id, platform, account, repo, remote_path)
SELECT c.user_id, c.platform, c.account, c.repo,
       CASE WHEN c.platform = 'telegram'
            THEN NULLIF(c.remote_path, '')
            ELSE COALESCE(NULLIF(c.remote_path, ''), NULLIF(c.planned_remote_path, ''))
       END
FROM chunks c
JOIN (
	SELECT chunk_id,
	       row_number() OVER (
	         PARTITION BY file_id, idx
	         ORDER BY (remote_path <> '') DESC, size DESC, chunk_id
	       ) AS rn
	FROM chunks
) ranked ON ranked.chunk_id = c.chunk_id
WHERE ranked.rn > 1
  AND CASE WHEN c.platform = 'telegram'
           THEN NULLIF(c.remote_path, '')
           ELSE COALESCE(NULLIF(c.remote_path, ''), NULLIF(c.planned_remote_path, ''))
      END IS NOT NULL;

DELETE FROM chunks c USING (
	SELECT chunk_id,
	       row_number() OVER (
	         PARTITION BY file_id, idx
	         ORDER BY (remote_path <> '') DESC, size DESC, chunk_id
	       ) AS rn
	FROM chunks
) ranked
WHERE c.chunk_id = ranked.chunk_id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chunks_file_idx ON chunks (file_id, idx);
`
