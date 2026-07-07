package cmd

import "time"

// Metadata masking for PUBLIC (unauthenticated) endpoints.
//
// A share / folder-share / send link is handed to someone who may not be able to
// (or may choose not to) download the ciphertext — password-gated, expired,
// rate-limited, or just previewing. For that viewer we coarsen the two fields
// that would otherwise leak precise information: the exact byte size and the
// exact upload time. This is a modest privacy nicety, NOT an at-rest guarantee:
// the server still stores true values (accounting needs them) and the ciphertext
// itself reveals size to a downloader. So masking lives ONLY in the public
// response layer — never in storage or the owner/authorized-member views.

// sizeLadder is a 1-2-5-per-decade ladder (decimal KB) up to just past the
// per-file cap, so SizeBucket can round any real file size up to a coarse band.
var sizeLadder = buildSizeLadder()

func buildSizeLadder() []int64 {
	steps := []int64{1, 2, 5}
	var ladder []int64
	for base := int64(1000); base <= maxUploadBytes*10; base *= 10 { // 1KB … past 10GiB cap
		for _, m := range steps {
			ladder = append(ladder, base*m)
		}
	}
	return ladder
}

// SizeBucket rounds a true byte count UP to the next value on the 1-2-5 ladder so
// many distinct exact sizes collapse into one band on public metadata. 0 (and
// negatives) map to 0; rounding up never understates the size; the result is
// capped at maxUploadBytes (the per-file limit) so a bucket never exceeds it.
// Idempotent: SizeBucket(SizeBucket(n)) == SizeBucket(n).
func SizeBucket(n int64) int64 {
	if n <= 0 {
		return 0
	}
	for _, v := range sizeLadder {
		if v >= n {
			if v > maxUploadBytes {
				return maxUploadBytes
			}
			return v
		}
	}
	return maxUploadBytes
}

// CoarsenTimeUTC truncates a timestamp to UTC midnight (day granularity, timezone
// stripped) so public metadata never reveals the precise upload time. Idempotent.
func CoarsenTimeUTC(t time.Time) time.Time {
	return t.UTC().Truncate(24 * time.Hour)
}
