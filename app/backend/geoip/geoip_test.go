package geoip

import (
	"os"
	"testing"
)

func TestNilDBFindsNothing(t *testing.T) {
	var db *DB
	if got := db.Lookup("8.8.8.8"); got != (Place{}) {
		t.Fatalf("nil db lookup = %+v, want empty", got)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("nil db close: %v", err)
	}
}

func TestOpenMissingFile(t *testing.T) {
	if _, err := Open("/nonexistent/geo.mmdb"); err == nil {
		t.Fatal("open of a missing file succeeded")
	}
}

func TestLookup(t *testing.T) {
	path := os.Getenv("GEOIP_TEST_DB")
	if path == "" {
		t.Skip("GEOIP_TEST_DB not set")
	}
	db, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	for _, ip := range []string{"", "nope", "127.0.0.1", "10.1.2.3", "192.168.0.9", "::1", "::"} {
		if got := db.Lookup(ip); got != (Place{}) {
			t.Errorf("Lookup(%q) = %+v, want empty", ip, got)
		}
	}
	if got := db.Lookup("1.1.1.1"); got.Country == "" {
		t.Errorf("Lookup(1.1.1.1) found no country")
	}
	if got := db.Lookup("::ffff:8.8.8.8"); got.Country != "US" {
		t.Errorf("Lookup(mapped 8.8.8.8) country = %q, want US", got.Country)
	}
}
