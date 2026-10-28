package cmd

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/index"
	"github.com/zcrypt/zcrypt/types"
)

func TestParseListPage(t *testing.T) {
	sorts := map[string]string{"created_at": "", "rating": ""}
	parse := func(qs string) (index.ListPage, error) {
		return parseListPage(httptest.NewRequest("GET", "/x?"+qs, nil), sorts, "created_at")
	}

	p, err := parse("")
	require.NoError(t, err)
	assert.Equal(t, index.ListPage{Limit: defaultPageSize, Sort: "created_at", Desc: true}, p)

	p, err = parse("limit=500&offset=40&sort=rating&order=asc&q=%20%20alice%20")
	require.NoError(t, err)
	assert.Equal(t, index.ListPage{Limit: maxPageSize, Offset: 40, Search: "alice", Sort: "rating"}, p)

	p, err = parse("limit=0")
	require.NoError(t, err)
	assert.Equal(t, 1, p.Limit)

	p, err = parse("q=" + strings.Repeat("é", 150))
	require.NoError(t, err)
	assert.Equal(t, maxSearchRunes, len([]rune(p.Search)))

	for _, bad := range []string{"limit=abc", "offset=-1", "offset=x", "offset=100001", "sort=password_hash", "order=sideways"} {
		_, err := parse(bad)
		assert.Error(t, err, bad)
	}
}

func TestParseFamilies(t *testing.T) {
	all, err := parseFamilies("")
	require.NoError(t, err)
	assert.Equal(t, index.JourneyFamilyNames, all)

	got, err := parseFamilies("auth, security,auth")
	require.NoError(t, err)
	assert.Equal(t, []string{"auth", "security"}, got)

	_, err = parseFamilies("auth,nope")
	assert.ErrorContains(t, err, "unknown kind")
}

func TestRiskFlags(t *testing.T) {
	now := time.Now()
	recent := now.Add(-time.Hour)
	quiet := &types.AdminUser{User: types.User{TOTPEnabled: true, EmailVerified: true}, LastSeenAt: &recent}
	assert.Empty(t, riskFlags(quiet, &index.UserReportStats{}, now))

	old := now.Add(-200 * 24 * time.Hour)
	risky := &types.AdminUser{User: types.User{Role: types.RoleAdmin, DeletionScheduledAt: &now}, LastSeenAt: &old}
	flags := riskFlags(risky, &index.UserReportStats{FailedSignins7d: 6, Countries7d: []string{"DE", "PK", "US"}}, now)
	codes := []string{}
	for _, f := range flags {
		codes = append(codes, f.Code+":"+f.Severity)
	}
	assert.Equal(t, []string{"no_2fa:high", "failed_sign_ins:high", "many_countries:high",
		"unverified_email:medium", "deletion_pending:medium", "dormant:low"}, codes)

	warn := riskFlags(&types.AdminUser{User: types.User{TOTPEnabled: true, EmailVerified: true}},
		&index.UserReportStats{FailedSignins7d: 3, LastActiveAt: &recent}, now)
	require.Len(t, warn, 1)
	assert.Equal(t, RiskFlag{Code: "failed_sign_ins", Severity: "medium", Value: 3}, warn[0])

	plain := riskFlags(&types.AdminUser{User: types.User{EmailVerified: true}, LastSeenAt: &recent}, &index.UserReportStats{}, now)
	assert.Equal(t, []RiskFlag{{Code: "no_2fa", Severity: "low"}}, plain)
}

func TestDeviceLabelAndCountryCode(t *testing.T) {
	assert.Equal(t, "", deviceLabel(""))
	assert.Equal(t, "Firefox on Linux", deviceLabel("Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0"))
	assert.True(t, isCountryCode("PK"))
	for _, c := range []string{"", "pk", "XX", "T1", "PAK", "P1"} {
		assert.False(t, isCountryCode(c), c)
	}
}
