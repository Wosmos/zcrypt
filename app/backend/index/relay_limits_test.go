package index

import "testing"

func TestRelayTotalsCheck(t *testing.T) {
	limits := RelayLimits{Day: 100, Month: 1000}
	cases := []struct {
		name      string
		totals    RelayTotals
		limits    RelayLimits
		need      int64
		wantNil   bool
		wantDaily bool
		wantUsed  int64
	}{
		{"fits exactly", RelayTotals{Day: 40, Month: 40, Reserved: 10}, limits, 50, true, false, 0},
		{"one byte over daily", RelayTotals{Day: 40, Month: 40, Reserved: 10}, limits, 51, false, true, 50},
		{"reserved counts against daily", RelayTotals{Day: 0, Month: 0, Reserved: 100}, limits, 1, false, true, 100},
		{"monthly only", RelayTotals{Day: 0, Month: 995, Reserved: 0}, limits, 6, false, false, 995},
		{"reserved counts against monthly", RelayTotals{Day: 0, Month: 900, Reserved: 99}, RelayLimits{Day: 1000, Month: 1000}, 2, false, false, 999},
		{"both exceeded reports daily", RelayTotals{Day: 100, Month: 1000}, limits, 1, false, true, 100},
		{"zero day limit is no cap", RelayTotals{Day: 1 << 40}, RelayLimits{Month: 0}, 1, true, false, 0},
		{"zero need at the limit fits", RelayTotals{Day: 100, Month: 1000}, limits, 0, true, false, 0},
	}
	for _, c := range cases {
		got := c.totals.Check(c.limits, c.need)
		if c.wantNil {
			if got != nil {
				t.Errorf("%s: want fit, got %+v", c.name, got)
			}
			continue
		}
		if got == nil {
			t.Errorf("%s: want refusal, got fit", c.name)
			continue
		}
		if got.Daily != c.wantDaily || got.Used != c.wantUsed {
			t.Errorf("%s: got %+v, want daily=%v used=%d", c.name, got, c.wantDaily, c.wantUsed)
		}
	}
}
