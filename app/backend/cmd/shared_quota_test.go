package cmd

import "testing"

// TestSharedStorageQuotaValue pins the shared-pool cap. The number is a product
// decision, not an implementation detail: shared storage runs on an admin's
// personal platform token, so every byte is charged to a real person's real
// account. If someone changes this, it should be because the decision changed.
func TestSharedStorageQuotaValue(t *testing.T) {
	const oneGiB = int64(1) << 30
	if sharedStorageQuotaBytes != oneGiB {
		t.Fatalf("shared storage cap = %d bytes, want %d (1 GiB)", sharedStorageQuotaBytes, oneGiB)
	}
}

// TestSharedQuotaIsBelowPerFileCap guards a combination that would read as a
// bug to a user: if the per-file limit were larger than the whole shared
// allowance, someone on shared storage could pass the per-file check and then
// be refused by the quota check, with two different limits blaming each other.
func TestSharedQuotaIsBelowPerFileCap(t *testing.T) {
	if sharedStorageQuotaBytes > maxUploadBytes {
		t.Fatalf("shared cap %d exceeds the per-file cap %d, so the per-file error can never fire for shared users",
			sharedStorageQuotaBytes, maxUploadBytes)
	}
}
