//go:build integration

package integration_test

import (
	"encoding/json"
	"net/http"

	"github.com/zcrypt/zcrypt/cmd"
)

// jsonUnmarshal is a helper alias for json.Unmarshal used in tests.
func jsonUnmarshal(data []byte, v interface{}) error {
	return json.Unmarshal(data, v)
}

// buildMux wires all HTTP routes — mirrors main.go route registration.
// This keeps tests decoupled from main.go while using the same handler logic.
func buildMux(s *cmd.Server) http.Handler {
	mux := http.NewServeMux()
	s.RegisterRoutes(mux)
	return mux
}
