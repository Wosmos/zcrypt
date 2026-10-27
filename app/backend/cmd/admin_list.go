package cmd

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/zcrypt/zcrypt/index"
)

const (
	defaultPageSize = 25
	maxPageSize     = 100
	maxPageOffset   = 100_000
	maxSearchRunes  = 100
)

// parseListPage reads the shared admin list parameters: limit (clamped to
// 1..100), offset, q (trimmed and capped), sort (checked against sorts; an
// unknown key is an error so a typo never silently sorts by something else)
// and order (asc or desc, desc by default).
func parseListPage(r *http.Request, sorts map[string]string, defaultSort string) (index.ListPage, error) {
	q := r.URL.Query()
	p := index.ListPage{Limit: defaultPageSize, Sort: defaultSort, Desc: true}
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return p, errors.New("limit must be a number")
		}
		p.Limit = min(max(n, 1), maxPageSize)
	}
	if v := q.Get("offset"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 || n > maxPageOffset {
			return p, errors.New("offset must be between 0 and 100000")
		}
		p.Offset = n
	}
	p.Search = strings.TrimSpace(q.Get("q"))
	if utf8.RuneCountInString(p.Search) > maxSearchRunes {
		p.Search = string([]rune(p.Search)[:maxSearchRunes])
	}
	if v := q.Get("sort"); v != "" {
		if _, ok := sorts[v]; !ok {
			return p, errors.New("unknown sort key")
		}
		p.Sort = v
	}
	switch q.Get("order") {
	case "", "desc":
	case "asc":
		p.Desc = false
	default:
		return p, errors.New("order must be asc or desc")
	}
	return p, nil
}

// pageBody is the response shape every paginated admin list shares.
func pageBody(key string, items any, total int, p index.ListPage) map[string]any {
	return map[string]any{key: items, "total": total, "limit": p.Limit, "offset": p.Offset}
}
