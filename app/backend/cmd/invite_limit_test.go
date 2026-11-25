package cmd

import "testing"

func TestInviteLimiterIsPerSpaceAndInviteeAndSeparateFromKeyLookup(t *testing.T) {
	lookup := newRateLimiter(keyLookupLimit, keyLookupWindow)
	invite := newRateLimiter(inviteLimit, inviteWindow)
	pair := inviteKey("space-1", "carol")
	for range inviteLimit {
		if invite.exceeded(pair) {
			t.Fatal("invite refused before the limit")
		}
		invite.record(pair)
	}
	if !invite.exceeded(pair) {
		t.Fatal("re-inviting the same person allowed past the limit")
	}
	if invite.exceeded(inviteKey("space-1", "dave")) {
		t.Fatal("inviting someone else shares carol's bucket")
	}
	if invite.exceeded(inviteKey("space-2", "carol")) {
		t.Fatal("another Space shares the first one's bucket")
	}
	if lookup.exceeded("alice") {
		t.Fatal("invites drain the key lookup bucket")
	}
}
