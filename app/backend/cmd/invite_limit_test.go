package cmd

import "testing"

func TestInviteLimiterIsPerInviterAndSeparateFromKeyLookup(t *testing.T) {
	lookup := newRateLimiter(keyLookupLimit, keyLookupWindow)
	invite := newRateLimiter(inviteLimit, inviteWindow)
	for range inviteLimit {
		if !invite.allow("alice") {
			t.Fatal("invite refused before the limit")
		}
	}
	if invite.allow("alice") {
		t.Fatal("invite allowed past the limit")
	}
	if !invite.allow("bob") {
		t.Fatal("another inviter shares alice's bucket")
	}
	if !lookup.allow("alice") {
		t.Fatal("invites drain the key lookup bucket")
	}
}
