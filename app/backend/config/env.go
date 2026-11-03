package config

import (
	"os"
	"strconv"
	"strings"
)

// EnvPositiveInt64 reads name from the environment as a base-10 integer. An
// unset, malformed, zero or negative value yields def.
func EnvPositiveInt64(name string, def int64) int64 {
	n, err := strconv.ParseInt(strings.TrimSpace(os.Getenv(name)), 10, 64)
	if err != nil || n <= 0 {
		return def
	}
	return n
}
