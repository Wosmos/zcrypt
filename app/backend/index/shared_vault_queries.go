package index

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/zcrypt/zcrypt/types"
)

// ErrRotationIncomplete means a re-key did not cover every member or file and
// was refused, because applying it would strand them on the old key.
var ErrRotationIncomplete = errors.New("rotation incomplete")

// ErrStaleSpaceKey means a write used a space key that a rotation has replaced.
var ErrStaleSpaceKey = errors.New("stale space key")

// lockKeyGeneration reads a space's key generation under a row lock and checks
// it against want (0 skips the check, for older clients). Writes take the lock
// FOR SHARE and rotation FOR UPDATE, so a write can't land between a rotation's
// read of the files and its commit.
func lockKeyGeneration(ctx context.Context, tx pgx.Tx, vaultID string, want int, forUpdate bool) error {
	q := `SELECT key_generation FROM shared_vaults WHERE id = $1 FOR SHARE`
	if forUpdate {
		q = `SELECT key_generation FROM shared_vaults WHERE id = $1 FOR UPDATE`
	}
	var gen int
	if err := tx.QueryRow(ctx, q, vaultID).Scan(&gen); err != nil {
		return err
	}
	if want != 0 && want != gen {
		return ErrStaleSpaceKey
	}
	return nil
}

