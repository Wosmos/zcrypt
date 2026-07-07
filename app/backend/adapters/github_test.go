package adapters

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/google/go-github/v60/github"
	"github.com/zcrypt/zcrypt/types"
)

// newGithubFake wires a GithubAdapter to a fake transport so no real network
// calls happen. owner is set directly since we bypass the authenticating
// constructor.
func newGithubFake(owner string, fn rtFunc) *GithubAdapter {
	return &GithubAdapter{
		owner:  owner,
		token:  "t",
		client: github.NewClient(&http.Client{Transport: fn}),
	}
}

func TestGithubParseRepo(t *testing.T) {
	g := &GithubAdapter{owner: "default"}
	cases := []struct {
		in        string
		wantOwner string
		wantName  string
	}{
		{"alice/repo-name", "alice", "repo-name"},
		{"github_bob_secret-repo", "bob", "secret-repo"},
		{"barename", "default", "barename"}, // fallback
	}
	for _, c := range cases {
		o, n := g.parseRepo(c.in)
		if o != c.wantOwner || n != c.wantName {
			t.Errorf("parseRepo(%q) = (%q,%q), want (%q,%q)", c.in, o, n, c.wantOwner, c.wantName)
		}
	}
}

func TestRepoNameFromFull(t *testing.T) {
	if got := repoNameFromFull("owner/repo"); got != "repo" {
		t.Errorf("repoNameFromFull(owner/repo) = %q, want repo", got)
	}
	if got := repoNameFromFull("barename"); got != "barename" {
		t.Errorf("repoNameFromFull(barename) = %q, want barename", got)
	}
}

func TestGithubPlatformNameAndUsername(t *testing.T) {
	g := &GithubAdapter{owner: "alice"}
	if g.PlatformName() != "github" {
		t.Errorf("PlatformName = %q", g.PlatformName())
	}
	if g.GetUsername() != "alice" {
		t.Errorf("GetUsername = %q", g.GetUsername())
	}
}

