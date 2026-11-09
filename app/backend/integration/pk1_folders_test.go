//go:build integration

package integration_test

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Backup names folders with values sealed to the account public key
// (docs/CRYPTO_FORMAT.md 2.2). An unlocked client lists exactly those, at any
// depth, to adopt them; nobody else's and nothing trashed.
func TestListFoldersSealedPk1(t *testing.T) {
	ts := setupTestServer(t)
	token := ts.registerAndLogin("pk1folders@example.com", "SecurePass@123!")
	other := ts.registerAndLogin("pk1other@example.com", "SecurePass@123!")

	create := func(tok, name string, parent *string) string {
		body := map[string]interface{}{"encrypted_name": name}
		if parent != nil {
			body["parent_id"] = *parent
		}
		var f struct {
			ID string `json:"id"`
		}
		decodeJSON(t, ts.POST("/api/folders", body, tok), &f)
		require.NotEmpty(t, f.ID)
		return f.ID
	}
	root := create(token, "pk1:Backups", nil)
	nested := create(token, "pk1:Camera", &root)
	create(token, "bm9ybWFsbmFtZQ==", nil)
	trashed := create(token, "pk1:Old", nil)
	create(other, "pk1:NotYours", nil)

	resp := ts.DELETE("/api/folders/"+trashed, token)
	resp.Body.Close()

	var got []struct {
		ID            string `json:"id"`
		EncryptedName string `json:"encrypted_name"`
	}
	decodeJSON(t, ts.GET("/api/folders?sealed=pk1", token), &got)
	ids := map[string]bool{}
	for _, f := range got {
		ids[f.ID] = true
	}
	assert.Equal(t, map[string]bool{root: true, nested: true}, ids)

	unauth := ts.GET("/api/folders?sealed=pk1", "")
	assert.Equal(t, http.StatusUnauthorized, unauth.StatusCode)
	unauth.Body.Close()
}
