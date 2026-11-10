package cmd

import (
	"context"
	"testing"

	"github.com/zcrypt/zcrypt/adapters"
	"github.com/zcrypt/zcrypt/reppool"
)

func serverWithAdapters(userID string, own, shared []string) *Server {
	s := &Server{
		adapterCache: map[string]map[string]adapters.PlatformAdapter{userID: {}},
		adapterOwn:   map[string]map[string]bool{userID: {}},
		poolCache:    map[string]map[string]*reppool.Manager{userID: {}},
	}
	for _, key := range own {
		s.adapterCache[userID][key] = nil
		s.adapterOwn[userID][key] = true
		s.poolCache[userID][key] = nil
	}
	for _, key := range shared {
		s.adapterCache[userID][key] = nil
		s.poolCache[userID][key] = nil
	}
	return s
}

func TestSelectAdapterPrefersTheUsersOwnStorage(t *testing.T) {
	ctx := context.Background()
	s := serverWithAdapters("u1", []string{"github:me"}, []string{"telegram:pool"})

	key, _, _, err := s.selectAdapter(ctx, "u1", "")
	if err != nil || key != "github:me" {
		t.Fatalf("auto picked %q (%v), want the user's own github even though telegram ranks first", key, err)
	}
	if key, _, _, _ := s.selectAdapter(ctx, "u1", "telegram"); key != "telegram:pool" {
		t.Fatalf("an explicit telegram upload picked %q, want the shared pool", key)
	}
	if !s.isOwnAdapterKey("u1", "github:me") || s.isOwnAdapterKey("u1", "telegram:pool") {
		t.Fatal("ownership of cached adapter keys is wrong")
	}
	if _, _, _, err := s.selectAdapter(ctx, "u1", "gitlab"); err == nil {
		t.Fatal("a platform with no account must fail")
	}
}

func TestSelectAdapterPrefersOwnWithinThePlatform(t *testing.T) {
	ctx := context.Background()
	s := serverWithAdapters("u1", []string{"telegram:mine"}, []string{"telegram:pool"})
	if key, _, _, _ := s.selectAdapter(ctx, "u1", "telegram"); key != "telegram:mine" {
		t.Fatalf("picked %q, want the user's own telegram over the shared one", key)
	}
	shared := serverWithAdapters("u2", nil, []string{"telegram:pool", "github:pool"})
	if key, _, _, _ := shared.selectAdapter(ctx, "u2", ""); key != "telegram:pool" {
		t.Fatalf("a user with no storage of their own picked %q, want telegram first", key)
	}
}
