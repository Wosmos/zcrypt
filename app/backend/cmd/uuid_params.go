package cmd

import (
	"net/http"

	"github.com/google/uuid"
)

// uuidPathParams rejects a request whose named path values are not UUIDs with a
// 400, before they reach a ::uuid cast in SQL and surface as a 500.
func uuidPathParams(next http.HandlerFunc, names ...string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		for _, name := range names {
			if uuid.Validate(r.PathValue(name)) != nil {
				http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
				return
			}
		}
		next(w, r)
	}
}

// validOptionalUUID reports whether an optional user-supplied UUID is absent or well formed.
func validOptionalUUID(id *string) bool {
	return id == nil || uuid.Validate(*id) == nil
}
