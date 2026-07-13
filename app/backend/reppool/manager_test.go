package reppool

import (
	"strings"
	"testing"
)

// TestNewRepoIDUniquePerCall guards the fix for the intermittent
// "duplicate key value violates unique constraint repos_pkey" upload failure:
// repo IDs must be globally unique even for identical platform/account/name
// inputs (disguise names are random and can repeat across concurrent
// registrations). A regression to a deterministic "platform_account_name" ID
// would make the very first iteration collide.
func TestNewRepoIDUniquePerCall(t *testing.T) {
	const platform, account, name = "github", "acct", "swift-otter-v1"
	seen := make(map[string]struct{}, 1000)
	for i := 0; i < 1000; i++ {
		id := newRepoID(platform, account, name)
		if _, dup := seen[id]; dup {
			t.Fatalf("newRepoID returned a duplicate ID for identical inputs: %q", id)
		}
		seen[id] = struct{}{}
		if !strings.HasPrefix(id, "github_acct_swift-otter-v1_") {
			t.Fatalf("newRepoID dropped the readable prefix: %q", id)
		}
	}
}

// TestNewRepoIDKeepsInputsReadable ensures the human-readable prefix survives so
// logs/debugging can still identify a repo by platform/account/name.
func TestNewRepoIDKeepsInputsReadable(t *testing.T) {
	id := newRepoID("huggingface", "team-x", "brave-lynx-v3")
	if !strings.HasPrefix(id, "huggingface_team-x_brave-lynx-v3_") {
		t.Fatalf("unexpected ID shape: %q", id)
	}
	// prefix + "_" + 12 hex chars (6 random bytes)
	suffix := strings.TrimPrefix(id, "huggingface_team-x_brave-lynx-v3_")
	if len(suffix) != 12 {
		t.Fatalf("expected a 12-char hex suffix, got %d chars: %q", len(suffix), suffix)
	}
}
