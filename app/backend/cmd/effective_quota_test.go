package cmd

import (
	"testing"

	"github.com/zcrypt/zcrypt/types"
)

func TestEffectiveQuota(t *testing.T) {
	t.Setenv("ZCRYPT_SHARED_QUOTA_BYTES", "100")
	zero, set := int64(0), int64(5)
	cases := []struct {
		name        string
		override    *int64
		role        types.Role
		hasPersonal bool
		want        int64
	}{
		{"shared pool user", nil, types.RoleUser, false, 100},
		{"own storage", nil, types.RoleUser, true, 0},
		{"admin", nil, types.RoleAdmin, false, 0},
		{"override wins over own storage", &set, types.RoleUser, true, 5},
		{"override wins over admin", &set, types.RoleAdmin, false, 5},
		{"override of 0 is unlimited", &zero, types.RoleUser, false, 0},
	}
	for _, c := range cases {
		if got := effectiveQuota(c.override, c.role, c.hasPersonal); got != c.want {
			t.Errorf("%s: effectiveQuota = %d, want %d", c.name, got, c.want)
		}
	}
}
