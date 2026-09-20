package cmd

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestHandleHealthReportsCommit covers the half of /api/health that exists for
// operators rather than load balancers. A bare {"status":"ok"} answered 200 for
// a week while production served a week-old image, because "something is
// answering" and "the right thing is answering" were indistinguishable from
// outside. CI now polls this endpoint for the commit it just pushed, so the
// field has to be present when Railway supplies one and absent when it does
// not, and the body has to stay valid JSON either way.
func TestHandleHealthReportsCommit(t *testing.T) {
	tests := []struct {
		name       string
		commit     string
		wantCommit string
		wantField  bool
	}{
		{"reports the deployed commit", "abc1234", "abc1234", true},
		{"omits the field when unset (local run, other host)", "", "", false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			// deployedCommit is read from the environment once at startup, so
			// set the package variable directly rather than t.Setenv.
			orig := deployedCommit
			deployedCommit = tc.commit
			t.Cleanup(func() { deployedCommit = orig })

			rec := httptest.NewRecorder()
			(&Server{}).HandleHealth(rec, httptest.NewRequest(http.MethodGet, "/api/health", nil))

			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Errorf("Content-Type = %q, want application/json", ct)
			}

			var body map[string]string
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatalf("body is not valid JSON (%v): %s", err, rec.Body.String())
			}
			if body["status"] != "ok" {
				t.Errorf("status = %q, want ok", body["status"])
			}

			got, present := body["commit"]
			if present != tc.wantField {
				t.Fatalf("commit field present = %v, want %v (body: %s)", present, tc.wantField, rec.Body.String())
			}
			if got != tc.wantCommit {
				t.Errorf("commit = %q, want %q", got, tc.wantCommit)
			}
		})
	}
}
