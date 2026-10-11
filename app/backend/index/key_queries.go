package index

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/zcrypt/zcrypt/types"
)

// GetUserKey returns the caller's own key record (including the wrapped private
// key), or (nil, nil) when they haven't published a keypair yet.
func (db *DB) GetUserKey(ctx context.Context, userID string) (*types.UserKey, error) {
	k := &types.UserKey{}
	err := db.pool.QueryRow(ctx, `
		SELECT user_id, public_key, wrapped_private_key, kdf_salt, fingerprint, wrapped_master_key, updated_at
		FROM user_keys WHERE user_id = $1`,
		userID,
	).Scan(&k.UserID, &k.PublicKey, &k.WrappedPrivateKey, &k.KDFSalt, &k.Fingerprint, &k.WrappedMasterKey, &k.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return k, nil
}

// UpsertUserKey publishes (or rotates) a user's keypair. The server stores the
// public key and the client-encrypted private key verbatim.
func (db *DB) UpsertUserKey(ctx context.Context, userID, publicKey, wrappedPrivateKey, kdfSalt, fingerprint string) error {
	_, err := db.pool.Exec(ctx, `
		INSERT INTO user_keys (user_id, public_key, wrapped_private_key, kdf_salt, fingerprint)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (user_id) DO UPDATE SET
			public_key = EXCLUDED.public_key,
			wrapped_private_key = EXCLUDED.wrapped_private_key,
			kdf_salt = EXCLUDED.kdf_salt,
			fingerprint = EXCLUDED.fingerprint,
			updated_at = NOW()`,
		userID, publicKey, wrappedPrivateKey, kdfSalt, fingerprint)
	return err
}

// SetWrappedMasterKey stores the account master key envelope exactly once. It
// returns (found, stored): found is false when the user has no key row; stored
// is false when a master key already exists (never overwritten).
func (db *DB) SetWrappedMasterKey(ctx context.Context, userID, wrapped string) (found, stored bool, err error) {
	tag, err := db.pool.Exec(ctx, `
		UPDATE user_keys SET wrapped_master_key = $2, updated_at = NOW()
		WHERE user_id = $1 AND wrapped_master_key = ''`, userID, wrapped)
	if err != nil {
		return false, false, err
	}
	if tag.RowsAffected() == 1 {
		return true, true, nil
	}
	var exists bool
	if err := db.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM user_keys WHERE user_id = $1)`, userID).Scan(&exists); err != nil {
		return false, false, err
	}
	return exists, false, nil
}

// GetAvatarForViewer returns the target's avatar data URI when the viewer is the
// target or shares a Space with them; ("", nil) otherwise (indistinguishable
// from no avatar).
func (db *DB) GetAvatarForViewer(ctx context.Context, viewerID, targetID string) (string, error) {
	var uri string
	err := db.pool.QueryRow(ctx, `
		SELECT u.avatar_url FROM users u
		WHERE u.id::text = $2 AND u.avatar_url <> ''
		  AND ($1 = $2 OR EXISTS (
		    SELECT 1 FROM shared_vault_members a
		    JOIN shared_vault_members b ON a.vault_id = b.vault_id
		    WHERE a.user_id::text = $1 AND b.user_id::text = $2))`,
		viewerID, targetID).Scan(&uri)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return uri, err
}

// ResolveUserPublicKey looks up a user's PUBLIC key by email OR username, so an
// admin can seal a shared-space key to them before inviting. Returns (nil, nil)
// when no such user exists or they haven't published a key.
func (db *DB) ResolveUserPublicKey(ctx context.Context, identifier string) (*types.PublicKey, error) {
	pk := &types.PublicKey{}
	err := db.pool.QueryRow(ctx, `
		SELECT u.id, k.public_key, k.fingerprint
		FROM users u JOIN user_keys k ON k.user_id = u.id
		WHERE u.email = $1 OR u.username = $1`,
		identifier,
	).Scan(&pk.UserID, &pk.PublicKey, &pk.Fingerprint)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return pk, nil
}

// GetPublicKey returns only the shareable public fields for a user, never the
// wrapped private key: for wrapping a space key to them.
func (db *DB) GetPublicKey(ctx context.Context, userID string) (*types.PublicKey, error) {
	pk := &types.PublicKey{}
	err := db.pool.QueryRow(ctx, `
		SELECT user_id, public_key, fingerprint FROM user_keys WHERE user_id = $1`,
		userID,
	).Scan(&pk.UserID, &pk.PublicKey, &pk.Fingerprint)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return pk, nil
}
