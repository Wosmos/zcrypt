package cmd

import (
	"errors"
	"fmt"
	"testing"
)

// isRepoNotFound must fire ONLY for "the repo itself is gone" errors (the
// presign self-heal deactivates the repo and rotates the session) — never for
// transient failures, which must keep retrying against the same repo.
func TestIsRepoNotFound(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		// HF LFS batch's actual shape for a deleted repo.
		{"hf lfs 404 body", fmt.Errorf("lfs batch returned 404: {\"error\":\"Repository not found\"}"), true},
		{"wrapped repo not found", fmt.Errorf("presign: %w", errors.New("Repository Not Found")), true},
		{"plain 404 not found", errors.New("api returned 404: tree not found"), true},
		// Transient / unrelated failures must NOT trigger a rotation.
		{"rate limited", errors.New("lfs batch returned 429: too many requests"), false},
		{"server error", errors.New("lfs batch returned 500: internal error"), false},
		{"network", errors.New("dial tcp: connection refused"), false},
		{"chunk 404 without not-found text", errors.New("status 404"), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isRepoNotFound(tc.err); got != tc.want {
				t.Errorf("isRepoNotFound(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}
