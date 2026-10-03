package cmd

import (
	"encoding/base64"
	"testing"
	"time"

	"github.com/zcrypt/zcrypt/types"
)

func TestFileCursorRoundTrip(t *testing.T) {
	created := time.Date(2026, 9, 1, 12, 30, 45, 123456000, time.FixedZone("x", 5*3600))
	f := types.FileMetadata{ID: "6f1c1c6e-1d2a-4f7b-9a59-0c3a6c3b9e11", CreatedAt: created}

	cur, err := decodeFileCursor(encodeFileCursor(f))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if cur.ID != f.ID {
		t.Fatalf("id = %q, want %q", cur.ID, f.ID)
	}
	if !cur.CreatedAt.Equal(created) {
		t.Fatalf("created_at = %v, want %v", cur.CreatedAt, created)
	}
}

func TestDecodeFileCursorRejectsGarbage(t *testing.T) {
	enc := func(s string) string { return base64.RawURLEncoding.EncodeToString([]byte(s)) }
	for name, in := range map[string]string{
		"not base64":   "%%%",
		"no separator": enc("2026-09-01T00:00:00Z"),
		"bad time":     enc("yesterday|6f1c1c6e-1d2a-4f7b-9a59-0c3a6c3b9e11"),
		"bad id":       enc("2026-09-01T00:00:00Z|1; DROP TABLE files"),
	} {
		if _, err := decodeFileCursor(in); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}
