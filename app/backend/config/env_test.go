package config

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestEnvPositiveInt64(t *testing.T) {
	const name = "ZCRYPT_TEST_POSITIVE_INT"
	cases := []struct {
		name string
		val  string
		want int64
	}{
		{"unset", "", 7},
		{"valid", "42", 42},
		{"padded", " 42 ", 42},
		{"large", "10737418240", 10737418240},
		{"zero", "0", 7},
		{"negative", "-5", 7},
		{"float", "1.5", 7},
		{"text", "abc", 7},
		{"overflow", "99999999999999999999", 7},
		{"max", "9223372036854775807", math.MaxInt64},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv(name, c.val)
			assert.Equal(t, c.want, EnvPositiveInt64(name, 7))
		})
	}
}

func TestPortPrecedence(t *testing.T) {
	cases := []struct {
		name string
		env  map[string]string
		want string
	}{
		{"default", nil, DefaultPort},
		{"PORT", map[string]string{"PORT": "9000"}, "9000"},
		{"legacy beats PORT", map[string]string{"zcrypt_PORT": "9100", "PORT": "9000"}, "9100"},
		{"ZCRYPT_PORT beats all", map[string]string{"ZCRYPT_PORT": "9200", "zcrypt_PORT": "9100", "PORT": "9000"}, "9200"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			clearAllEnv(t)
			for k, v := range c.env {
				t.Setenv(k, v)
			}
			cfg := DefaultConfig()
			cfg.applyEnvOverrides()
			assert.Equal(t, c.want, cfg.Port)
		})
	}
}
