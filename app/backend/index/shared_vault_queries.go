package index

import (
	"context"

	"github.com/zcrypt/zcrypt/types"
)

// CreateSharedVault creates a new shared vault.
func (db *DB) CreateSharedVault(ctx context.Context, ownerID string, req types.SharedVaultRequest) (*types.SharedVault, error) {
	vault := &types.SharedVault{}
	err := db.pool.QueryRow(ctx, `
		INSERT INTO shared_vaults (name, owner_id, description, file_ids)
		VALUES ($1, $2, $3, $4)
		RETURNING id, name, owner_id, description, file_ids, created_at, updated_at`,
		req.Name, ownerID, req.Description, req.FileIDs,
	).Scan(&vault.ID, &vault.Name, &vault.OwnerID, &vault.Description, &vault.FileIDs, &vault.CreatedAt, &vault.UpdatedAt)
	if err != nil {
		return nil, err
	}

	// Add owner as admin member, with the space key sealed to their own key.
	_, err = db.pool.Exec(ctx, `
		INSERT INTO shared_vault_members (vault_id, user_id, role, wrapped_space_key) VALUES ($1, $2, 'admin', $3)`,
		vault.ID, ownerID, req.WrappedSpaceKey)
	return vault, err
}

// ListSharedVaults returns all vaults the user is a member of, each carrying
// the CALLER's own key grant + role so the client can unwrap the space key.
func (db *DB) ListSharedVaults(ctx context.Context, userID string) ([]types.SharedVault, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT sv.id, sv.name, sv.owner_id, sv.description, sv.file_ids, sv.created_at, sv.updated_at,
		       svm.wrapped_space_key, svm.role
		FROM shared_vaults sv
		JOIN shared_vault_members svm ON sv.id = svm.vault_id
		WHERE svm.user_id = $1
		ORDER BY sv.updated_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var vaults []types.SharedVault
	for rows.Next() {
		var v types.SharedVault
		if err := rows.Scan(&v.ID, &v.Name, &v.OwnerID, &v.Description, &v.FileIDs, &v.CreatedAt, &v.UpdatedAt, &v.WrappedSpaceKey, &v.Role); err != nil {
			return nil, err
		}
		vaults = append(vaults, v)
	}
	return vaults, nil
}

// GetSharedVault returns a shared vault with members (only if user is a member).
func (db *DB) GetSharedVault(ctx context.Context, userID, vaultID string) (*types.SharedVaultDetail, error) {
	// Check membership + capture the caller's own key grant.
	var memberRole, callerWrappedKey string
	err := db.pool.QueryRow(ctx, `
		SELECT role, wrapped_space_key FROM shared_vault_members WHERE vault_id = $1 AND user_id = $2`,
		vaultID, userID).Scan(&memberRole, &callerWrappedKey)
	if err != nil {
		return nil, err
	}

	vault := &types.SharedVaultDetail{}
	err = db.pool.QueryRow(ctx, `
		SELECT id, name, owner_id, description, file_ids, created_at, updated_at
		FROM shared_vaults WHERE id = $1`, vaultID,
	).Scan(&vault.ID, &vault.Name, &vault.OwnerID, &vault.Description, &vault.FileIDs, &vault.CreatedAt, &vault.UpdatedAt)
	if err != nil {
		return nil, err
	}
	vault.Role = memberRole
	vault.WrappedSpaceKey = callerWrappedKey

	// Get members (each member's own wrapped key is included for admin views).
	rows, err := db.pool.Query(ctx, `
		SELECT svm.id, svm.vault_id, svm.user_id, u.username, u.email, svm.role, svm.joined_at, svm.wrapped_space_key
		FROM shared_vault_members svm
		JOIN users u ON svm.user_id = u.id
		WHERE svm.vault_id = $1
		ORDER BY svm.joined_at`, vaultID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var m types.SharedVaultMember
		if err := rows.Scan(&m.ID, &m.VaultID, &m.UserID, &m.Username, &m.Email, &m.Role, &m.JoinedAt, &m.WrappedSpaceKey); err != nil {
			return nil, err
		}
		vault.Members = append(vault.Members, m)
	}
	return vault, nil
}

