package index

import "testing"

func TestDBMaxConns(t *testing.T) {
	cases := []struct {
		val  string
		want int32
	}{
		{"", 25},
		{"40", 40},
		{"0", 25},
		{"-3", 25},
		{"many", 25},
		{"99999999999", 2147483647},
	}
	for _, c := range cases {
		t.Setenv("ZCRYPT_DB_MAX_CONNS", c.val)
		if got := dbMaxConns(); got != c.want {
			t.Errorf("ZCRYPT_DB_MAX_CONNS=%q gave %d, want %d", c.val, got, c.want)
		}
	}
}
