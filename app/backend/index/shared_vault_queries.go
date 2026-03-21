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

	// Add owner as admin member
	_, err = db.pool.Exec(ctx, `
		INSERT INTO shared_vault_members (vault_id, user_id, role) VALUES ($1, $2, 'admin')`,
		vault.ID, ownerID)
	return vault, err
}

// ListSharedVaults returns all vaults the user is a member of.
func (db *DB) ListSharedVaults(ctx context.Context, userID string) ([]types.SharedVault, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT sv.id, sv.name, sv.owner_id, sv.description, sv.file_ids, sv.created_at, sv.updated_at
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
		if err := rows.Scan(&v.ID, &v.Name, &v.OwnerID, &v.Description, &v.FileIDs, &v.CreatedAt, &v.UpdatedAt); err != nil {
			return nil, err
		}
		vaults = append(vaults, v)
	}
	return vaults, nil
}

// GetSharedVault returns a shared vault with members (only if user is a member).
func (db *DB) GetSharedVault(ctx context.Context, userID, vaultID string) (*types.SharedVaultDetail, error) {
	// Check membership
	var memberRole string
	err := db.pool.QueryRow(ctx, `
		SELECT role FROM shared_vault_members WHERE vault_id = $1 AND user_id = $2`, vaultID, userID).Scan(&memberRole)
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

	// Get members
	rows, err := db.pool.Query(ctx, `
		SELECT svm.id, svm.vault_id, svm.user_id, u.username, u.email, svm.role, svm.joined_at
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
		if err := rows.Scan(&m.ID, &m.VaultID, &m.UserID, &m.Username, &m.Email, &m.Role, &m.JoinedAt); err != nil {
			return nil, err
		}
		vault.Members = append(vault.Members, m)
	}
	return vault, nil
}

// AddSharedVaultMember adds a user to a shared vault by email.
func (db *DB) AddSharedVaultMember(ctx context.Context, vaultID, email, role string) (*types.SharedVaultMember, error) {
	member := &types.SharedVaultMember{}
	err := db.pool.QueryRow(ctx, `
		WITH target_user AS (
			SELECT id, username, email FROM users WHERE email = $2
		)
		INSERT INTO shared_vault_members (vault_id, user_id, role)
		SELECT $1, tu.id, $3 FROM target_user tu
		RETURNING id, vault_id, user_id, role, joined_at`,
		vaultID, email, role,
	).Scan(&member.ID, &member.VaultID, &member.UserID, &member.Role, &member.JoinedAt)
	if err != nil {
		return nil, err
	}
	// Fill in username/email
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
