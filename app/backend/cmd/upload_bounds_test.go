package cmd

import "testing"

func TestChunkLayoutValid(t *testing.T) {
	const mib = int64(1) << 20
	cases := []struct {
		name      string
		size      int64
		count     int
		chunkSize int64
		want      bool
	}{
		{"exact multiple", 20 * mib, 2, 10 * mib, true},
		{"remainder chunk", 20*mib + 1, 3, 10 * mib, true},
		{"single small file", 100, 1, 10 * mib, true},
		{"too many chunks for the chunk size", 20 * mib, 3, 10 * mib, false},
		{"too few chunks for the chunk size", 20*mib + 1, 2, 10 * mib, false},
		{"undeclared chunk size", 40 * mib, 10, 0, true},
		{"more chunks than bytes", 10, 11, 0, false},
	}
	for _, c := range cases {
		if got := chunkLayoutValid(c.size, c.count, c.chunkSize); got != c.want {
			t.Errorf("%s: chunkLayoutValid(%d, %d, %d) = %v, want %v", c.name, c.size, c.count, c.chunkSize, got, c.want)
		}
	}
}

func TestMaxEncryptedTotal(t *testing.T) {
	const mib = int64(1) << 20
	size := 100 * mib
	honest := size + 25*28
	if limit := maxEncryptedTotal(size, 25); honest > limit {
		t.Fatalf("an honest 25-chunk upload (%d bytes) exceeds the limit %d", honest, limit)
	}
	if limit := maxEncryptedTotal(1, 1); limit < 1+28 {
		t.Fatalf("a 1-byte file's single chunk (29 bytes) exceeds the limit %d", limit)
	}
	tiny := maxEncryptedTotal(size, int(size))
	if tiny > size+size/32 {
		t.Fatalf("splitting into 1-byte chunks inflates the allowance to %d for a %d-byte file", tiny, size)
	}
}
