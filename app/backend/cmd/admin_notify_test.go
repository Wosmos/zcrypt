package cmd

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func planOK(p string) bool { return p == "free" || p == "pro" }

func ids(n int) []string {
	out := make([]string, n)
	for i := range out {
		out[i] = uuid.NewString()
	}
	return out
}

func TestFormatQuotaBytes(t *testing.T) {
	gb := int64(1) << 30
	zero := int64(0)
	five, tw := 5*gb, 20*gb
	half := gb / 2
	assert.Equal(t, "Default", formatQuotaBytes(nil))
	assert.Equal(t, "Unlimited", formatQuotaBytes(&zero))
	assert.Equal(t, "5 GB", formatQuotaBytes(&five))
	assert.Equal(t, "20 GB", formatQuotaBytes(&tw))
	assert.Equal(t, "512 MB", formatQuotaBytes(&half))
}

func TestNotifyOptsValidate(t *testing.T) {
	assert.True(t, notifyOpts{}.enabled())
	off := false
	assert.False(t, notifyOpts{Notify: &off}.enabled())
	assert.NoError(t, notifyOpts{Note: strings.Repeat("a", 500)}.validate())
	assert.Error(t, notifyOpts{Note: strings.Repeat("é", 501)}.validate())
}

func TestValidateBulk(t *testing.T) {
	self := uuid.NewString()
	val := func(s string) json.RawMessage { return json.RawMessage(s) }

	cases := []struct {
		name    string
		req     bulkRequest
		wantErr string
	}{
		{"ok plan", bulkRequest{IDs: ids(2), Action: "set_plan", Value: val(`"pro"`)}, ""},
		{"ok quota null", bulkRequest{IDs: ids(1), Action: "set_quota", Value: val(`null`)}, ""},
		{"ok quota number", bulkRequest{IDs: ids(1), Action: "set_quota", Value: val(`1024`)}, ""},
		{"ok role", bulkRequest{IDs: ids(1), Action: "set_role", Value: val(`"admin"`)}, ""},
		{"ok delete", bulkRequest{IDs: ids(1), Action: "delete"}, ""},
		{"empty ids", bulkRequest{Action: "delete"}, "between 1 and 500"},
		{"too many", bulkRequest{IDs: ids(501), Action: "delete"}, "between 1 and 500"},
		{"bad uuid", bulkRequest{IDs: []string{"nope"}, Action: "delete"}, "invalid user id"},
		{"unknown action", bulkRequest{IDs: ids(1), Action: "explode"}, "action must be"},
		{"unknown plan", bulkRequest{IDs: ids(1), Action: "set_plan", Value: val(`"gold"`)}, "unknown plan"},
		{"plan not string", bulkRequest{IDs: ids(1), Action: "set_plan", Value: val(`5`)}, "unknown plan"},
		{"negative quota", bulkRequest{IDs: ids(1), Action: "set_quota", Value: val(`-1`)}, "quota must be"},
		{"bad role", bulkRequest{IDs: ids(1), Action: "set_role", Value: val(`"root"`)}, "role must be"},
		{"role not string", bulkRequest{IDs: ids(1), Action: "set_role", Value: val(`1`)}, "role must be"},
		{"self delete", bulkRequest{IDs: []string{self}, Action: "delete"}, "own account"},
		{"self role", bulkRequest{IDs: []string{self}, Action: "set_role", Value: val(`"user"`)}, "own account"},
		{"self plan ok", bulkRequest{IDs: []string{self}, Action: "set_plan", Value: val(`"pro"`)}, ""},
		{"long note", bulkRequest{IDs: ids(1), Action: "delete", notifyOpts: notifyOpts{Note: strings.Repeat("x", 501)}}, "note must be"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := c.req
			_, err := validateBulk(&req, self, planOK)
			if c.wantErr == "" {
				assert.NoError(t, err)
				return
			}
			if assert.Error(t, err) {
				assert.Contains(t, err.Error(), c.wantErr)
			}
		})
	}
}

func TestValidateBulkDedupesAndCanonicalisesIDs(t *testing.T) {
	id := uuid.NewString()
	req := bulkRequest{IDs: []string{id, strings.ToUpper(id)}, Action: "delete"}
	_, err := validateBulk(&req, uuid.NewString(), planOK)
	assert.NoError(t, err)
	assert.Equal(t, []string{id}, req.IDs)
}

func TestValidateEmailRequest(t *testing.T) {
	ok := func(p string) bool { return p == "pro" }
	good := sendEmailRequest{Subject: "Hi", Body: "Body", Audience: "all"}
	a, err := validateEmailRequest(&good, ok)
	assert.NoError(t, err)
	assert.Equal(t, "all", a.kind)

	plan := sendEmailRequest{Subject: "Hi", Body: "b", Audience: "plan:pro"}
	a, err = validateEmailRequest(&plan, ok)
	assert.NoError(t, err)
	assert.Equal(t, "pro", a.planID)

	bad := []sendEmailRequest{
		{Subject: "", Body: "b", Audience: "all"},
		{Subject: strings.Repeat("a", 151), Body: "b", Audience: "all"},
		{Subject: "a\nb", Body: "b", Audience: "all"},
		{Subject: "a", Body: "  ", Audience: "all"},
		{Subject: "a", Body: strings.Repeat("a", 20001), Audience: "all"},
		{Subject: "a", Body: "b", Audience: "plan:gold"},
		{Subject: "a", Body: "b", Audience: "ids"},
		{Subject: "a", Body: "b", Audience: "ids", IDs: []string{"x"}},
		{Subject: "a", Body: "b", Audience: "everyone"},
	}
	for i := range bad {
		_, err := validateEmailRequest(&bad[i], ok)
		assert.Error(t, err, "case %d", i)
	}
}