func TestGithubListChunks(t *testing.T) {
	tree := `{
		"sha":"root",
		"tree":[
			{"path":"02","type":"tree"},
			{"path":"02/aaa.bin","type":"blob","size":100},
			{"path":"03/bbb.bin","type":"blob","size":200},
			{"path":"README.md","type":"blob","size":10}
		],
		"truncated":false
	}`
	g := newGithubFake("alice", func(r *http.Request) (*http.Response, error) {
		if !strings.Contains(r.URL.Path, "/git/trees/") {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		return jsonResp(200, tree, nil), nil
	})

	refs, err := g.ListChunks(context.Background(), "alice/repo")
	if err != nil {
		t.Fatalf("ListChunks: %v", err)
	}
	if len(refs) != 2 {
		t.Fatalf("got %d refs, want 2 (.bin blobs only): %+v", len(refs), refs)
	}
	// Full sharded paths must survive.
	paths := map[string]bool{refs[0].RemotePath: true, refs[1].RemotePath: true}
	if !paths["02/aaa.bin"] || !paths["03/bbb.bin"] {
		t.Errorf("unexpected paths: %v", paths)
	}
	if refs[0].Platform != "github" || refs[0].Repo != "alice/repo" {
		t.Errorf("unexpected ref metadata: %+v", refs[0])
	}
	if refs[0].Size == 0 {
		t.Errorf("expected non-zero size, got %+v", refs[0])
	}
}

func TestGithubListChunksTruncatedErrors(t *testing.T) {
	tree := `{"sha":"r","tree":[{"path":"02/a.bin","type":"blob","size":1}],"truncated":true}`
	g := newGithubFake("alice", func(r *http.Request) (*http.Response, error) {
		return jsonResp(200, tree, nil), nil
	})
	refs, err := g.ListChunks(context.Background(), "alice/repo")
	if err == nil {
		t.Fatalf("expected truncation error, got nil (refs=%v)", refs)
	}
	if !strings.Contains(err.Error(), "truncated") {
		t.Errorf("error should mention truncation: %v", err)
	}
}

func TestGithubListChunksEmptyRepo404(t *testing.T) {
	g := newGithubFake("alice", func(r *http.Request) (*http.Response, error) {
		return jsonResp(404, `{"message":"Not Found"}`, nil), nil
	})
	refs, err := g.ListChunks(context.Background(), "alice/repo")
	if err != nil {
		t.Fatalf("empty repo (404) should be nil error, got %v", err)
	}
	if refs != nil {
		t.Errorf("expected nil refs, got %v", refs)
	}
}

func TestGithubDeleteSuccess(t *testing.T) {
	var deleted bool
	g := newGithubFake("alice", func(r *http.Request) (*http.Response, error) {
		switch r.Method {
		case "GET":
			return jsonResp(200, `{"type":"file","sha":"abc123","path":"02/a.bin"}`, nil), nil
		case "DELETE":
			deleted = true
			return jsonResp(200, `{"commit":{}}`, nil), nil
		}
		t.Fatalf("unexpected method %s", r.Method)
		return nil, nil
	})
	err := g.Delete(context.Background(), types.ChunkRef{Repo: "alice/repo", RemotePath: "02/a.bin"})
	if err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if !deleted {
		t.Error("expected DELETE to be issued")
	}
}

func TestGithubDelete404Idempotent(t *testing.T) {
	g := newGithubFake("alice", func(r *http.Request) (*http.Response, error) {
		return jsonResp(404, `{"message":"Not Found"}`, nil), nil
	})
	err := g.Delete(context.Background(), types.ChunkRef{Repo: "alice/repo", RemotePath: "02/a.bin"})
	if err != nil {
		t.Fatalf("Delete on 404 should be nil (idempotent), got %v", err)
	}
}

func TestGithubDeleteNilContentDirectory(t *testing.T) {
	// GetContents returns a JSON array for a directory path → content is nil, no
	// error. Delete must treat this as already-gone (guards a past nil panic).
	g := newGithubFake("alice", func(r *http.Request) (*http.Response, error) {
		return jsonResp(200, `[{"type":"file","name":"x.bin","sha":"z"}]`, nil), nil
	})
	err := g.Delete(context.Background(), types.ChunkRef{Repo: "alice/repo", RemotePath: "02"})
	if err != nil {
		t.Fatalf("Delete on directory/nil content should be nil, got %v", err)
	}
}

func TestGithubGetRepoSize(t *testing.T) {
	g := newGithubFake("alice", func(r *http.Request) (*http.Response, error) {
		return jsonResp(200, `{"size":100}`, nil), nil // size in KB
	})
	size, err := g.GetRepoSize(context.Background(), "alice/repo")
	if err != nil {
		t.Fatalf("GetRepoSize: %v", err)
	}
	if size != 100*1024 {
		t.Errorf("size = %d, want %d", size, 100*1024)
	}
}

func TestGithubCreateRepo(t *testing.T) {
	g := newGithubFake("alice", func(r *http.Request) (*http.Response, error) {
		if r.Method != "POST" {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		return jsonResp(201, `{"full_name":"alice/newrepo"}`, nil), nil
	})
	full, err := g.CreateRepo(context.Background(), "newrepo")
	if err != nil {
		t.Fatalf("CreateRepo: %v", err)
	}
	if full != "alice/newrepo" {
		t.Errorf("full name = %q", full)
	}
}

func TestGithubUploadGeneratesFilename(t *testing.T) {
	// Empty RemotePath → adapter generates a disguised sharded filename.
	g := newGithubFake("alice", func(r *http.Request) (*http.Response, error) {
		return jsonResp(201, `{"content":{"sha":"s","path":"p"}}`, nil), nil
	})
	ref, err := g.Upload(context.Background(), "alice/repo", types.Chunk{Data: []byte("d")})
	if err != nil {
		t.Fatalf("Upload: %v", err)
	}
	if ref.RemotePath == "" || !strings.HasSuffix(ref.RemotePath, ".bin") {
		t.Errorf("expected generated .bin path, got %q", ref.RemotePath)
	}
}

func TestGithubUploadNonRetryableError(t *testing.T) {
	g := newGithubFake("alice", func(r *http.Request) (*http.Response, error) {
		return jsonResp(422, `{"message":"Unprocessable"}`, nil), nil
	})
	_, err := g.Upload(context.Background(), "alice/repo", types.Chunk{
		Ref:  types.ChunkRef{RemotePath: "02/x.bin"},
		Data: []byte("d"),
	})
	if err == nil || !strings.Contains(err.Error(), "upload chunk") {
		t.Fatalf("expected non-retryable upload error, got %v", err)
	}
}

func TestGithubDownload(t *testing.T) {
	// Download uses http.DefaultClient against raw.githubusercontent.com; swap its
	// transport for the duration of the test so nothing hits the network.
	orig := http.DefaultClient.Transport
	defer func() { http.DefaultClient.Transport = orig }()
	http.DefaultClient.Transport = rtFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "raw.githubusercontent.com" {
			t.Fatalf("unexpected host %s", r.URL.Host)
		}
		if r.Header.Get("Authorization") != "token t" {
			t.Errorf("missing token auth header")
		}
		return jsonResp(200, "rawcontent", nil), nil
	})

	g := &GithubAdapter{owner: "alice", token: "t"}
	data, err := g.Download(context.Background(), types.ChunkRef{Repo: "alice/repo", RemotePath: "02/x.bin"})
	if err != nil {
		t.Fatalf("Download: %v", err)
	}
	if string(data) != "rawcontent" {
		t.Errorf("data = %q", data)
	}
}

func TestGithubDownloadErrorStatus(t *testing.T) {
	orig := http.DefaultClient.Transport
	defer func() { http.DefaultClient.Transport = orig }()
	http.DefaultClient.Transport = rtFunc(func(r *http.Request) (*http.Response, error) {
		return jsonResp(404, "nope", nil), nil
	})
	g := &GithubAdapter{owner: "alice", token: "t"}
	if _, err := g.Download(context.Background(), types.ChunkRef{Repo: "alice/repo", RemotePath: "x"}); err == nil {
		t.Fatal("expected download error on 404")
	}
}

func TestGithubUploadSuccess(t *testing.T) {
	g := newGithubFake("alice", func(r *http.Request) (*http.Response, error) {
		if r.Method != "PUT" {
			t.Fatalf("expected PUT for CreateFile, got %s", r.Method)
		}
		return jsonResp(201, `{"content":{"sha":"newsha","path":"02/x.bin"}}`, nil), nil
	})
	chunk := types.Chunk{
		Ref:  types.ChunkRef{RemotePath: "02/x.bin"},
		Data: []byte("hello"),
	}
	ref, err := g.Upload(context.Background(), "alice/repo", chunk)
	if err != nil {
		t.Fatalf("Upload: %v", err)
	}
	if ref.Platform != "github" || ref.Repo != "alice/repo" || ref.RemotePath != "02/x.bin" {
		t.Errorf("unexpected ref: %+v", ref)
	}
}
