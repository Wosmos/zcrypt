package cmd

import "testing"

func TestDecodeAvatarURI(t *testing.T) {
	mime, data, ok := decodeAvatarURI("data:image/png;base64,aGVsbG8=")
	if !ok || mime != "image/png" || string(data) != "hello" {
		t.Fatalf("got %q %q %v", mime, data, ok)
	}
	for _, bad := range []string{"", "http://x", "data:image/svg+xml;base64,aGVsbG8=", "data:image/png;base64,@@@", "data:image/png"} {
		if _, _, ok := decodeAvatarURI(bad); ok {
			t.Errorf("accepted %q", bad)
		}
	}
}

func TestAvatarETagStable(t *testing.T) {
	a := avatarETag("data:image/png;base64,AAAA")
	if a != avatarETag("data:image/png;base64,AAAA") || a == avatarETag("data:image/png;base64,AAAB") || len(a) != 18 {
		t.Fatalf("bad etag %s", a)
	}
}
