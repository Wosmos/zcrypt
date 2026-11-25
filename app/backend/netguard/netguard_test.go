package netguard

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"
)

const sample = `{"prefixes":[{"ip_prefix":"13.232.0.0/14"},{"ip_prefix":"13.234.0.0/16"}],
"ipv6_prefixes":[{"ipv6_prefix":"2406:da00::/24"}]}
104.131.0.0/18,US,US-NY,New York,
0.0.0.0/33
not-an-ip/8
65.0.0.0/14`

func TestSetContains(t *testing.T) {
	s := ParseSet(sample)
	for ip, want := range map[string]bool{
		"13.232.42.1":     true,
		"13.235.255.255":  true,
		"13.234.0.1":      true,
		"13.236.0.0":      false,
		"65.1.132.9":      true,
		"104.131.63.255":  true,
		"104.131.64.0":    false,
		"39.40.1.1":       false,
		"2406:da00::1":    true,
		"2406:db00::1":    false,
		"::ffff:13.232.1": false,
	} {
		addr, err := netip.ParseAddr(ip)
		if err != nil {
			if want {
				t.Fatalf("bad test ip %q", ip)
			}
			continue
		}
		if got := s.Contains(addr); got != want {
			t.Errorf("Contains(%s) = %v, want %v", ip, got, want)
		}
	}
	if s.Contains(netip.MustParseAddr("::ffff:13.232.0.1")) != true {
		t.Error("an IPv4-mapped address should match its IPv4 range")
	}
}

func TestMergeAdjacentAndWholeSpace(t *testing.T) {
	s := ParseSet("10.0.0.0/25 10.0.0.128/25 10.0.1.0/24 0.0.0.0/0")
	if len(s.v4) != 1 || s.v4[0].lo != 0 || s.v4[0].hi != ^uint32(0) {
		t.Fatalf("merged = %+v", s.v4)
	}
	s = ParseSet("::/0")
	if !s.Contains(netip.MustParseAddr("2001:db8::1")) {
		t.Fatal("::/0 should hold every IPv6 address")
	}
	s = ParseSet("1.2.3.4/32 2001:db8::1/128")
	if !s.Contains(netip.MustParseAddr("1.2.3.4")) || s.Contains(netip.MustParseAddr("1.2.3.5")) {
		t.Fatal("/32 should hold exactly one address")
	}
	if !s.Contains(netip.MustParseAddr("2001:db8::1")) || s.Contains(netip.MustParseAddr("2001:db8::2")) {
		t.Fatal("/128 should hold exactly one address")
	}
}

func TestGuardBlocked(t *testing.T) {
	g := New(true, []netip.Prefix{netip.MustParsePrefix("13.232.42.0/24")}, nil)
	if g.Blocked("13.233.0.1") {
		t.Fatal("nothing should be blocked before a list loads")
	}
	g.SetForTest(ParseSet(sample))
	cases := map[string]bool{
		"13.233.0.1":  true,
		"13.232.42.7": false, // allowlisted
		"39.40.1.1":   false,
		"127.0.0.1":   false,
		"10.1.2.3":    false,
		"garbage":     false,
		"":            false,
	}
	for ip, want := range cases {
		if got := g.Blocked(ip); got != want {
			t.Errorf("Blocked(%q) = %v, want %v", ip, got, want)
		}
	}
	if New(false, nil, nil).Blocked("13.233.0.1") {
		t.Fatal("a disabled guard never blocks")
	}
	var nilGuard *Guard
	if nilGuard.Blocked("13.233.0.1") {
		t.Fatal("a nil guard never blocks")
	}
}

func TestRefresh(t *testing.T) {
	ok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(sample))
	}))
	defer ok.Close()
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "no", http.StatusBadGateway)
	}))
	defer bad.Close()

	g := New(true, nil, []string{ok.URL, bad.URL})
	if err := g.Refresh(context.Background()); err == nil {
		t.Fatal("a failed list should be reported")
	}
	if !g.Blocked("13.233.0.1") {
		t.Fatal("the lists that loaded should be in force")
	}

	g2 := New(true, nil, []string{bad.URL})
	g2.SetForTest(ParseSet("8.8.8.0/24"))
	if err := g2.Refresh(context.Background()); err == nil {
		t.Fatal("all lists failing should be an error")
	}
	if !g2.Blocked("8.8.8.8") {
		t.Fatal("the previous set should stay when every list fails")
	}
}
