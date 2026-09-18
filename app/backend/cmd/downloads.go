package cmd

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/index"
)

// Installer downloads of the zcrypt app itself.
//
// Every bundler filename embeds its version (zcrypt_0.1.4_aarch64.dmg), so the
// download page, the docs and install scripts each had to know the current
// version to build a link — and drifted apart. One redirect per target fixes
// that: /api/download/macos-arm64 is stable forever and resolves the asset at
// click time. Recording the click is the same request, so download analytics
// falls out of the URL fix rather than needing its own tracker.

const (
	githubReleasesAPI = "https://api.github.com/repos/Wosmos/zcrypt/releases"
	githubLatestAPI   = githubReleasesAPI + "/latest"
	// androidReleaseAPI is the rolling sideload prerelease. It carries the
	// newest APK, which is often ahead of the last tagged release, and being a
	// prerelease it never shows up as /latest.
	androidReleaseAPI = githubReleasesAPI + "/tags/android-latest"
	releasesPageURL   = "https://github.com/Wosmos/zcrypt/releases/latest"

	releaseCacheTTL = 15 * time.Minute
)

// downloadTarget maps a stable URL segment to the asset that satisfies it.
type downloadTarget struct {
	// name is the map key, backfilled by init below. Logging this instead of
	// the raw path segment keeps a caller-supplied string out of the log even
	// though only valid keys can reach those lines.
	name     string
	platform string
	// stable is the version-less alias uploaded alongside the real installer
	// (see device.yml). Preferred when present.
	stable string
	// match recognises the versioned bundler name, for releases published
	// before the aliases existed.
	match func(string) bool
	// android assets live on the rolling prerelease, not the tagged release.
	android bool
}

func init() {
	for k, t := range downloadTargets {
		t.name = k
		downloadTargets[k] = t
	}
}

func suffix(s string) func(string) bool {
	return func(name string) bool { return strings.HasSuffix(name, s) }
}

func allOf(fns ...func(string) bool) func(string) bool {
	return func(name string) bool {
		for _, f := range fns {
			if !f(name) {
				return false
			}
		}
		return true
	}
}

func contains(s string) func(string) bool {
	return func(name string) bool { return strings.Contains(strings.ToLower(name), s) }
}

// downloadTargets is the complete public surface of /api/download/{target}.
var downloadTargets = map[string]downloadTarget{
	"macos-arm64": {platform: "macos", stable: "zcrypt-macos-arm64.dmg",
		match: allOf(suffix(".dmg"), contains("aarch64"))},
	"macos-x64": {platform: "macos", stable: "zcrypt-macos-x64.dmg",
		match: allOf(suffix(".dmg"), contains("x64"))},
	"windows-exe": {platform: "windows", stable: "zcrypt-windows-x64-setup.exe",
		match: suffix("-setup.exe")},
	"windows-msi": {platform: "windows", stable: "zcrypt-windows-x64.msi",
		match: suffix(".msi")},
	"linux-appimage": {platform: "linux", stable: "zcrypt-linux-amd64.AppImage",
		match: suffix(".AppImage")},
	"linux-deb": {platform: "linux", stable: "zcrypt-linux-amd64.deb",
		match: suffix(".deb")},
	"linux-rpm": {platform: "linux", stable: "zcrypt-linux-x86_64.rpm",
		match: suffix(".rpm")},
	"android": {platform: "android", stable: "zcrypt.apk", android: true,
		match: suffix(".apk")},

	// CLI / TUI archives from GoReleaser. No stable aliases for these — the
	// resolver falls through to the versioned name.
	"cli-darwin-arm64":  {platform: "macos", match: suffix("_darwin_arm64.tar.gz")},
	"cli-darwin-amd64":  {platform: "macos", match: suffix("_darwin_amd64.tar.gz")},
	"cli-linux-amd64":   {platform: "linux", match: suffix("_linux_amd64.tar.gz")},
	"cli-linux-arm64":   {platform: "linux", match: suffix("_linux_arm64.tar.gz")},
	"cli-windows-amd64": {platform: "windows", match: suffix("_windows_amd64.zip")},
	"cli-windows-arm64": {platform: "windows", match: suffix("_windows_arm64.zip")},
}

type ghAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	DownloadCount      int    `json:"download_count"`
}

type ghRelease struct {
	TagName string    `json:"tag_name"`
	Assets  []ghAsset `json:"assets"`
}

// releaseCache memoises the GitHub API so a burst of download clicks doesn't
// spend the (unauthenticated, 60/hr) rate limit. A stale entry is still served
// when a refresh fails — better a slightly old asset URL than a dead link.
type releaseCache struct {
	mu      sync.Mutex
	entries map[string]*releaseCacheEntry
}

