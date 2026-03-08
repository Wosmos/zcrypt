package cmd

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/zpush/zpush/adapters"
	"github.com/zpush/zpush/config"
	"github.com/zpush/zpush/index"
	"github.com/zpush/zpush/pipeline"
	"github.com/zpush/zpush/reppool"
)

// Server holds shared state for all HTTP handlers.
type Server struct {
	db       *index.DB
	cfg      *config.Config
	progress *pipeline.ProgressEmitter

	// Multi-account support: keyed by "platform:username"
	allAdapters map[string]adapters.PlatformAdapter
	allPools    map[string]*reppool.Manager

	// Round-robin state for upload distribution
	accountKeys []string
	nextAccount int
	mu          sync.Mutex

	// Active uploads tracked for pause/resume
	activeUploads sync.Map // map[fileID]*activeUpload
}

// NewServer creates a new API server.
func NewServer(db *index.DB, cfg *config.Config, progress *pipeline.ProgressEmitter) *Server {
	s := &Server{
		db:          db,
		cfg:         cfg,
		progress:    progress,
		allAdapters: make(map[string]adapters.PlatformAdapter),
		allPools:    make(map[string]*reppool.Manager),
	}

	// Initialize all configured accounts
	for platform, accounts := range cfg.Accounts {
		for _, acc := range accounts {
			key, err := s.initAccount(platform, acc.Token)
			if err != nil {
				log.Printf("warn: failed to init %s account: %v", platform, err)
				continue
			}
			// Update the username in config if it was empty (legacy migration)
			if acc.Username == "" {
				s.updateConfigUsername(platform, acc.Token, key)
			}
		}
	}

	return s
}

// initAccount creates an adapter and pool for a platform account.
// Returns the compound key "platform:username".
func (s *Server) initAccount(platform, token string) (string, error) {
	var adapter adapters.PlatformAdapter
	var err error

	switch platform {
	case "github":
		adapter, err = adapters.NewGithubAdapter(token)
	case "gitlab":
		adapter, err = adapters.NewGitlabAdapter(token)
	case "huggingface":
		adapter, err = adapters.NewHuggingFaceAdapter(token)
	default:
		return "", fmt.Errorf("unsupported platform: %s", platform)
	}
	if err != nil {
		return "", err
	}

	username := getAdapterUsername(adapter)
	key := platform + ":" + username

	// Don't re-init if already present
	if _, exists := s.allAdapters[key]; exists {
		return key, nil
	}

	threshold := s.cfg.Thresholds[platform]
	if threshold == 0 {
		switch platform {
		case "github":
			threshold = 850 * 1024 * 1024
		case "gitlab":
			threshold = 9000 * 1024 * 1024
		case "huggingface":
			threshold = 280000 * 1024 * 1024
		}
	}

	pool := reppool.NewManager(s.db, adapter, username, threshold)
	s.allAdapters[key] = adapter
	s.allPools[key] = pool
	s.accountKeys = append(s.accountKeys, key)

	return key, nil
}

// nextAccountKey returns the next account key using round-robin.
func (s *Server) nextAccountKey() string {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.accountKeys) == 0 {
		return ""
	}
	key := s.accountKeys[s.nextAccount%len(s.accountKeys)]
	s.nextAccount++
	return key
}

// nextAccountKeyForPlatform returns the next account key for a specific platform.
func (s *Server) nextAccountKeyForPlatform(platform string) string {
	s.mu.Lock()
	defer s.mu.Unlock()

	var filtered []string
	for _, k := range s.accountKeys {
		if strings.HasPrefix(k, platform+":") {
			filtered = append(filtered, k)
		}
	}
	if len(filtered) == 0 {
		return ""
	}
	key := filtered[s.nextAccount%len(filtered)]
	s.nextAccount++
	return key
}

// removeAccount removes an account from the server state.
func (s *Server) removeAccount(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.allAdapters, key)
	delete(s.allPools, key)

	// Remove from accountKeys slice
	filtered := s.accountKeys[:0]
	for _, k := range s.accountKeys {
		if k != key {
			filtered = append(filtered, k)
		}
	}
	s.accountKeys = filtered
	if s.nextAccount >= len(s.accountKeys) {
		s.nextAccount = 0
	}
}

