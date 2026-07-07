package adapters

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/zcrypt/zcrypt/types"
)

func newHFFake(fn rtFunc) *HuggingFaceAdapter {
	return &HuggingFaceAdapter{
		token:    "t",
		username: "alice",
		client:   &http.Client{Transport: fn},
	}
}

func TestHFPlatformNameAndUsername(t *testing.T) {
	h := &HuggingFaceAdapter{username: "bob"}
	if h.PlatformName() != "huggingface" {
		t.Errorf("PlatformName = %q", h.PlatformName())
	}
	if h.GetUsername() != "bob" {
		t.Errorf("GetUsername = %q", h.GetUsername())
	}
}

func TestParseNextLink(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"", ""},
		{`<https://x/y?cursor=abc>; rel="next"`, "https://x/y?cursor=abc"},
		{`<https://x/prev>; rel="prev", <https://x/next>; rel="next"`, "https://x/next"},
		{`<https://x/prev>; rel="prev"`, ""}, // no next
		{`https://x/malformed`, ""},          // no rel segment
	}
	for _, c := range cases {
		if got := parseNextLink(c.in); got != c.want {
			t.Errorf("parseNextLink(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestIsRetryable(t *testing.T) {
	if isRetryable(nil) {
		t.Error("nil should not be retryable")
	}
	retryables := []string{
		"TLS handshake timeout",
		"connection reset by peer",
		"connection refused",
		"i/o timeout",
		"unexpected EOF",
	}
	for _, s := range retryables {
		if !isRetryable(errors.New(s)) {
			t.Errorf("%q should be retryable", s)
		}
	}
	if isRetryable(errors.New("some permanent 400 error")) {
		t.Error("non-transient error should not be retryable")
	}
}

func TestBuildAndAppendNDJSON(t *testing.T) {
	out := buildNDJSON(map[string]interface{}{"key": "header"})
	out = appendNDJSON(out, map[string]interface{}{"key": "lfsFile"})
	lines := strings.Split(string(out), "\n")
	if len(lines) != 2 {
		t.Fatalf("expected 2 NDJSON lines, got %d: %q", len(lines), out)
	}
	if !strings.Contains(lines[0], `"key":"header"`) || !strings.Contains(lines[1], `"key":"lfsFile"`) {
		t.Errorf("unexpected NDJSON content: %q", out)
	}
}

func TestHFListChunksCursorPagination(t *testing.T) {
	linkHdr := http.Header{}
	linkHdr.Set("Link", `<https://huggingface.co/api/models/alice/repo/tree/main?cursor=next>; rel="next"`)

	page1 := `[{"type":"file","path":"02/a.bin","size":10},{"type":"directory","path":"02"},{"type":"file","path":"note.txt","size":5}]`
	page2 := `[{"type":"file","path":"03/b.bin","size":20}]`

	var calls int
	h := newHFFake(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Authorization") != "Bearer t" {
			t.Errorf("missing bearer auth")
		}
		calls++
		if r.URL.Query().Get("cursor") == "next" {
			return jsonResp(200, page2, nil), nil // last page: no Link
		}
		return jsonResp(200, page1, linkHdr), nil
	})

	refs, err := h.ListChunks(context.Background(), "alice/repo")
	if err != nil {
		t.Fatalf("ListChunks: %v", err)
	}
	if calls != 2 {
		t.Errorf("expected 2 paginated calls, got %d", calls)
	}
	if len(refs) != 2 {
		t.Fatalf("got %d refs, want 2 (.bin files only): %+v", len(refs), refs)
	}
	if refs[0].RemotePath != "02/a.bin" || refs[1].RemotePath != "03/b.bin" {
		t.Errorf("unexpected paths: %+v", refs)
	}
	if refs[0].Size != 10 || refs[0].Platform != "huggingface" {
		t.Errorf("unexpected metadata: %+v", refs[0])
	}
}

func TestHFListChunksErrorStatus(t *testing.T) {
	h := newHFFake(func(r *http.Request) (*http.Response, error) {
		return jsonResp(500, `boom`, nil), nil
	})
	_, err := h.ListChunks(context.Background(), "alice/repo")
	if err == nil || !strings.Contains(err.Error(), "500") {
		t.Fatalf("expected 500 error, got %v", err)
	}
}

