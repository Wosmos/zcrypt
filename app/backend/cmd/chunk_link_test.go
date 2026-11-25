package cmd

import (
	"testing"

	"github.com/zcrypt/zcrypt/types"
)

func TestDirectLinkAllowed(t *testing.T) {
	s := &Server{adapterOwn: map[string]map[string]bool{
		"owner": {types.PlatformGitHub + ":mine": true},
	}}
	cases := []struct {
		name                        string
		user, owner, platform, acct string
		want                        bool
	}{
		{"owner, own GitHub account", "owner", "owner", types.PlatformGitHub, "mine", true},
		{"owner, shared-pool GitHub account", "owner", "owner", types.PlatformGitHub, "pool", false},
		{"space member, owner's GitHub account", "member", "owner", types.PlatformGitHub, "mine", false},
		{"owner, Hugging Face", "owner", "owner", types.PlatformHuggingFace, "pool", true},
		{"space member, Hugging Face", "member", "owner", types.PlatformHuggingFace, "any", true},
		{"Telegram has its own direct route", "owner", "owner", types.PlatformTelegram, "bot", false},
	}
	for _, c := range cases {
		if got := s.directLinkAllowed(c.user, c.owner, c.platform, c.acct); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}