type releaseCacheEntry struct {
	rel       *ghRelease
	fetchedAt time.Time
}

func newReleaseCache() *releaseCache {
	return &releaseCache{entries: map[string]*releaseCacheEntry{}}
}

var releaseHTTPClient = &http.Client{Timeout: 5 * time.Second}

func (c *releaseCache) get(ctx context.Context, url string) (*ghRelease, error) {
	c.mu.Lock()
	entry := c.entries[url]
	c.mu.Unlock()

	if entry != nil && time.Since(entry.fetchedAt) < releaseCacheTTL {
		return entry.rel, nil
	}

	rel, err := fetchRelease(ctx, url)
	if err != nil {
		if entry != nil {
			return entry.rel, nil // serve stale rather than fail the download
		}
		return nil, err
	}

	c.mu.Lock()
	c.entries[url] = &releaseCacheEntry{rel: rel, fetchedAt: time.Now()}
	c.mu.Unlock()
	return rel, nil
}

func fetchRelease(ctx context.Context, url string) (*ghRelease, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := releaseHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, errUnexpectedStatus(resp.StatusCode)
	}
	var rel ghRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return nil, err
	}
	return &rel, nil
}

type statusError int

func (e statusError) Error() string { return "github api status " + strconv.Itoa(int(e)) }

func errUnexpectedStatus(code int) error { return statusError(code) }

// resolveTarget returns the download URL and the release tag it came from.
func (s *Server) resolveTarget(ctx context.Context, t downloadTarget) (string, string, bool) {
	apiURL := githubLatestAPI
	if t.android {
		apiURL = androidReleaseAPI
	}
	rel, err := s.releases.get(ctx, apiURL)
	if err != nil || rel == nil {
		return "", "", false
	}
	if t.stable != "" {
		for _, a := range rel.Assets {
			if a.Name == t.stable {
				return a.BrowserDownloadURL, rel.TagName, true
			}
		}
	}
	if t.match != nil {
		for _, a := range rel.Assets {
			if t.match(a.Name) {
				return a.BrowserDownloadURL, rel.TagName, true
			}
		}
	}
	return "", rel.TagName, false
}

// optionalUserID returns the caller's id when they happen to be signed in.
// Download must work for anonymous visitors, so every failure is silent.
func (s *Server) optionalUserID(r *http.Request) *string {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return nil
	}
	claims, err := auth.ValidateAccessToken(s.cfg.JWTSecret, strings.TrimPrefix(header, "Bearer "))
	if err != nil {
		return nil
	}
	return &claims.Sub
}

// clientCountry reads the country the CDN already resolved. We never do our own
// geo lookup on an IP, and the header is absent in local dev.
func clientCountry(r *http.Request) string {
	for _, h := range []string{"CF-IPCountry", "X-Vercel-IP-Country"} {
		if v := r.Header.Get(h); v != "" && v != "XX" {
			return strings.ToUpper(v)
		}
	}
	return ""
}

// truncate bounds free-text columns so a hostile UA or referrer can't bloat a row.
func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

// HandleAppDownload records an installer download and redirects to the asset.
// GET /api/download/{target}
func (s *Server) HandleAppDownload(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("target")
	t, ok := downloadTargets[name]
	if !ok {
		http.Redirect(w, r, releasesPageURL, http.StatusFound)
		return
	}

	url, version, found := s.resolveTarget(r.Context(), t)
	if !found {
		// A target with no published asset (an installer whose build leg did
		// not complete, say) must not dead-end — send them somewhere useful.
		log.Printf("download: no asset for target %q (release %q)", t.name, version)
		http.Redirect(w, r, releasesPageURL, http.StatusFound)
		return
	}

	rec := &index.AppDownload{
		Target:    name,
		Platform:  t.platform,
		Version:   version,
		UserID:    s.optionalUserID(r),
		IPPrefix:  anonIP(s.clientIP(r)),
		Country:   clientCountry(r),
		UserAgent: truncate(r.UserAgent(), 400),
		Referrer:  truncate(r.Referer(), 400),
	}
	// Fire-and-forget: the redirect must not wait on the write.
	// WithoutCancel, not Background: the write must outlive the request (the
	// request context is cancelled the instant the redirect is written) but
	// should still carry the request's values.
	writeCtx := context.WithoutCancel(r.Context())
	go func() {
		ctx, cancel := context.WithTimeout(writeCtx, 5*time.Second)
		defer cancel()
		if err := s.db.InsertAppDownload(ctx, rec); err != nil {
			log.Printf("download: record %s: %v", t.name, err)
		}
	}()

	http.Redirect(w, r, url, http.StatusFound)
}

