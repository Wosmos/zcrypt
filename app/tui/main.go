package main

import (
	"flag"
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/zcrypt/zcrypt-tui/internal/api"
	"github.com/zcrypt/zcrypt-tui/internal/auth"
	"github.com/zcrypt/zcrypt-tui/internal/config"
	"github.com/zcrypt/zcrypt-tui/internal/ui"
)

var version = "dev"

func main() {
	var (
		serverURL  string
		profile    string
		configPath string
		showVer    bool
	)

	flag.StringVar(&serverURL, "server", "", "backend server URL")
	flag.StringVar(&profile, "profile", "", "performance profile (light, normal, intense, ludicrous)")
	flag.StringVar(&configPath, "config", "", "config file path")
	flag.BoolVar(&showVer, "version", false, "show version")
	flag.Parse()

	if showVer {
		fmt.Printf("zcrypt %s\n", version)
		os.Exit(0)
	}

	// Ensure config directory exists
	if err := config.EnsureDirs(); err != nil {
		fmt.Fprintf(os.Stderr, "Error creating config directory: %v\n", err)
		os.Exit(1)
	}

	// Load config
	cfgPath := configPath
	if cfgPath == "" {
		cfgPath = config.ConfigPath()
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading config: %v\n", err)
		os.Exit(1)
	}

	// Apply CLI flag overrides
	if serverURL != "" {
		cfg.ServerURL = serverURL
	}
	if profile != "" {
		cfg.Profile = profile
	}

	// Save config with any updates
	_ = cfg.Save()

	// Create auth session and API client
	session := auth.NewSession(cfg)
	client := api.NewClient(cfg.ServerURL, session)

	// Try to validate existing session
	if session.IsAuthenticated() {
		if _, err := client.GetMe(); err != nil {
			// Token invalid, try refresh
			if _, refreshErr := client.RefreshTokens(cfg.GetRefreshToken()); refreshErr != nil {
				// Refresh failed, clear tokens
				session.Clear()
			}
		}
	}

	// Create and run the TUI
	app := ui.NewApp(cfg, session, client)
	p := tea.NewProgram(app, tea.WithAltScreen())

	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}
