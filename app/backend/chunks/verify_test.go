package chunks

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Known SHA-256 vectors.
const (
	// SHA-256 of the empty input.
	emptyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
	// SHA-256 of "abc".
	abcHash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
)

func TestHashBytes(t *testing.T) {
	tests := []struct {
		name string
		in   []byte
		want string
	}{
		{name: "empty", in: []byte{}, want: emptyHash},
		{name: "nil", in: nil, want: emptyHash},
		{name: "abc", in: []byte("abc"), want: abcHash},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := HashBytes(tt.in); got != tt.want {
				t.Errorf("HashBytes(%q) = %s, want %s", tt.in, got, tt.want)
			}
		})
	}
}

func TestHashFile(t *testing.T) {
	dir := t.TempDir()

	emptyPath := filepath.Join(dir, "empty.bin")
	if err := writeFile(t, emptyPath, nil); err != nil {
		t.Fatalf("setup empty file: %v", err)
	}
	if got, err := HashFile(emptyPath); err != nil || got != emptyHash {
		t.Errorf("HashFile(empty) = %s, %v; want %s, nil", got, err, emptyHash)
	}

	abcPath := filepath.Join(dir, "abc.bin")
	if err := writeFile(t, abcPath, []byte("abc")); err != nil {
		t.Fatalf("setup abc file: %v", err)
	}
	if got, err := HashFile(abcPath); err != nil || got != abcHash {
		t.Errorf("HashFile(abc) = %s, %v; want %s, nil", got, err, abcHash)
	}
}

func TestHashFileMissing(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "does-not-exist.bin")
	got, err := HashFile(missing)
	if err == nil {
		t.Fatalf("HashFile(missing) = %s, nil; want error", got)
	}
	if got != "" {
		t.Errorf("HashFile(missing) returned %q, want empty string on error", got)
	}
	if !strings.Contains(err.Error(), "read file") {
		t.Errorf("HashFile(missing) error = %v, want it to mention %q", err, "read file")
	}
}

func TestVerifyChunkSuccess(t *testing.T) {
	path := filepath.Join(t.TempDir(), "chunk.bin")
	if err := writeFile(t, path, []byte("abc")); err != nil {
		t.Fatalf("setup: %v", err)
	}
	if err := VerifyChunk(path, abcHash); err != nil {
		t.Errorf("VerifyChunk(matching) = %v, want nil", err)
	}
}

func TestVerifyChunkMismatch(t *testing.T) {
	path := filepath.Join(t.TempDir(), "chunk.bin")
	if err := writeFile(t, path, []byte("abc")); err != nil {
		t.Fatalf("setup: %v", err)
	}
	err := VerifyChunk(path, emptyHash) // wrong expected hash
	if err == nil {
		t.Fatal("VerifyChunk(mismatch) = nil, want integrity error")
	}
	if !strings.Contains(err.Error(), "chunk integrity failed") {
		t.Errorf("VerifyChunk(mismatch) error = %v, want it to mention %q", err, "chunk integrity failed")
	}
}

func TestVerifyChunkReadError(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "nope.bin")
	err := VerifyChunk(missing, abcHash)
	if err == nil {
		t.Fatal("VerifyChunk(missing) = nil, want read error")
	}
	if !strings.Contains(err.Error(), "read file") {
		t.Errorf("VerifyChunk(missing) error = %v, want it to mention %q", err, "read file")
	}
}

// writeFile is a small helper that writes data to path.
func writeFile(t *testing.T, path string, data []byte) error {
	t.Helper()
	return os.WriteFile(path, data, 0o600)
}
