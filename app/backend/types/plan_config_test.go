package types

import (
	"encoding/json"
	"testing"
)

func TestPlanConfigMissingBatchLimitDefaults(t *testing.T) {
	var old PlanConfigs
	if err := json.Unmarshal([]byte(`{"plans":[{"id":"free","name":"Free"}]}`), &old); err != nil {
		t.Fatal(err)
	}
	if got := old.Plans[0].MaxSpaceBatchFiles; got != DefaultMaxSpaceBatchFiles {
		t.Fatalf("missing field = %d, want %d", got, DefaultMaxSpaceBatchFiles)
	}
	var explicit PlanConfigs
	if err := json.Unmarshal([]byte(`{"plans":[{"id":"pro","max_space_batch_files":0}]}`), &explicit); err != nil {
		t.Fatal(err)
	}
	if explicit.Plans[0].MaxSpaceBatchFiles != 0 {
		t.Fatal("explicit 0 (unlimited) must be preserved")
	}
}
