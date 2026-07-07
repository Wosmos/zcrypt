package cmd

import (
	"testing"
	"time"
)

func TestSizeBucket(t *testing.T) {
	t.Run("zero and negatives map to zero", func(t *testing.T) {
		for _, n := range []int64{0, -1, -1000} {
			if got := SizeBucket(n); got != 0 {
				t.Errorf("SizeBucket(%d) = %d, want 0", n, got)
			}
		}
	})

	t.Run("rounds up, never understates", func(t *testing.T) {
		for _, n := range []int64{1, 999, 1000, 1001, 3_000_001, 1 << 30} {
			if got := SizeBucket(n); got < n {
				t.Errorf("SizeBucket(%d) = %d, must be >= input", n, got)
			}
		}
	})

	t.Run("never exceeds the per-file cap", func(t *testing.T) {
		for _, n := range []int64{1, 1 << 20, maxUploadBytes - 1, maxUploadBytes} {
			if got := SizeBucket(n); got > maxUploadBytes {
				t.Errorf("SizeBucket(%d) = %d, must be <= maxUploadBytes %d", n, got, maxUploadBytes)
			}
		}
	})

	t.Run("idempotent", func(t *testing.T) {
		for _, n := range []int64{1, 999, 1000, 1500, 4_999_999, 1 << 30, maxUploadBytes} {
			once := SizeBucket(n)
			if twice := SizeBucket(once); twice != once {
				t.Errorf("SizeBucket not idempotent at %d: %d then %d", n, once, twice)
			}
		}
	})

	t.Run("monotonic non-decreasing", func(t *testing.T) {
		var prev int64
		for n := int64(1); n < (1 << 32); n = n*3 + 7 {
			b := SizeBucket(n)
			if b < prev {
				t.Errorf("SizeBucket(%d)=%d decreased below previous %d", n, b, prev)
			}
			prev = b
		}
	})

	t.Run("distinct exact sizes in one band become indistinguishable", func(t *testing.T) {
		// Two sizes between the 2MB and 5MB ladder steps must bucket identically.
		a, b := int64(3_000_001), int64(4_999_999)
		if SizeBucket(a) != SizeBucket(b) {
			t.Errorf("expected %d and %d to share a bucket, got %d vs %d", a, b, SizeBucket(a), SizeBucket(b))
		}
		// Exactly a ladder value stays itself; one byte over jumps to the next band.
		if SizeBucket(2000) != 2000 {
			t.Errorf("SizeBucket(2000) = %d, want the 2000 ladder value", SizeBucket(2000))
		}
		if SizeBucket(2001) == 2000 {
			t.Errorf("SizeBucket(2001) must exceed 2000")
		}
	})
}

func TestCoarsenTimeUTC(t *testing.T) {
	// A precise timestamp with a timezone collapses to UTC midnight.
	loc := time.FixedZone("IST", 5*3600)
	in := time.Date(2026, 7, 8, 14, 37, 42, 123, loc)
	got := CoarsenTimeUTC(in)

	if got.Location() != time.UTC {
		t.Errorf("expected UTC, got %v", got.Location())
	}
	if got.Hour() != 0 || got.Minute() != 0 || got.Second() != 0 || got.Nanosecond() != 0 {
		t.Errorf("expected midnight, got %v", got)
	}
	// 2026-07-08 14:37 IST (+0500) is 2026-07-08 09:37 UTC → truncates to 2026-07-08 UTC.
	if got.Year() != 2026 || got.Month() != time.July || got.Day() != 8 {
		t.Errorf("expected 2026-07-08, got %v", got)
	}

	// Idempotent.
	if again := CoarsenTimeUTC(got); !again.Equal(got) {
		t.Errorf("CoarsenTimeUTC not idempotent: %v then %v", got, again)
	}
}
