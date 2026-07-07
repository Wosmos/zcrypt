package types

import (
	"database/sql/driver"
	"encoding/json"
	"testing"
)

func TestRoleString(t *testing.T) {
	if got := RoleUser.String(); got != "user" {
		t.Errorf("RoleUser.String() = %q, want %q", got, "user")
	}
	if got := RoleAdmin.String(); got != "admin" {
		t.Errorf("RoleAdmin.String() = %q, want %q", got, "admin")
	}
	// Unknown role returns the zero value ("") from the map.
	if got := Role(99).String(); got != "" {
		t.Errorf("Role(99).String() = %q, want empty string", got)
	}
}

func TestRoleIsValid(t *testing.T) {
	if !RoleUser.IsValid() {
		t.Error("RoleUser.IsValid() = false, want true")
	}
	if !RoleAdmin.IsValid() {
		t.Error("RoleAdmin.IsValid() = false, want true")
	}
	if Role(0).IsValid() {
		t.Error("Role(0).IsValid() = true, want false")
	}
	if Role(99).IsValid() {
		t.Error("Role(99).IsValid() = true, want false")
	}
}

func TestRoleMarshalJSON(t *testing.T) {
	b, err := json.Marshal(RoleAdmin)
	if err != nil {
		t.Fatalf("Marshal(RoleAdmin) error: %v", err)
	}
	if string(b) != `"admin"` {
		t.Errorf("Marshal(RoleAdmin) = %s, want %q", b, `"admin"`)
	}

	// Marshal via the method directly for the user role too.
	b, err = RoleUser.MarshalJSON()
	if err != nil {
		t.Fatalf("RoleUser.MarshalJSON() error: %v", err)
	}
	if string(b) != `"user"` {
		t.Errorf("RoleUser.MarshalJSON() = %s, want %q", b, `"user"`)
	}
}

func TestRoleUnmarshalJSON(t *testing.T) {
	// Valid input.
	var r Role
	if err := json.Unmarshal([]byte(`"admin"`), &r); err != nil {
		t.Fatalf("Unmarshal(\"admin\") error: %v", err)
	}
	if r != RoleAdmin {
		t.Errorf("Unmarshal(\"admin\") = %v, want %v", r, RoleAdmin)
	}

	if err := json.Unmarshal([]byte(`"user"`), &r); err != nil {
		t.Fatalf("Unmarshal(\"user\") error: %v", err)
	}
	if r != RoleUser {
		t.Errorf("Unmarshal(\"user\") = %v, want %v", r, RoleUser)
	}

	// Malformed JSON -> inner json.Unmarshal error branch.
	if err := json.Unmarshal([]byte(`{`), &r); err == nil {
		t.Error("Unmarshal(malformed) = nil error, want error")
	}

	// Valid JSON that is not a string (e.g. a number) reaches the method's
	// own json.Unmarshal-into-string error branch. Called directly because
	// the stdlib pre-validates syntax before dispatching to UnmarshalJSON.
	if err := r.UnmarshalJSON([]byte(`123`)); err == nil {
		t.Error("UnmarshalJSON(123) = nil error, want error")
	}

	// Well-formed JSON string but not a known role -> invalid-role branch.
	err := r.UnmarshalJSON([]byte(`"superuser"`))
	if err == nil {
		t.Error("UnmarshalJSON(\"superuser\") = nil error, want error")
	}
}

func TestRoleValue(t *testing.T) {
	v, err := RoleUser.Value()
	if err != nil {
		t.Fatalf("RoleUser.Value() error: %v", err)
	}
	got, ok := v.(string)
	if !ok {
		t.Fatalf("RoleUser.Value() type = %T, want string", v)
	}
	if got != "user" {
		t.Errorf("RoleUser.Value() = %q, want %q", got, "user")
	}

	// Ensure it satisfies driver.Valuer.
	var _ driver.Valuer = RoleAdmin
}

func TestRoleScan(t *testing.T) {
	// string source, valid.
	var r Role
	if err := r.Scan("admin"); err != nil {
		t.Fatalf("Scan(\"admin\") error: %v", err)
	}
	if r != RoleAdmin {
		t.Errorf("Scan(\"admin\") = %v, want %v", r, RoleAdmin)
	}

	// string source, invalid value.
	if err := r.Scan("nobody"); err == nil {
		t.Error("Scan(\"nobody\") = nil error, want error")
	}

	// []byte source -> unsupported type branch (Scan only accepts string).
	if err := r.Scan([]byte("user")); err == nil {
		t.Error("Scan([]byte) = nil error, want error (only string is supported)")
	}

	// nil / other unsupported type -> unsupported type branch.
	if err := r.Scan(123); err == nil {
		t.Error("Scan(int) = nil error, want error")
	}
}

func TestParseRole(t *testing.T) {
	if r, ok := ParseRole("user"); !ok || r != RoleUser {
		t.Errorf("ParseRole(\"user\") = (%v, %v), want (%v, true)", r, ok, RoleUser)
	}
	if r, ok := ParseRole("admin"); !ok || r != RoleAdmin {
		t.Errorf("ParseRole(\"admin\") = (%v, %v), want (%v, true)", r, ok, RoleAdmin)
	}
	if r, ok := ParseRole("bogus"); ok || r != 0 {
		t.Errorf("ParseRole(\"bogus\") = (%v, %v), want (0, false)", r, ok)
	}
}