// updateConfigUsername updates the username for a migrated account.
func (s *Server) updateConfigUsername(platform, token, key string) {
	// Extract username from key "platform:username"
	username := key[len(platform)+1:]
	accounts := s.cfg.Accounts[platform]
	for i, acc := range accounts {
		if acc.Token == token {
			accounts[i].Username = username
			s.cfg.Accounts[platform] = accounts
			break
		}
	}
}

// AutoResumeUploads resumes any incomplete uploads from a previous session.
func (s *Server) AutoResumeUploads(ctx context.Context) {
	files, err := s.db.ListIncompleteFiles()
	if err != nil {
		log.Printf("auto-resume: list incomplete files: %v", err)
		return
	}

	if len(files) == 0 {
		return
	}

	stagingBase, err := config.StagingDir()
	if err != nil {
		log.Printf("auto-resume: staging dir: %v", err)
		return
	}

	for _, f := range files {
		stagingDir := filepath.Join(stagingBase, f.ID)
		if _, err := os.Stat(stagingDir); os.IsNotExist(err) {
			log.Printf("auto-resume: staging dir missing for %s (%s), skipping", f.ID, f.OriginalName)
			continue
		}

		allChunks, err := s.db.GetChunksForFile(f.ID)
		if err != nil || len(allChunks) == 0 {
			continue
		}

		chunkPlatform := allChunks[0].Platform
		chunkAccount := allChunks[0].Account
		key := chunkPlatform + ":" + chunkAccount

		adapter := s.allAdapters[key]
		pool := s.allPools[key]
		if adapter == nil || pool == nil {
			log.Printf("auto-resume: no adapter for %s (%s), skipping", f.ID, key)
			continue
		}

		repo, err := pool.GetOrCreateRepo(ctx)
		if err != nil {
			log.Printf("auto-resume: get repo for %s: %v", f.ID, err)
			continue
		}

		var chunkInfos []pipeline.ChunkInfo
		for i := 0; i < f.ChunkCount; i++ {
			chunkPath := filepath.Join(stagingDir, fmt.Sprintf("chunk_%03d", i))
			ci, statErr := os.Stat(chunkPath)
			if statErr != nil {
				continue
			}
			chunkInfos = append(chunkInfos, pipeline.ChunkInfo{
				Path:  chunkPath,
				Size:  ci.Size(),
				Index: i,
			})
		}

		fileCopy := f // capture loop variable
		prepared := &pipeline.PreparedFile{
			FileID:     f.ID,
			Meta:       &fileCopy,
			StagingDir: stagingDir,
			ChunkInfos: chunkInfos,
			RepoURL:    repo.URL,
			RepoID:     repo.ID,
			Account:    chunkAccount,
			Platform:   chunkPlatform,
		}

		uploadCtx, cancel := context.WithCancel(ctx)
		s.activeUploads.Store(f.ID, &activeUpload{cancel: cancel, prepared: prepared})

		engine := pipeline.NewPipelineEngine(s.db, adapter, pool, s.progress, chunkAccount)

		go func(fileID, name string) {
			defer s.activeUploads.Delete(fileID)
			log.Printf("auto-resume: resuming upload %s (%s)", fileID, name)
			if err := engine.Upload(uploadCtx, prepared); err != nil {
				if uploadCtx.Err() == nil {
					log.Printf("auto-resume: upload error for %s: %v", fileID, err)
					s.progress.Emit(pipeline.ErrorEvent(fileID, err.Error()))
				}
			}
		}(f.ID, f.OriginalName)
	}
}

// getAdapterUsername extracts the username from any adapter type.
func getAdapterUsername(adapter adapters.PlatformAdapter) string {
	switch a := adapter.(type) {
	case *adapters.GithubAdapter:
		return a.GetUsername()
	case *adapters.GitlabAdapter:
		return a.GetUsername()
	case *adapters.HuggingFaceAdapter:
		return a.GetUsername()
	}
	return "unknown"
}