func TestHFListChunksLegacyRepoPrefix(t *testing.T) {
	// A bare repo name (no "/") gets the username prefixed.
	h := newHFFake(func(r *http.Request) (*http.Response, error) {
		if !strings.Contains(r.URL.Path, "/api/models/alice/repo/tree/main") {
			t.Fatalf("expected username-prefixed path, got %s", r.URL.Path)
		}
		return jsonResp(200, `[]`, nil), nil
	})
	if _, err := h.ListChunks(context.Background(), "repo"); err != nil {
		t.Fatalf("ListChunks: %v", err)
	}
}

func TestHFDeleteSuccess(t *testing.T) {
	h := newHFFake(func(r *http.Request) (*http.Response, error) {
		if r.Method != "POST" || !strings.Contains(r.URL.Path, "/commit/main") {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		return jsonResp(200, `{"success":true}`, nil), nil
	})
	err := h.Delete(context.Background(), types.ChunkRef{Repo: "alice/repo", RemotePath: "02/a.bin"})
	if err != nil {
		t.Fatalf("Delete: %v", err)
	}
}

func TestHFDelete404Idempotent(t *testing.T) {
	h := newHFFake(func(r *http.Request) (*http.Response, error) {
		return jsonResp(404, `not found`, nil), nil
	})
	err := h.Delete(context.Background(), types.ChunkRef{Repo: "alice/repo", RemotePath: "02/a.bin"})
	if err != nil {
		t.Fatalf("Delete on 404 should be nil (idempotent), got %v", err)
	}
}

func TestHFGetRepoSize(t *testing.T) {
	h := newHFFake(func(r *http.Request) (*http.Response, error) {
		return jsonResp(200, `{"siblings":[{"rfilename":"a.bin","size":100},{"rfilename":"b.bin","size":250}]}`, nil), nil
	})
	size, err := h.GetRepoSize(context.Background(), "alice/repo")
	if err != nil {
		t.Fatalf("GetRepoSize: %v", err)
	}
	if size != 350 {
		t.Errorf("size = %d, want 350", size)
	}
}

func TestHFCreateRepo(t *testing.T) {
	h := newHFFake(func(r *http.Request) (*http.Response, error) {
		return jsonResp(200, `{"url":"https://huggingface.co/alice/newrepo"}`, nil), nil
	})
	full, err := h.CreateRepo(context.Background(), "newrepo")
	if err != nil {
		t.Fatalf("CreateRepo: %v", err)
	}
	if full != "alice/newrepo" {
		t.Errorf("full = %q", full)
	}
}

func TestHFWhoami(t *testing.T) {
	h := newHFFake(func(r *http.Request) (*http.Response, error) {
		if !strings.HasSuffix(r.URL.Path, "/api/whoami-v2") {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		return jsonResp(200, `{"name":"dave"}`, nil), nil
	})
	name, err := h.whoami()
	if err != nil {
		t.Fatalf("whoami: %v", err)
	}
	if name != "dave" {
		t.Errorf("name = %q", name)
	}
}

func TestHFGetLFSUploadInfoDedup(t *testing.T) {
	// An empty "upload" action means the object already exists → dedup.
	h := newHFFake(func(r *http.Request) (*http.Response, error) {
		return jsonResp(200, `{"objects":[{"oid":"x","size":5,"actions":{}}]}`, nil), nil
	})
	url, hdrs, err := h.getLFSUploadInfo(context.Background(), "alice/repo", "x", 5)
	if err != nil {
		t.Fatalf("getLFSUploadInfo: %v", err)
	}
	if url != "" || hdrs != nil {
		t.Errorf("dedup should return empty url/headers, got %q %v", url, hdrs)
	}
}

func TestHFGetUploadURL(t *testing.T) {
	// DirectUploader.GetUploadURL delegates to getLFSUploadInfo and returns the
	// presigned URL + headers when the object is new.
	h := newHFFake(func(r *http.Request) (*http.Response, error) {
		return jsonResp(200, `{"objects":[{"oid":"x","size":5,"actions":{"upload":{"href":"https://up/put","header":{"K":"V"}}}}]}`, nil), nil
	})
	url, hdrs, err := h.GetUploadURL(context.Background(), "alice/repo", "x", 5)
	if err != nil {
		t.Fatalf("GetUploadURL: %v", err)
	}
	if url != "https://up/put" || hdrs["K"] != "V" {
		t.Errorf("unexpected url/headers: %q %v", url, hdrs)
	}
}

func TestHFCreateLFSCommit(t *testing.T) {
	h := newHFFake(func(r *http.Request) (*http.Response, error) {
		if !strings.Contains(r.URL.Path, "/commit/main") {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		return jsonResp(200, `{"success":true}`, nil), nil
	})
	if err := h.createLFSCommit(context.Background(), "alice/repo", "02/x.bin", "oid", 4); err != nil {
		t.Fatalf("createLFSCommit: %v", err)
	}
}

func TestHFUploadFlow(t *testing.T) {
	// Upload → lfsUpload (batch returns presigned URL) → PUT to that URL → success.
	h := newHFFake(func(r *http.Request) (*http.Response, error) {
		switch {
		case strings.Contains(r.URL.Path, "/info/lfs/objects/batch"):
			return jsonResp(200, `{"objects":[{"oid":"x","size":4,"actions":{"upload":{"href":"https://upload.example/put","header":{"X-Foo":"bar"}}}}]}`, nil), nil
		case r.URL.Host == "upload.example":
			if r.Method != "PUT" {
				t.Fatalf("expected PUT to presigned url, got %s", r.Method)
			}
			if r.Header.Get("X-Foo") != "bar" {
				t.Errorf("presigned header not forwarded")
			}
			return jsonResp(200, "", nil), nil
		}
		t.Fatalf("unexpected request %s %s", r.Method, r.URL.String())
		return nil, nil
	})

	ref, err := h.Upload(context.Background(), "alice/repo", types.Chunk{
		Ref:  types.ChunkRef{RemotePath: "02/x.bin"},
		Data: []byte("data"),
	})
	if err != nil {
		t.Fatalf("Upload: %v", err)
	}
	if ref.Platform != "huggingface" || ref.RemotePath != "02/x.bin" {
		t.Errorf("unexpected ref: %+v", ref)
	}
	// Upload buffers a pending commit for FlushCommits.
	if len(h.pendingCommits) != 1 {
		t.Errorf("expected 1 pending commit, got %d", len(h.pendingCommits))
	}
}

func TestHFFlushCommitsSuccess(t *testing.T) {
	h := newHFFake(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Content-Type") != "application/x-ndjson" {
			t.Errorf("expected ndjson content type, got %q", r.Header.Get("Content-Type"))
		}
		return jsonResp(200, `{"success":true}`, nil), nil
	})
	h.pendingCommits = []lfsFileEntry{{Path: "02/x.bin", OID: "abc", Size: 4}}
	if err := h.FlushCommits(context.Background(), "alice/repo"); err != nil {
		t.Fatalf("FlushCommits: %v", err)
	}
	if len(h.pendingCommits) != 0 {
		t.Errorf("pendingCommits should be drained, got %d", len(h.pendingCommits))
	}
}

func TestHFFlushCommitsNoPending(t *testing.T) {
	h := newHFFake(func(r *http.Request) (*http.Response, error) {
		t.Fatal("no HTTP call expected when nothing pending")
		return nil, nil
	})
	if err := h.FlushCommits(context.Background(), "alice/repo"); err != nil {
		t.Fatalf("FlushCommits with no pending: %v", err)
	}
}

func TestHFDownload(t *testing.T) {
	h := newHFFake(func(r *http.Request) (*http.Response, error) {
		if !strings.Contains(r.URL.Path, "/resolve/main/") {
			t.Fatalf("unexpected download path %s", r.URL.Path)
		}
		return jsonResp(200, "filedata", nil), nil
	})
	data, err := h.Download(context.Background(), types.ChunkRef{Repo: "alice/repo", RemotePath: "02/x.bin"})
	if err != nil {
		t.Fatalf("Download: %v", err)
	}
	if string(data) != "filedata" {
		t.Errorf("data = %q", data)
	}
}

func TestHFRegisterUpload(t *testing.T) {
	h := &HuggingFaceAdapter{}
	h.RegisterUpload("02/x.bin", "oid1", 7)
	if len(h.pendingCommits) != 1 || h.pendingCommits[0].Path != "02/x.bin" {
		t.Errorf("RegisterUpload did not buffer entry: %+v", h.pendingCommits)
	}
}