// CreateSharedVault creates a new shared vault.
func (db *DB) CreateSharedVault(ctx context.Context, ownerID string, req types.SharedVaultRequest) (*types.SharedVault, error) {
	// file_ids is NOT NULL; a client that omits the field (nil slice) would
	// otherwise insert NULL and 500. Treat "no files" as an empty array.
	if req.FileIDs == nil {
		req.FileIDs = []string{}
	}
	vault := &types.SharedVault{}
	err := db.pool.QueryRow(ctx, `
		INSERT INTO shared_vaults (name, owner_id, description, file_ids, size_limit_bytes)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, name, owner_id, description, file_ids, created_at, updated_at, size_limit_bytes`,
		req.Name, ownerID, req.Description, req.FileIDs, req.SizeLimitBytes,
	).Scan(&vault.ID, &vault.Name, &vault.OwnerID, &vault.Description, &vault.FileIDs, &vault.CreatedAt, &vault.UpdatedAt, &vault.SizeLimitBytes)
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
		       svm.wrapped_space_key, svm.role, sv.size_limit_bytes, sv.needs_rotation, sv.key_generation,
		       (SELECT COUNT(*) FROM shared_vault_members m WHERE m.vault_id = sv.id AND m.status = 'active'),
		       (SELECT COUNT(*) FROM shared_vault_files f WHERE f.vault_id = sv.id),
		       COALESCE((SELECT SUM(fl.original_size) FROM shared_vault_files f
		                 JOIN files fl ON fl.id = f.file_id WHERE f.vault_id = sv.id), 0)
		FROM shared_vaults sv
		JOIN shared_vault_members svm ON sv.id = svm.vault_id
		WHERE svm.user_id = $1 AND svm.status = 'active'
		ORDER BY sv.updated_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var vaults []types.SharedVault
	ids := []string{}
	for rows.Next() {
		var v types.SharedVault
		if err := rows.Scan(&v.ID, &v.Name, &v.OwnerID, &v.Description, &v.FileIDs, &v.CreatedAt, &v.UpdatedAt,
			&v.WrappedSpaceKey, &v.Role, &v.SizeLimitBytes, &v.NeedsRotation, &v.KeyGeneration, &v.MemberCount, &v.FileCount, &v.UsedBytes); err != nil {
			return nil, err
		}
		vaults = append(vaults, v)
		ids = append(ids, v.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	if len(vaults) == 0 {
		return vaults, nil
	}

	prev, err := db.pool.Query(ctx, `
		SELECT m.vault_id::text, m.user_id::text, u.username, length(u.avatar_url) > 0, CASE WHEN u.avatar_url = '' THEN '' ELSE left(encode(sha256(convert_to(u.avatar_url, 'UTF8')), 'hex'), 16) END
		FROM shared_vault_members m JOIN users u ON u.id = m.user_id
		WHERE m.vault_id::text = ANY($1) AND m.status = 'active'
		ORDER BY m.joined_at`, ids)
	if err != nil {
		return nil, err
	}
	defer prev.Close()
	byVault := map[string][]types.SharedVaultPreview{}
	for prev.Next() {
		var vid string
		var p types.SharedVaultPreview
		if err := prev.Scan(&vid, &p.UserID, &p.Username, &p.HasAvatar, &p.AvatarVersion); err != nil {
			return nil, err
		}
		if len(byVault[vid]) < 4 {
			byVault[vid] = append(byVault[vid], p)
		}
	}
	if err := prev.Err(); err != nil {
		return nil, err
	}
	for i := range vaults {
		vaults[i].MemberPreview = byVault[vaults[i].ID]
	}
	return vaults, nil
}

// GetSharedVault returns a shared vault with members (only if user is a member).
func (db *DB) GetSharedVault(ctx context.Context, userID, vaultID string) (*types.SharedVaultDetail, error) {
	// Check membership + capture the caller's own key grant.
	var memberRole, callerWrappedKey string
	err := db.pool.QueryRow(ctx, `
		SELECT role, wrapped_space_key FROM shared_vault_members WHERE vault_id = $1 AND user_id = $2 AND status = 'active'`,
		vaultID, userID).Scan(&memberRole, &callerWrappedKey)
	if err != nil {
		return nil, err
	}

	vault := &types.SharedVaultDetail{}
	err = db.pool.QueryRow(ctx, `
		SELECT id, name, owner_id, description, file_ids, created_at, updated_at, size_limit_bytes, needs_rotation, key_generation
		FROM shared_vaults WHERE id = $1`, vaultID,
	).Scan(&vault.ID, &vault.Name, &vault.OwnerID, &vault.Description, &vault.FileIDs, &vault.CreatedAt, &vault.UpdatedAt, &vault.SizeLimitBytes, &vault.NeedsRotation, &vault.KeyGeneration)
	if err != nil {
		return nil, err
	}
	vault.Role = memberRole
	vault.WrappedSpaceKey = callerWrappedKey

	// Get members (each member's own wrapped key is included for admin views).
	// LEFT JOIN user_keys so a member's key fingerprint (for out-of-band
	// verification) rides along; empty when they've not set up a keypair yet.
	rows, err := db.pool.Query(ctx, `
		SELECT svm.id, svm.vault_id, svm.user_id, u.username, u.email, svm.role, svm.status, COALESCE(svm.invited_by::text, ''), svm.joined_at, svm.wrapped_space_key,
		       COALESCE(uk.fingerprint, ''), COALESCE(uk.public_key, ''),
		       length(u.avatar_url) > 0, CASE WHEN u.avatar_url = '' THEN '' ELSE left(encode(sha256(convert_to(u.avatar_url, 'UTF8')), 'hex'), 16) END
		FROM shared_vault_members svm
		JOIN users u ON svm.user_id = u.id
		LEFT JOIN user_keys uk ON uk.user_id = svm.user_id
		WHERE svm.vault_id = $1
		ORDER BY svm.joined_at`, vaultID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var m types.SharedVaultMember
		if err := rows.Scan(&m.ID, &m.VaultID, &m.UserID, &m.Username, &m.Email, &m.Role, &m.Status, &m.InvitedBy, &m.JoinedAt, &m.WrappedSpaceKey, &m.Fingerprint, &m.PublicKey, &m.HasAvatar, &m.AvatarVersion); err != nil {
			return nil, err
		}
		vault.Members = append(vault.Members, m)
	}

	// Shared files, each with its space-wrapped CEK (+ owner's name/size for display).
	files, err := db.ListSharedVaultFiles(ctx, vaultID)
	if err != nil {
		return nil, err
	}
	vault.Files = files
	return vault, nil
}

// ListSharedVaultFiles returns the files shared into a space, each with its
// space-wrapped CEK and the owner's file name/size (joined for member display).
func (db *DB) ListSharedVaultFiles(ctx context.Context, vaultID string) ([]types.SharedVaultFile, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT svf.file_id, svf.wrapped_cek, svf.wrapped_name, f.original_name, f.original_size, svf.added_at
		FROM shared_vault_files svf
		JOIN files f ON f.id = svf.file_id
		WHERE svf.vault_id = $1
		ORDER BY svf.added_at DESC`, vaultID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	files := []types.SharedVaultFile{}
	for rows.Next() {
		var f types.SharedVaultFile
		if err := rows.Scan(&f.FileID, &f.WrappedCEK, &f.WrappedName, &f.Name, &f.Size, &f.AddedAt); err != nil {
			return nil, err
		}
		files = append(files, f)
	}
	return files, rows.Err()
}

// ErrMemberExists means the user already has a membership row in the space.
var ErrMemberExists = errors.New("already a member")

// AddSharedVaultMember adds a user to a shared vault. With a wrapped space key
// the member is active at once; with an empty one they are pending until an
// owner/admin device seals the space key to them (CompleteSharedVaultMember).
// The WHERE clause forbids targeting the vault owner. ErrMemberExists is
// returned when a row already exists, so an invite never overwrites a grant.
func (db *DB) AddSharedVaultMember(ctx context.Context, vaultID, userID, invitedBy, role, wrappedSpaceKey string, gen int) (*types.SharedVaultMember, error) {
	status := "active"
	if wrappedSpaceKey == "" {
		status = "pending"
		gen = 0
	}
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := lockKeyGeneration(ctx, tx, vaultID, gen, false); err != nil {
		return nil, err
	}
	member := &types.SharedVaultMember{}
	err = tx.QueryRow(ctx, `
		INSERT INTO shared_vault_members (vault_id, user_id, role, wrapped_space_key, status, invited_by)
		SELECT $1, $2, $3, $4, $5, $6
		WHERE $2::uuid <> (SELECT owner_id FROM shared_vaults WHERE id = $1)
		ON CONFLICT (vault_id, user_id) DO NOTHING
		RETURNING id, vault_id, user_id, role, status, joined_at, wrapped_space_key`,
		vaultID, userID, role, wrappedSpaceKey, status, invitedBy,
	).Scan(&member.ID, &member.VaultID, &member.UserID, &member.Role, &member.Status, &member.JoinedAt, &member.WrappedSpaceKey)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMemberExists
	}
	if err != nil {
		return nil, err
	}
	member.InvitedBy = invitedBy
	return member, tx.Commit(ctx)
}

// SharedVaultMemberStatus returns a user's membership status in a space
// ("active", "pending"), or "" when they have no row.
func (db *DB) SharedVaultMemberStatus(ctx context.Context, vaultID, userID string) (string, error) {
	var status string
	err := db.pool.QueryRow(ctx, `
		SELECT status FROM shared_vault_members WHERE vault_id = $1 AND user_id = $2`, vaultID, userID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return status, err
}

// CompleteSharedVaultMember stores the space key grant for a pending member and
// activates them. It reports false when the member is not pending or the user
// has no published key, so a grant is never attached to a keyless account.
func (db *DB) CompleteSharedVaultMember(ctx context.Context, vaultID, userID, wrappedSpaceKey string, gen int) (*types.SharedVaultMember, error) {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := lockKeyGeneration(ctx, tx, vaultID, gen, false); err != nil {
		return nil, err
	}
	member := &types.SharedVaultMember{}
	err = tx.QueryRow(ctx, `
		UPDATE shared_vault_members SET status = 'active', wrapped_space_key = $3
		WHERE vault_id = $1 AND user_id = $2 AND status = 'pending'
		  AND EXISTS (SELECT 1 FROM user_keys WHERE user_id = $2)
		RETURNING id, vault_id, user_id, role, status, COALESCE(invited_by::text, ''), joined_at, wrapped_space_key`,
		vaultID, userID, wrappedSpaceKey,
	).Scan(&member.ID, &member.VaultID, &member.UserID, &member.Role, &member.Status, &member.InvitedBy, &member.JoinedAt, &member.WrappedSpaceKey)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return member, tx.Commit(ctx)
}

// PendingSpacesForUser lists the spaces where userID is invited but still
// waiting for a key hand-off.
func (db *DB) PendingSpacesForUser(ctx context.Context, userID string) ([]string, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT vault_id::text FROM shared_vault_members WHERE user_id = $1 AND status = 'pending'`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// RotateSharedVaultKeys atomically re-keys a space: it overwrites each listed
// member's wrapped space key and each listed file's wrapped CEK. Only rows that
// still exist are updated (a stale/removed member's id updates nothing), so a
// removed member can't regain access. A non-nil name or description replaces
// the stored one in the same transaction, since the client re-seals them under
// the new key. All values are opaque to the server.
func (db *DB) RotateSharedVaultKeys(ctx context.Context, vaultID string, gen int, members []types.MemberKeyGrant, files []types.FileKeyWrap, name, description *string) error {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := lockKeyGeneration(ctx, tx, vaultID, gen, true); err != nil {
		return err
	}

	// Anti-lockout: the re-key MUST provide a fresh grant for every current
	// member who has a published key, and a fresh wrap for every shared file.
	// Re-wrapping under a new key while leaving anyone on the old one would
	// lock them out. A member with NO published key can be omitted (decided
	// here from the database, so a transient client error can't pose as a
	// missing key); they are cleared of their grant and so of access.
	provided := make(map[string]bool, len(members))
	for _, m := range members {
		provided[m.UserID] = true
	}
	rows, err := tx.Query(ctx, `
		SELECT svm.user_id::text, uk.user_id IS NOT NULL
		FROM shared_vault_members svm
		LEFT JOIN user_keys uk ON uk.user_id = svm.user_id
		WHERE svm.vault_id = $1 AND svm.status = 'active'`, vaultID)
	if err != nil {
		return err
	}
	var keyless []string
	for rows.Next() {
		var uid string
		var hasKey bool
		if err := rows.Scan(&uid, &hasKey); err != nil {
			rows.Close()
			return err
		}
		if provided[uid] {
			continue
		}
		if hasKey {
			rows.Close()
			return fmt.Errorf("%w: missing grant for member %s", ErrRotationIncomplete, uid)
		}
		keyless = append(keyless, uid)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	// A file purged after it was shared leaves its row behind (file_id has no
	// foreign key). Drop those first: nothing can wrap a key for a file that is
	// gone, and they must never block a rotation, which is how a removed member
	// loses access.
	if _, err := tx.Exec(ctx,
		`DELETE FROM shared_vault_files svf
		 WHERE svf.vault_id = $1 AND NOT EXISTS (SELECT 1 FROM files f WHERE f.id = svf.file_id)`,
		vaultID,
	); err != nil {
		return err
	}

	frows, err := tx.Query(ctx, `SELECT file_id::text FROM shared_vault_files WHERE vault_id = $1`, vaultID)
	if err != nil {
		return err
	}
	wrapped := make(map[string]bool, len(files))
	for _, f := range files {
		wrapped[f.FileID] = true
	}
	for frows.Next() {
		var fid string
		if err := frows.Scan(&fid); err != nil {
			frows.Close()
			return err
		}
		if !wrapped[fid] {
			frows.Close()
			return fmt.Errorf("%w: missing wrap for file %s", ErrRotationIncomplete, fid)
		}
	}
	frows.Close()
	if err := frows.Err(); err != nil {
		return err
	}

	for _, m := range members {
		if _, err := tx.Exec(ctx,
			`UPDATE shared_vault_members SET wrapped_space_key = $3 WHERE vault_id = $1 AND user_id = $2`,
			vaultID, m.UserID, m.WrappedSpaceKey); err != nil {
			return err
		}
	}
	for _, uid := range keyless {
		if _, err := tx.Exec(ctx,
			`UPDATE shared_vault_members SET wrapped_space_key = '' WHERE vault_id = $1 AND user_id::text = $2`,
			vaultID, uid); err != nil {
			return err
		}
	}
	for _, f := range files {
		if _, err := tx.Exec(ctx,
			`UPDATE shared_vault_files SET wrapped_cek = $3, wrapped_name = $4 WHERE vault_id = $1 AND file_id = $2`,
			vaultID, f.FileID, f.WrappedCEK, f.WrappedName); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `
		UPDATE shared_vaults
		SET updated_at = NOW(), needs_rotation = false, key_generation = key_generation + 1,
		    name = COALESCE($2, name), description = COALESCE($3, description)
		WHERE id = $1`, vaultID, name, description); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// RemoveSharedVaultMember removes a user from a shared vault and flags the space
// as needing a key rotation. The owner can never be removed (they'd lose access
// to their own space); use DeleteSharedVault. Reports whether a row was removed.
func (db *DB) RemoveSharedVaultMember(ctx context.Context, vaultID, memberUserID string) (bool, error) {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var status string
	err = tx.QueryRow(ctx, `
		DELETE FROM shared_vault_members
		WHERE vault_id = $1 AND user_id = $2
		  AND user_id <> (SELECT owner_id FROM shared_vaults WHERE id = $1)
		RETURNING status`, vaultID, memberUserID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	// A pending member never held the space key, so removing one needs no re-key.
	if status == "active" {
		if _, err := tx.Exec(ctx, `UPDATE shared_vaults SET needs_rotation = true, updated_at = NOW() WHERE id = $1`, vaultID); err != nil {
			return false, err
		}
	}
	return true, tx.Commit(ctx)
}

// UpdateSharedVault renames / re-limits a space. Nil fields are left unchanged.
func (db *DB) UpdateSharedVault(ctx context.Context, vaultID string, req types.SharedVaultUpdateRequest) error {
	_, err := db.pool.Exec(ctx, `
		UPDATE shared_vaults SET
			name = COALESCE($2, name),
			description = COALESCE($3, description),
			size_limit_bytes = COALESCE($4, size_limit_bytes),
			updated_at = NOW()
		WHERE id = $1`, vaultID, req.Name, req.Description, req.SizeLimitBytes)
	return err
}

// UpdateSharedVaultMemberRole changes a non-owner member's role. Reports
// whether a row changed.
func (db *DB) UpdateSharedVaultMemberRole(ctx context.Context, vaultID, memberUserID, role string) (bool, error) {
	tag, err := db.pool.Exec(ctx, `
		UPDATE shared_vault_members SET role = $3
		WHERE vault_id = $1 AND user_id = $2
		  AND user_id <> (SELECT owner_id FROM shared_vaults WHERE id = $1)`, vaultID, memberUserID, role)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// SharedVaultMemberRoleByEmail returns the current role of the member with this
// email, or "" when that email is not (yet) a member.
func (db *DB) SharedVaultMemberRoleByEmail(ctx context.Context, vaultID, email string) (string, error) {
	var role string
	err := db.pool.QueryRow(ctx, `
		SELECT svm.role FROM shared_vault_members svm JOIN users u ON u.id = svm.user_id
		WHERE svm.vault_id = $1 AND u.email = $2`, vaultID, email).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return role, err
}

// SharedVaultNeedsRotation reports whether a removed member's key is still live.
func (db *DB) SharedVaultNeedsRotation(ctx context.Context, vaultID string) (bool, error) {
	var need bool
	err := db.pool.QueryRow(ctx, `SELECT needs_rotation FROM shared_vaults WHERE id = $1`, vaultID).Scan(&need)
	return need, err
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
		SELECT role FROM shared_vault_members WHERE vault_id = $1 AND user_id = $2 AND status = 'active'`, vaultID, userID).Scan(&role)
	return role, err
}

// IsSharedVaultOwner reports whether userID owns the vault. Membership-changing
// and re-key operations are owner-gated (not merely admin) so a non-owner can't
// demote/remove the owner or lock members out via a partial re-key.
func (db *DB) IsSharedVaultOwner(ctx context.Context, vaultID, userID string) (bool, error) {
	var ok bool
	err := db.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM shared_vaults WHERE id = $1 AND owner_id = $2)`,
		vaultID, userID).Scan(&ok)
	return ok, err
}

// AddSharedVaultFile registers a file in a space with its CEK re-wrapped under
// the space key. Idempotent (re-adding updates the wrapped CEK, e.g. after a
// key rotation). Also mirrors the file id into shared_vaults.file_ids so the
// existing metadata listing stays in sync. Caller must already be authorized as
// an editor/admin member of the vault (enforced at the handler).
func (db *DB) AddSharedVaultFile(ctx context.Context, vaultID, fileID, addedBy, wrappedCEK, wrappedName string, gen int) error {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := lockKeyGeneration(ctx, tx, vaultID, gen, false); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO shared_vault_files (vault_id, file_id, wrapped_cek, wrapped_name, added_by)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (vault_id, file_id)
		DO UPDATE SET wrapped_cek = EXCLUDED.wrapped_cek, wrapped_name = EXCLUDED.wrapped_name`,
		vaultID, fileID, wrappedCEK, wrappedName, addedBy); err != nil {
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

// SharedVaultUsage returns the space's used bytes (sum of shared files' original
// sizes) and its size limit (0 = unlimited). excludeFileID is omitted from the
// sum so re-adding an existing file (e.g. key rotation) isn't double-counted;
// pass "" to count everything.
func (db *DB) SharedVaultUsage(ctx context.Context, vaultID, excludeFileID string) (used int64, limit int64, err error) {
	err = db.pool.QueryRow(ctx, `
		SELECT
			COALESCE((SELECT SUM(f.original_size)
			          FROM shared_vault_files svf JOIN files f ON f.id = svf.file_id
			          WHERE svf.vault_id = $1 AND ($2 = '' OR svf.file_id::text <> $2)), 0),
			COALESCE((SELECT size_limit_bytes FROM shared_vaults WHERE id = $1), 0)`,
		vaultID, excludeFileID,
	).Scan(&used, &limit)
	return used, limit, err
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
		JOIN shared_vault_members svm ON svm.vault_id = svf.vault_id AND svm.user_id = $1 AND svm.status = 'active'
		JOIN files f ON f.id = svf.file_id
		WHERE svf.file_id = $2
		LIMIT 1`, userID, fileID,
	).Scan(&g.OwnerID, &g.WrappedCEK)
	if err != nil {
		return nil, err
	}
	return g, nil
}

// SpaceFileView is a file readable through a space, with the space-wrapped CEK.
type SpaceFileView struct {
	File       *types.FileMetadata
	WrappedCEK string
}

// MemberSpaceFilesByIDs is the batch form of MemberSpaceFileGrant plus the file
// row: the live files among ids that sit in a space the caller belongs to.
func (db *DB) MemberSpaceFilesByIDs(ctx context.Context, userID string, ids []string) ([]SpaceFileView, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT DISTINCT ON (f.id) f.id, f.user_id, f.original_name, f.encrypted_name, f.original_size, f.compressed_size,
		       f.encrypted_size, f.chunk_count, f.sha256, f.sha256_scheme, f.salt, f.iv, f.wrapped_cek, f.status, f.created_at,
		       svf.wrapped_cek
		FROM shared_vault_files svf
		JOIN shared_vault_members svm ON svm.vault_id = svf.vault_id AND svm.user_id = $1 AND svm.status = 'active'
		JOIN files f ON f.id = svf.file_id AND f.deleted_at IS NULL
		WHERE svf.file_id = ANY($2::uuid[])
		ORDER BY f.id`, userID, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SpaceFileView
	for rows.Next() {
		f := &types.FileMetadata{}
		var spaceCEK string
		if err := rows.Scan(&f.ID, &f.UserID, &f.OriginalName, &f.EncryptedName, &f.OriginalSize, &f.CompressedSize,
			&f.EncryptedSize, &f.ChunkCount, &f.SHA256, &f.SHA256Scheme, &f.Salt, &f.IV, &f.WrappedCEK, &f.Status, &f.CreatedAt,
			&spaceCEK); err != nil {
			return nil, err
		}
		out = append(out, SpaceFileView{File: f, WrappedCEK: spaceCEK})
	}
	return out, rows.Err()
}

// OwnedFileSizes returns original_size for each of ids the user owns.
func (db *DB) OwnedFileSizes(ctx context.Context, userID string, ids []string) (map[string]int64, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT id::text, original_size FROM files WHERE id = ANY($1::uuid[]) AND user_id = $2`, ids, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string]int64, len(ids))
	for rows.Next() {
		var id string
		var size int64
		if err := rows.Scan(&id, &size); err != nil {
			return nil, err
		}
		out[id] = size
	}
	return out, rows.Err()
}

// SharedVaultBatchState returns, in one query, which of ids are already in the
// space, the space's used bytes and its size limit (0 = unlimited).
func (db *DB) SharedVaultBatchState(ctx context.Context, vaultID string, ids []string) (present map[string]bool, used, limit int64, err error) {
	rows, err := db.pool.Query(ctx, `
		SELECT svf.file_id::text, f.original_size
		FROM shared_vault_files svf JOIN files f ON f.id = svf.file_id
		WHERE svf.vault_id = $1`, vaultID)
	if err != nil {
		return nil, 0, 0, err
	}
	defer rows.Close()
	want := make(map[string]bool, len(ids))
	for _, id := range ids {
		want[id] = true
	}
	present = map[string]bool{}
	for rows.Next() {
		var id string
		var size int64
		if err := rows.Scan(&id, &size); err != nil {
			return nil, 0, 0, err
		}
		used += size
		if want[id] {
			present[id] = true
		}
	}
	if err := rows.Err(); err != nil {
		return nil, 0, 0, err
	}
	err = db.pool.QueryRow(ctx,
		`SELECT COALESCE((SELECT size_limit_bytes FROM shared_vaults WHERE id = $1), 0)`, vaultID).Scan(&limit)
	return present, used, limit, err
}

// AddSharedVaultFiles registers many files in a space in one transaction. The
// caller passes only ids not already present; the array mirror is extended with
// a single array_cat of the ids it does not yet hold.
func (db *DB) AddSharedVaultFiles(ctx context.Context, vaultID, addedBy string, gen int, files []types.SharedVaultAddFileRequest) (int, error) {
	if len(files) == 0 {
		return 0, nil
	}
	ids := make([]string, len(files))
	ceks := make([]string, len(files))
	names := make([]string, len(files))
	for i, f := range files {
		ids[i], ceks[i], names[i] = f.FileID, f.WrappedCEK, f.WrappedName
	}

	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := lockKeyGeneration(ctx, tx, vaultID, gen, false); err != nil {
		return 0, err
	}

	tag, err := tx.Exec(ctx, `
		INSERT INTO shared_vault_files (vault_id, file_id, wrapped_cek, wrapped_name, added_by)
		SELECT $1, t.fid::uuid, t.cek, t.name, $5
		FROM unnest($2::text[], $3::text[], $4::text[]) AS t(fid, cek, name)
		ON CONFLICT (vault_id, file_id) DO NOTHING`,
		vaultID, ids, ceks, names, addedBy)
	if err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE shared_vaults
		SET file_ids = array_cat(file_ids, COALESCE((SELECT array_agg(x) FROM unnest($2::text[]) AS x WHERE NOT x = ANY(file_ids)), '{}')),
		    updated_at = NOW()
		WHERE id = $1`, vaultID, ids); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

// SharedVaultAudience returns the user ids of a space's members and, of those,
// its owner and admins (the owner is an admin member).
func (db *DB) SharedVaultAudience(ctx context.Context, vaultID string) (members, admins []string, err error) {
	rows, err := db.pool.Query(ctx, `
		SELECT user_id::text, role FROM shared_vault_members WHERE vault_id = $1 AND status = 'active'`, vaultID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, role string
		if err := rows.Scan(&id, &role); err != nil {
			return nil, nil, err
		}
		members = append(members, id)
		if role == types.SpaceRoleAdmin {
			admins = append(admins, id)
		}
	}
	return members, admins, rows.Err()
}
