package cmd

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/zcrypt/zcrypt/config"
)

func newMaintenanceTestServer(secret string) *Server {
	return &Server{cfg: &config.Config{MaintenanceSecret: secret}}
}

func TestMaintenanceToggleRequiresSecret(t *testing.T) {
	s := newMaintenanceTestServer("correct-secret")

	req := httptest.NewRequest(http.MethodPost, "/api/internal/maintenance", bytes.NewBufferString(`{"enabled":true}`))
	w := httptest.NewRecorder()
	s.HandleMaintenanceToggle(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("missing secret: expected 404, got %d", w.Code)
	}
	if s.InMaintenanceMode() {
		t.Fatal("maintenance mode should not have been enabled without the secret")
	}

	req = httptest.NewRequest(http.MethodPost, "/api/internal/maintenance", bytes.NewBufferString(`{"enabled":true}`))
	req.Header.Set("X-Maintenance-Secret", "wrong-secret")
	w = httptest.NewRecorder()
	s.HandleMaintenanceToggle(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("wrong secret: expected 404, got %d", w.Code)
	}
	if s.InMaintenanceMode() {
		t.Fatal("maintenance mode should not have been enabled with the wrong secret")
	}
}

func TestMaintenanceToggleDisabledWhenNoSecretConfigured(t *testing.T) {
	s := newMaintenanceTestServer("")

	req := httptest.NewRequest(http.MethodPost, "/api/internal/maintenance", bytes.NewBufferString(`{"enabled":true}`))
	req.Header.Set("X-Maintenance-Secret", "")
	w := httptest.NewRecorder()
	s.HandleMaintenanceToggle(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 when no secret is configured, got %d", w.Code)
	}
	if s.InMaintenanceMode() {
		t.Fatal("maintenance mode should be impossible to enable when MaintenanceSecret is unset")
	}
}

func TestMaintenanceToggleOnAndOff(t *testing.T) {
	s := newMaintenanceTestServer("correct-secret")

	toggle := func(enabled bool) int {
		body := `{"enabled":false}`
		if enabled {
			body = `{"enabled":true}`
		}
		req := httptest.NewRequest(http.MethodPost, "/api/internal/maintenance", bytes.NewBufferString(body))
		req.Header.Set("X-Maintenance-Secret", "correct-secret")
		w := httptest.NewRecorder()
		s.HandleMaintenanceToggle(w, req)
		return w.Code
	}

	if code := toggle(true); code != http.StatusOK {
		t.Fatalf("enable: expected 200, got %d", code)
	}
	if !s.InMaintenanceMode() {
		t.Fatal("expected maintenance mode to be enabled")
	}

	if code := toggle(false); code != http.StatusOK {
		t.Fatalf("disable: expected 200, got %d", code)
	}
	if s.InMaintenanceMode() {
		t.Fatal("expected maintenance mode to be disabled")
	}
}

func TestMaintenanceGateBlocksMutatingRequestsOnly(t *testing.T) {
	s := newMaintenanceTestServer("correct-secret")
	s.maintenanceMode.Store(true)

	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	gated := s.MaintenanceGate(inner)

	cases := []struct {
		method, path string
		wantCode     int
	}{
		{http.MethodPost, "/api/upload/init", http.StatusServiceUnavailable},
		{http.MethodPut, "/api/files/x", http.StatusServiceUnavailable},
		{http.MethodDelete, "/api/files/x", http.StatusServiceUnavailable},
		{http.MethodGet, "/api/files", http.StatusOK},
		{http.MethodOptions, "/api/upload/init", http.StatusOK},
		{http.MethodGet, "/api/health", http.StatusOK},
		{http.MethodPost, "/api/internal/maintenance", http.StatusOK},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(tc.method, tc.path, nil)
		w := httptest.NewRecorder()
		gated.ServeHTTP(w, req)
		if w.Code != tc.wantCode {
			t.Errorf("%s %s: expected %d, got %d", tc.method, tc.path, tc.wantCode, w.Code)
		}
	}
}

func TestMaintenanceGatePassesThroughWhenDisabled(t *testing.T) {
	s := newMaintenanceTestServer("correct-secret")
	// maintenanceMode left at its zero value (false).

	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	})
	gated := s.MaintenanceGate(inner)

	req := httptest.NewRequest(http.MethodPost, "/api/upload/init", nil)
	w := httptest.NewRecorder()
	gated.ServeHTTP(w, req)
	if w.Code != http.StatusTeapot {
		t.Fatalf("expected request to pass through to inner handler, got %d", w.Code)
	}
}