// HandleDownloadStats is the public counter — totals only, no breakdown.
// GET /api/downloads/stats
func (s *Server) HandleDownloadStats(w http.ResponseWriter, r *http.Request) {
	total, err := s.db.GetDownloadTotal(r.Context())
	if err != nil {
		internalError(w, "download total", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"total": total})
}

// releaseAsset reports whether one download target actually published on the
// current release. A missing installer is otherwise silent — the download page
// just stops offering it, and /dl/<target> quietly falls back to the releases
// page — so it is surfaced explicitly.
type releaseAsset struct {
	Target   string `json:"target"`
	Platform string `json:"platform"`
	Name     string `json:"name"`
	Present  bool   `json:"present"`
	// Stable is true when the version-less alias published, meaning the URL
	// keeps working on GitHub even without our redirect in front of it.
	Stable bool `json:"stable"`
}

// releaseInfo is the read-only release state behind the admin panel. There is
// deliberately no way to cut a release from here: that would need a repo-write
// token beside MASTER_KEY, and would bypass the pre-push gates that every tag
// currently goes through.
type releaseInfo struct {
	Tag string `json:"tag"`
	// AndroidTag is the rolling prerelease, usually ahead of the tagged one.
	AndroidTag string `json:"android_tag"`
	// UpdaterManifest is false when latest.json is absent, which is exactly
	// what makes the desktop app report "couldn't check for updates".
	UpdaterManifest bool           `json:"updater_manifest"`
	Assets          []releaseAsset `json:"assets"`
	Missing         int            `json:"missing"`
}

// buildReleaseInfo inspects the current release through the same cache the
// download redirect uses, so it costs no extra GitHub API calls.
func (s *Server) buildReleaseInfo(ctx context.Context) *releaseInfo {
	latest, err := s.releases.get(ctx, githubLatestAPI)
	if err != nil || latest == nil {
		return nil
	}
	android, _ := s.releases.get(ctx, androidReleaseAPI)

	info := &releaseInfo{Tag: latest.TagName}
	if android != nil {
		info.AndroidTag = android.TagName
	}
	for _, a := range latest.Assets {
		if a.Name == "latest.json" {
			info.UpdaterManifest = true
			break
		}
	}

	// Stable order: the map iterates randomly, and a checklist that reshuffles
	// on every refresh is unreadable.
	names := make([]string, 0, len(downloadTargets))
	for name := range downloadTargets {
		names = append(names, name)
	}
	sort.Strings(names)

	for _, name := range names {
		t := downloadTargets[name]
		rel := latest
		if t.android {
			rel = android
		}
		asset := releaseAsset{Target: name, Platform: t.platform}
		if rel != nil {
			for _, a := range rel.Assets {
				if t.stable != "" && a.Name == t.stable {
					asset.Present, asset.Stable, asset.Name = true, true, a.Name
					break
				}
				if t.match != nil && t.match(a.Name) {
					asset.Present, asset.Name = true, a.Name
				}
			}
		}
		if !asset.Present {
			info.Missing++
		}
		info.Assets = append(info.Assets, asset)
	}
	return info
}

// HandleAdminDownloads is the full rollup behind the admin downloads view.
// GET /api/admin/downloads?days=30
func (s *Server) HandleAdminDownloads(w http.ResponseWriter, r *http.Request) {
	days := 30
	if v := r.URL.Query().Get("days"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			days = n
		}
	}

	stats, err := s.db.GetDownloadStats(r.Context(), days)
	if err != nil {
		internalError(w, "download stats", err)
		return
	}

	// GitHub's own per-asset counts cover everyone who downloaded straight from
	// the releases page without passing through our redirect. Best-effort: the
	// dashboard is still useful without them.
	github := []map[string]any{}
	for _, apiURL := range []string{githubLatestAPI, androidReleaseAPI} {
		rel, err := s.releases.get(r.Context(), apiURL)
		if err != nil || rel == nil {
			continue
		}
		for _, a := range rel.Assets {
			if a.DownloadCount == 0 {
				continue
			}
			github = append(github, map[string]any{
				"name":   a.Name,
				"tag":    rel.TagName,
				"count":  a.DownloadCount,
				"is_apk": strings.HasSuffix(a.Name, ".apk"),
			})
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"stats":   stats,
		"github":  github,
		"release": s.buildReleaseInfo(r.Context()),
	})
}
