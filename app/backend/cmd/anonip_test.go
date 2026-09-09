package cmd

import "testing"

func TestAnonIP(t *testing.T) {
	cases := map[string]string{
		"203.0.113.77":               "203.0.113.0",
		"10.1.2.3":                   "10.1.2.0",
		"2001:db8:abcd:1234:5678::1": "2001:db8:abcd::",
		"::1":                        "::",
		"not-an-ip":                  "not-an-ip", // passthrough: never lose the signal entirely
		"":                           "",
	}
	for in, want := range cases {
		if got := anonIP(in); got != want {
			t.Errorf("anonIP(%q) = %q, want %q", in, got, want)
		}
	}
}
