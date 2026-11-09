package cmd

import (
	"encoding/base64"
	"testing"
)

func TestValidateRecoveryBlob(t *testing.T) {
	ok := func(n int) string { return "rk1:" + base64.StdEncoding.EncodeToString(make([]byte, n)) }
	cases := []struct {
		name    string
		blob    string
		wantErr bool
	}{
		{"valid minimum", ok(minRecoveryBlobBytes), false},
		{"valid typical", ok(80), false},
		{"valid maximum", ok(maxRecoveryBlobBytes), false},
		{"missing prefix", base64.StdEncoding.EncodeToString(make([]byte, 80)), true},
		{"wrong version", "rk2:" + base64.StdEncoding.EncodeToString(make([]byte, 80)), true},
		{"not base64", "rk1:!!!not base64!!!", true},
		{"too short", ok(minRecoveryBlobBytes - 1), true},
		{"too long", ok(maxRecoveryBlobBytes + 1), true},
		{"empty payload", "rk1:", true},
		{"prefix is case sensitive", "RK1:" + base64.StdEncoding.EncodeToString(make([]byte, 80)), true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := validateRecoveryBlob(c.blob)
			if (err != nil) != c.wantErr {
				t.Fatalf("validateRecoveryBlob error = %v, wantErr %v", err, c.wantErr)
			}
		})
	}
}