// AddSharedVaultMember adds (or re-grants) a user to a shared vault by email,
// storing the space key sealed to that user's public key. Re-inviting updates
// the role + key grant (supports key rotation / role changes).
func (db *DB) AddSharedVaultMember(ctx context.Context, vaultID, email, role, wrappedSpaceKey string) (*types.SharedVaultMember, error) {
	member := &types.SharedVaultMember{}
	err := db.pool.QueryRow(ctx, `
		WITH target_user AS (
			SELECT id FROM users WHERE email = $2
		)
		INSERT INTO shared_vault_members (vault_id, user_id, role, wrapped_space_key)
		SELECT $1, tu.id, $3, $4 FROM target_user tu
		ON CONFLICT (vault_id, user_id)
		DO UPDATE SET role = EXCLUDED.role, wrapped_space_key = EXCLUDED.wrapped_space_key
		RETURNING id, vault_id, user_id, role, joined_at, wrapped_space_key`,
		vaultID, email, role, wrappedSpaceKey,
	).Scan(&member.ID, &member.VaultID, &member.UserID, &member.Role, &member.JoinedAt, &member.WrappedSpaceKey)
	if err != nil {
		return nil, err
	}
	member.Email = email
	return member, nil
}

// RemoveSharedVaultMember removes a user from a shared vault.
func (db *DB) RemoveSharedVaultMember(ctx context.Context, vaultID, memberUserID string) error {
	_, err := db.pool.Exec(ctx, `
		DELETE FROM shared_vault_members WHERE vault_id = $1 AND user_id = $2`, vaultID, memberUserID)
	return err
}

// UpdateSharedVaultFiles updates the file list of a shared vault.
func (db *DB) UpdateSharedVaultFiles(ctx context.Context, vaultID string, fileIDs []string) error {
	_, err := db.pool.Exec(ctx, `
		UPDATE shared_vaults SET file_ids = $2, updated_at = NOW() WHERE id = $1`, vaultID, fileIDs)
	return err
}

// DeleteSharedVault deletes a shared vault (owner only).
func (db *DB) DeleteSharedVault(ctx context.Context, ownerID, vaultID string) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM shared_vaults WHERE id = $1 AND owner_id = $2`, vaultID, ownerID)
	return err
}

// IsSharedVaultMember checks if user is a member with at least the given role.
func (db *DB) IsSharedVaultMember(ctx context.Context, vaultID, userID string) (string, error) {
	var role string
	err := db.pool.QueryRow(ctx, `
		SELECT role FROM shared_vault_members WHERE vault_id = $1 AND user_id = $2`, vaultID, userID).Scan(&role)
	return role, err
}

// AddSharedVaultFile registers a file in a space with its CEK re-wrapped under
// the space key. Idempotent (re-adding updates the wrapped CEK, e.g. after a
// key rotation). Also mirrors the file id into shared_vaults.file_ids so the
// existing metadata listing stays in sync. Caller must already be authorized as
// an editor/admin member of the vault (enforced at the handler).
func (db *DB) AddSharedVaultFile(ctx context.Context, vaultID, fileID, addedBy, wrappedCEK string) error {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		INSERT INTO shared_vault_files (vault_id, file_id, wrapped_cek, added_by)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (vault_id, file_id) DO UPDATE SET wrapped_cek = EXCLUDED.wrapped_cek`,
		vaultID, fileID, wrappedCEK, addedBy); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE shared_vaults SET file_ids = array_append(file_ids, $2), updated_at = NOW()
		WHERE id = $1 AND NOT ($2 = ANY(file_ids))`, vaultID, fileID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// RemoveSharedVaultFile unshares a file from a space (removes the space-wrapped
// CEK and the file_ids mirror). Caller must be an editor/admin of the vault.
func (db *DB) RemoveSharedVaultFile(ctx context.Context, vaultID, fileID string) error {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		DELETE FROM shared_vault_files WHERE vault_id = $1 AND file_id = $2`, vaultID, fileID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE shared_vaults SET file_ids = array_remove(file_ids, $2), updated_at = NOW()
		WHERE id = $1`, vaultID, fileID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// MemberSpaceFileGrant authorizes a member to read a shared file WITHOUT
// loosening owner scoping. It returns a grant only if the caller is a member of
// some space that contains the file: the space-wrapped CEK (which the caller
// unwraps with the space key) and the file OWNER's id (used to resolve chunks +
// storage backend through the owner). Returns pgx.ErrNoRows when the caller has
// no such grant, which callers treat as a plain not-found (no info leak).
func (db *DB) MemberSpaceFileGrant(ctx context.Context, userID, fileID string) (*types.SpaceFileGrant, error) {
	g := &types.SpaceFileGrant{}
	err := db.pool.QueryRow(ctx, `
		SELECT f.user_id, svf.wrapped_cek
		FROM shared_vault_files svf
		JOIN shared_vault_members svm ON svm.vault_id = svf.vault_id AND svm.user_id = $1
		JOIN files f ON f.id = svf.file_id
		WHERE svf.file_id = $2
		LIMIT 1`, userID, fileID,
	).Scan(&g.OwnerID, &g.WrappedCEK)
	if err != nil {
		return nil, err
	}
	return g, nil
}
