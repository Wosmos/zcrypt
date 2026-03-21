package index

import (
	"context"

	"github.com/zcrypt/zcrypt/types"
)

func (db *DB) CreatePad(ctx context.Context, p *types.Pad) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO pads (id, token, encrypted_blob, content_size, burn_after_read, expires_at, creator_ip)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		p.ID, p.Token, p.EncryptedBlob, p.ContentSize, p.BurnAfterRead, p.ExpiresAt, p.CreatorIP,
	)
	return err
}

func (db *DB) GetPadByToken(ctx context.Context, token string) (*types.Pad, error) {
	p := &types.Pad{}
	err := db.pool.QueryRow(ctx,
		`SELECT id, token, encrypted_blob, content_size, burn_after_read, view_count, expires_at, creator_ip, created_at
		 FROM pads WHERE token = $1`, token,
	).Scan(&p.ID, &p.Token, &p.EncryptedBlob, &p.ContentSize, &p.BurnAfterRead, &p.ViewCount, &p.ExpiresAt, &p.CreatorIP, &p.CreatedAt)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (db *DB) IncrementPadViews(ctx context.Context, id string) error {
	_, err := db.pool.Exec(ctx, `UPDATE pads SET view_count = view_count + 1 WHERE id = $1`, id)
	return err
}

func (db *DB) DeletePad(ctx context.Context, id string) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM pads WHERE id = $1`, id)
	return err
}

func (db *DB) CleanupExpiredPads(ctx context.Context) (int, error) {
	tag, err := db.pool.Exec(ctx, `DELETE FROM pads WHERE expires_at < NOW()`)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}
