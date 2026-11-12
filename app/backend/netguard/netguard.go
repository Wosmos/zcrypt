// Package netguard tells whether an address belongs to a cloud provider or
// data center, from the address lists the providers publish. zcrypt refuses
// sign-ins from those networks: a person signs in from a home, office or phone
// connection, while scripted and proxied use of the service runs on servers.
package netguard

import (
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/netip"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// DefaultSources are the published address lists of the large clouds, plus a
// community list of hosting and data-center networks built from their ASNs.
var DefaultSources = []string{
	"https://ip-ranges.amazonaws.com/ip-ranges.json",
	"https://www.gstatic.com/ipranges/cloud.json",
	"https://docs.oracle.com/en-us/iaas/tools/public_ip_ranges.json",
	"https://digitalocean.com/geo/google.csv",
	"https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/datacenter/ipv4.txt",
}

const (
	maxBody       = 16 << 20
	refreshEvery  = 24 * time.Hour
	retryAfterErr = 30 * time.Minute
)

var cidrPattern = regexp.MustCompile(`[0-9A-Fa-f:.]+/[0-9]{1,3}`)

type span4 struct{ lo, hi uint32 }

type span6 struct{ lo, hi [2]uint64 }

// Set is an immutable set of address ranges.
type Set struct {
	v4 []span4
	v6 []span6
}

// Len is the number of merged ranges in the set.
func (s *Set) Len() int {
	if s == nil {
		return 0
	}
	return len(s.v4) + len(s.v6)
}

// ParseSet reads every CIDR it finds in the given texts, whatever their
// format (JSON, CSV or one range per line).
func ParseSet(texts ...string) *Set {
	var v4 []span4
	var v6 []span6
	for _, t := range texts {
		for _, m := range cidrPattern.FindAllString(t, -1) {
			p, err := netip.ParsePrefix(m)
			if err != nil {
				continue
			}
			p = p.Masked()
			if p.Addr().Is4() {
				v4 = append(v4, prefix4(p))
			} else if p.Addr().Is6() {
				v6 = append(v6, prefix6(p))
			}
		}
	}
	return &Set{v4: merge4(v4), v6: merge6(v6)}
}

// Contains reports whether addr falls in the set.
func (s *Set) Contains(addr netip.Addr) bool {
	if s == nil || !addr.IsValid() {
		return false
	}
	addr = addr.Unmap()
	if addr.Is4() {
		b := addr.As4()
		v := binary.BigEndian.Uint32(b[:])
		i := sort.Search(len(s.v4), func(i int) bool { return s.v4[i].hi >= v })
		return i < len(s.v4) && s.v4[i].lo <= v
	}
	v := split6(addr.As16())
	i := sort.Search(len(s.v6), func(i int) bool { return !less6(s.v6[i].hi, v) })
	return i < len(s.v6) && !less6(v, s.v6[i].lo)
}

func prefix4(p netip.Prefix) span4 {
	b := p.Addr().As4()
	lo := binary.BigEndian.Uint32(b[:])
	return span4{lo, lo | ^uint32(0)>>uint(p.Bits())}
}

func prefix6(p netip.Prefix) span6 {
	lo := split6(p.Addr().As16())
	hi := lo
	bits := uint(p.Bits())
	hi[0] |= ^uint64(0) >> bits
	if bits < 64 {
		hi[1] = ^uint64(0)
	} else {
		hi[1] |= ^uint64(0) >> (bits - 64)
	}
	return span6{lo, hi}
}

func split6(b [16]byte) [2]uint64 {
	return [2]uint64{binary.BigEndian.Uint64(b[:8]), binary.BigEndian.Uint64(b[8:])}
}

func less6(a, b [2]uint64) bool {
	return a[0] < b[0] || (a[0] == b[0] && a[1] < b[1])
}

func merge4(in []span4) []span4 {
	sort.Slice(in, func(i, j int) bool { return in[i].lo < in[j].lo })
	out := in[:0]
	for _, r := range in {
		if n := len(out); n > 0 && (r.lo <= out[n-1].hi || (out[n-1].hi != ^uint32(0) && r.lo == out[n-1].hi+1)) {
			if r.hi > out[n-1].hi {
				out[n-1].hi = r.hi
			}
			continue
		}
		out = append(out, r)
	}
	return out
}

func merge6(in []span6) []span6 {
	sort.Slice(in, func(i, j int) bool { return less6(in[i].lo, in[j].lo) })
	out := in[:0]
	for _, r := range in {
		if n := len(out); n > 0 && !less6(out[n-1].hi, r.lo) {
			if less6(out[n-1].hi, r.hi) {
				out[n-1].hi = r.hi
			}
			continue
		}
		out = append(out, r)
	}
	return out
}

// Guard holds the current cloud set, refreshed in the background, and an
// allowlist that always passes.
type Guard struct {
	enabled bool
	allow   []netip.Prefix
	sources []string
	client  *http.Client

	mu  sync.RWMutex
	set *Set
}

// New returns a guard. A disabled guard never blocks; an enabled one blocks
// nothing until its first list has loaded, so a failed download can't lock
// anyone out.
func New(enabled bool, allow []netip.Prefix, sources []string) *Guard {
	return &Guard{
		enabled: enabled,
		allow:   allow,
		sources: sources,
		client:  &http.Client{Timeout: 60 * time.Second},
	}
}

// Enabled reports whether the guard blocks at all.
func (g *Guard) Enabled() bool { return g != nil && g.enabled }

// SetForTest installs a set directly.
func (g *Guard) SetForTest(s *Set) {
	g.mu.Lock()
	g.set = s
	g.mu.Unlock()
}

// Start loads the lists now and again every day until ctx ends.
func (g *Guard) Start(ctx context.Context) {
	if !g.Enabled() {
		return
	}
	go func() {
		for {
			wait := refreshEvery
			if err := g.Refresh(ctx); err != nil {
				log.Printf("netguard: %v", err)
				wait = retryAfterErr
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(wait):
			}
		}
	}()
}

// Refresh downloads every source and swaps in the new set. A source that fails
// is skipped; when all fail the previous set stays.
func (g *Guard) Refresh(ctx context.Context) error {
	var texts []string
	var failed []string
	for _, src := range g.sources {
		body, err := g.fetch(ctx, src)
		if err != nil {
			failed = append(failed, fmt.Sprintf("%s: %v", src, err))
			continue
		}
		texts = append(texts, body)
	}
	if len(texts) == 0 {
		return fmt.Errorf("no cloud network list loaded: %s", strings.Join(failed, "; "))
	}
	set := ParseSet(texts...)
	g.mu.Lock()
	g.set = set
	g.mu.Unlock()
	log.Printf("netguard: %d cloud ranges from %d of %d lists", set.Len(), len(texts), len(g.sources))
	if len(failed) > 0 {
		return fmt.Errorf("some cloud network lists failed: %s", strings.Join(failed, "; "))
	}
	return nil
}

func (g *Guard) fetch(ctx context.Context, url string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	res, err := g.client.Do(req)
	if err != nil {
		return "", err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("status %d", res.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(res.Body, maxBody))
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// Blocked reports whether ip is on a cloud or data-center network and not on
// the allowlist.
func (g *Guard) Blocked(ip string) bool {
	if !g.Enabled() {
		return false
	}
	addr, err := netip.ParseAddr(strings.TrimSpace(ip))
	if err != nil {
		return false
	}
	addr = addr.Unmap()
	if addr.IsLoopback() || addr.IsPrivate() || addr.IsLinkLocalUnicast() {
		return false
	}
	for _, p := range g.allow {
		if p.Contains(addr) {
			return false
		}
	}
	g.mu.RLock()
	set := g.set
	g.mu.RUnlock()
	return set.Contains(addr)
}
