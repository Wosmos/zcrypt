package reppool

import (
	"context"
	crand "crypto/rand"
	"encoding/hex"
	"fmt"

	"github.com/zcrypt/zcrypt/adapters"
	"github.com/zcrypt/zcrypt/disguise"
	"github.com/zcrypt/zcrypt/index"
	"github.com/zcrypt/zcrypt/types"
)

// Manager manages the repository pool for a platform account.
type Manager struct {
	db        *index.DB
	adapter   adapters.PlatformAdapter
	userID    string
	account   string
	threshold int64
}

// NewManager creates a new repo pool manager for a specific user and account.
func NewManager(db *index.DB, adapter adapters.PlatformAdapter, userID, account string, threshold int64) *Manager {
	return &Manager{
		db:        db,
		adapter:   adapter,
		userID:    userID,
		account:   account,
		threshold: threshold,
	}
}

// GetOrCreateRepo returns the active repo for uploads, creating a new one if needed.
func (m *Manager) GetOrCreateRepo(ctx context.Context) (*types.RepoInfo, error) {
	repo, err := m.db.GetActiveRepo(ctx, m.userID, m.adapter.PlatformName(), m.account)
	if err == nil {
		// Check if still under threshold
		if repo.UsedBytes < m.threshold {
			return repo, nil
		}
		// Repo is full, deactivate and create new
		if err := m.db.DeactivateRepo(ctx, repo.ID); err != nil {
			return nil, fmt.Errorf("deactivate full repo: %w", err)
		}
	}

	return m.createNewRepo(ctx)
}

// createNewRepo creates a fresh repo on the platform and registers it.
func (m *Manager) createNewRepo(ctx context.Context) (*types.RepoInfo, error) {
	// Count existing repos to generate index
	repos, err := m.db.ListRepos(ctx, m.userID, m.adapter.PlatformName())
	if err != nil {
		return nil, fmt.Errorf("list repos: %w", err)
	}

	name := disguise.RepoName(len(repos) + 1)
	fullName, err := m.adapter.CreateRepo(ctx, name)
	if err != nil {
		return nil, fmt.Errorf("create repo on %s: %w", m.adapter.PlatformName(), err)
	}

	repo := &types.RepoInfo{
		ID:       newRepoID(m.adapter.PlatformName(), m.account, name),
		Platform: m.adapter.PlatformName(),
		Account:  m.account,
		Name:     name,
		URL:      fullName,
		MaxBytes: m.threshold,
		Active:   true,
	}

	if err := m.db.InsertRepo(ctx, m.userID, repo); err != nil {
		return nil, fmt.Errorf("register repo: %w", err)
	}

	return repo, nil
}

// newRepoID builds a globally-unique primary key for a repo. It keeps the
// readable "platform_account_name" prefix for logs/debugging, then appends a
// random suffix. The disguise names come from math/rand, so two registrations
// (e.g. concurrent chunk uploads that both find no active repo) could otherwise
// draw the same name at the same index and collide on repos_pkey — which
// surfaced intermittently as "duplicate key value violates unique constraint
// repos_pkey" and failed the upload with 500. The suffix makes that impossible.
func newRepoID(platform, account, name string) string {
	var b [6]byte
	// crypto/rand.Read never returns a short read; ignore err (falls back to the
	// zero suffix at worst, which is still disambiguated by the readable prefix).
	_, _ = crand.Read(b[:])
	return fmt.Sprintf("%s_%s_%s_%s", platform, account, name, hex.EncodeToString(b[:]))
}

// UpdateUsage updates the used bytes for a repo after an upload.
func (m *Manager) UpdateUsage(repoID string, additionalBytes int64) error {
	ctx := context.Background()
	repos, err := m.db.ListRepos(ctx, m.userID, "")
	if err != nil {
		return err
	}

	for _, r := range repos {
		if r.ID == repoID {
			return m.db.UpdateRepoUsage(ctx, repoID, r.UsedBytes+additionalBytes)
		}
	}
	return fmt.Errorf("repo not found: %s", repoID)
}
