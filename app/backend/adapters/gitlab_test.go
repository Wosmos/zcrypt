package adapters

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/zcrypt/zcrypt/types"
)

func newGitlabFake(fn rtFunc) *GitlabAdapter {
	return &GitlabAdapter{
		token:    "t",
		username: "alice",
		client:   &http.Client{Transport: fn},
	}
}

func TestGitlabPlatformNameAndUsername(t *testing.T) {
	g := &GitlabAdapter{username: "bob"}
	if g.PlatformName() != "gitlab" {
		t.Errorf("PlatformName = %q", g.PlatformName())
	}
	if g.GetUsername() != "bob" {
		t.Errorf("GetUsername = %q", g.GetUsername())
	}
}

func TestGitlabListChunksPagination(t *testing.T) {
	// Page 1: a full page of 100 blobs → pagination must continue.
	// Page 2: a short page of 2 → loop stops.
	var b strings.Builder
	b.WriteString("[")
	for i := 0; i < 100; i++ {
		if i > 0 {
			b.WriteString(",")
		}
		fmt.Fprintf(&b, `{"path":"02/f%d.bin","type":"blob"}`, i)
	}
	b.WriteString("]")
	page1 := b.String()
	page2 := `[{"path":"03/x.bin","type":"blob"},{"path":"03","type":"tree"}]`

	var pagesSeen []string
	g := newGitlabFake(func(r *http.Request) (*http.Response, error) {
		pagesSeen = append(pagesSeen, r.URL.Query().Get("page"))
		if !strings.Contains(r.URL.RawQuery, "recursive=true") {
			t.Errorf("expected recursive listing, query=%s", r.URL.RawQuery)
		}
		switch r.URL.Query().Get("page") {
		case "1":
			return jsonResp(200, page1, nil), nil
		case "2":
			return jsonResp(200, page2, nil), nil
		}
		t.Fatalf("unexpected page %s", r.URL.Query().Get("page"))
		return nil, nil
	})

	refs, err := g.ListChunks(context.Background(), "alice/repo")
	if err != nil {
		t.Fatalf("ListChunks: %v", err)
	}
	// 100 blobs from page1 + 1 blob (.bin) from page2 (tree entry excluded).
	if len(refs) != 101 {
		t.Fatalf("got %d refs, want 101", len(refs))
	}
	if len(pagesSeen) != 2 || pagesSeen[0] != "1" || pagesSeen[1] != "2" {
		t.Errorf("pagination not followed correctly: %v", pagesSeen)
	}
	if refs[100].RemotePath != "03/x.bin" || refs[100].Platform != "gitlab" {
		t.Errorf("unexpected last ref: %+v", refs[100])
	}
}

func TestGitlabDeleteSuccess(t *testing.T) {
	g := newGitlabFake(func(r *http.Request) (*http.Response, error) {
		if r.Method != "DELETE" {
			t.Fatalf("expected DELETE, got %s", r.Method)
		}
		return jsonResp(204, "", nil), nil
	})
	err := g.Delete(context.Background(), types.ChunkRef{Repo: "alice/repo", RemotePath: "02/a.bin"})
	if err != nil {
		t.Fatalf("Delete: %v", err)
	}
}

func TestGitlabDelete404Idempotent(t *testing.T) {
	g := newGitlabFake(func(r *http.Request) (*http.Response, error) {
		return jsonResp(404, `{"message":"404 File Not Found"}`, nil), nil
	})
	err := g.Delete(context.Background(), types.ChunkRef{Repo: "alice/repo", RemotePath: "02/a.bin"})
	if err != nil {
		t.Fatalf("Delete on 404 should be nil (idempotent), got %v", err)
	}
}

func TestGitlabDeleteError(t *testing.T) {
	g := newGitlabFake(func(r *http.Request) (*http.Response, error) {
		return jsonResp(500, `{"message":"boom"}`, nil), nil
	})
	err := g.Delete(context.Background(), types.ChunkRef{Repo: "alice/repo", RemotePath: "02/a.bin"})
	if err == nil {
		t.Fatal("expected error on 500")
	}
}

func TestGitlabGetRepoSize(t *testing.T) {
	g := newGitlabFake(func(r *http.Request) (*http.Response, error) {
		return jsonResp(200, `{"statistics":{"repository_size":123456}}`, nil), nil
	})
	size, err := g.GetRepoSize(context.Background(), "alice/repo")
	if err != nil {
		t.Fatalf("GetRepoSize: %v", err)
	}
	if size != 123456 {
		t.Errorf("size = %d, want 123456", size)
	}
}

func TestGitlabCreateRepo(t *testing.T) {
	g := newGitlabFake(func(r *http.Request) (*http.Response, error) {
		if r.Method != "POST" {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		return jsonResp(201, `{"path_with_namespace":"alice/newrepo"}`, nil), nil
	})
	full, err := g.CreateRepo(context.Background(), "newrepo")
	if err != nil {
		t.Fatalf("CreateRepo: %v", err)
	}
	if full != "alice/newrepo" {
		t.Errorf("full = %q", full)
	}
}

func TestGitlabUploadAndDownload(t *testing.T) {
	g := newGitlabFake(func(r *http.Request) (*http.Response, error) {
		if r.Method == "POST" {
			return jsonResp(201, `{"file_path":"02/x.bin"}`, nil), nil
		}
		// Download raw
		return jsonResp(200, "rawbytes", nil), nil
	})
	ref, err := g.Upload(context.Background(), "alice/repo", types.Chunk{
		Ref:  types.ChunkRef{RemotePath: "02/x.bin"},
		Data: []byte("data"),
	})
	if err != nil {
		t.Fatalf("Upload: %v", err)
	}
	if ref.Platform != "gitlab" || ref.RemotePath != "02/x.bin" {
		t.Errorf("unexpected ref: %+v", ref)
	}

	data, err := g.Download(context.Background(), ref)
	if err != nil {
		t.Fatalf("Download: %v", err)
	}
	if string(data) != "rawbytes" {
		t.Errorf("download = %q", data)
	}
}

func TestGitlabDownloadErrorStatus(t *testing.T) {
	g := newGitlabFake(func(r *http.Request) (*http.Response, error) {
		return jsonResp(404, `not found`, nil), nil
	})
	_, err := g.Download(context.Background(), types.ChunkRef{Repo: "alice/repo", RemotePath: "x"})
	if err == nil || !strings.Contains(err.Error(), "404") {
		t.Fatalf("expected 404 download error, got %v", err)
	}
}

func TestGitlabGetCurrentUser(t *testing.T) {
	g := newGitlabFake(func(r *http.Request) (*http.Response, error) {
		if !strings.HasSuffix(r.URL.Path, "/user") {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if r.Header.Get("PRIVATE-TOKEN") != "t" {
			t.Errorf("missing auth header")
		}
		return jsonResp(200, `{"username":"charlie"}`, nil), nil
	})
	user, err := g.getCurrentUser()
	if err != nil {
		t.Fatalf("getCurrentUser: %v", err)
	}
	if user != "charlie" {
		t.Errorf("user = %q", user)
	}
}

func TestGitlabDoJSONErrorStatus(t *testing.T) {
	g := newGitlabFake(func(r *http.Request) (*http.Response, error) {
		return jsonResp(403, `forbidden`, nil), nil
	})
	_, err := g.GetRepoSize(context.Background(), "alice/repo")
	if err == nil || !strings.Contains(err.Error(), "403") {
		t.Fatalf("expected 403 error, got %v", err)
	}
}
