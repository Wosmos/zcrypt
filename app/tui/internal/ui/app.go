package ui

import (
	tea "github.com/charmbracelet/bubbletea"

	"github.com/zcrypt/zcrypt-tui/internal/api"
	"github.com/zcrypt/zcrypt-tui/internal/auth"
	"github.com/zcrypt/zcrypt-tui/internal/config"
	"github.com/zcrypt/zcrypt-tui/internal/pipeline"
	"github.com/zcrypt/zcrypt-tui/internal/ui/screens"
)

// Screen represents the current active screen.
type Screen int

const (
	ScreenLogin Screen = iota
	ScreenRegister
	Screen2FA
	ScreenDashboard
	ScreenUpload
	ScreenDownload
	ScreenSettings
)

// App is the root Bubbletea model.
type App struct {
	screen    Screen
	prevScreen Screen
	session   *auth.Session
	client    *api.Client
	config    *config.Config
	profile   pipeline.Profile
	width     int
	height    int

	// Screen models
	login     screens.LoginModel
	register  screens.RegisterModel
	twofa     screens.TwoFAModel
	dashboard screens.DashboardModel
	upload    screens.UploadModel
	download  screens.DownloadModel
	settings  screens.SettingsModel
}

// NewApp creates the root application model.
func NewApp(cfg *config.Config, session *auth.Session, client *api.Client) App {
	profile := pipeline.GetProfile(cfg.Profile)

	app := App{
		config:  cfg,
		session: session,
		client:  client,
		profile: profile,

		login:     screens.NewLoginModel(client),
		register:  screens.NewRegisterModel(client),
		twofa:     screens.NewTwoFAModel(client),
		dashboard: screens.NewDashboardModel(client, cfg.Username, cfg.ServerURL),
		upload:    screens.NewUploadModel(client, profile),
		download:  screens.NewDownloadModel(client, profile, cfg),
		settings:  screens.NewSettingsModel(cfg, client),
	}

	// Start at dashboard if already authenticated, otherwise login
	if session.IsAuthenticated() {
		app.screen = ScreenDashboard
	} else {
		app.screen = ScreenLogin
	}

	return app
}

func (a App) Init() tea.Cmd {
	switch a.screen {
	case ScreenLogin:
		return a.login.Init()
	case ScreenDashboard:
		return a.dashboard.Init()
	default:
		return nil
	}
}

func (a App) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		a.width = msg.Width
		a.height = msg.Height
		a.login.SetSize(msg.Width, msg.Height)
		a.register.SetSize(msg.Width, msg.Height)
		a.twofa.SetSize(msg.Width, msg.Height)
		a.dashboard.SetSize(msg.Width, msg.Height)
		a.upload.SetSize(msg.Width, msg.Height)
		a.download.SetSize(msg.Width, msg.Height)
		a.settings.SetSize(msg.Width, msg.Height)

	case tea.KeyMsg:
		// Global quit (only when not in an input)
		if msg.String() == "ctrl+c" {
			return a, tea.Quit
		}
		if msg.String() == "q" && a.screen != ScreenLogin && a.screen != ScreenRegister && a.screen != Screen2FA && a.screen != ScreenUpload && a.screen != ScreenDownload {
			return a, tea.Quit
		}

	// Auth flow messages
	case screens.LoginMsg:
		a.session.SetTokens(msg.AccessToken, msg.RefreshToken, msg.User.ID, msg.User.Username, msg.User.Email)
		a.dashboard.SetUser(msg.User.Username, a.config.ServerURL)
		a.screen = ScreenDashboard
		return a, a.dashboard.Init()

	case screens.Switch2FAMsg:
		a.twofa.SetTempToken(msg.TempToken)
		a.screen = Screen2FA
		return a, a.twofa.Init()

	case screens.SwitchScreenMsg:
		return a.switchScreen(msg.Screen)

	// Dashboard messages
	case screens.RequestUploadMsg:
		a.upload.Reset()
		a.screen = ScreenUpload
		return a, a.upload.FocusFirst()

	case screens.RequestUploadWithPathMsg:
		a.upload.Reset()
		a.upload.SetFilePath(msg.FilePath)
		a.screen = ScreenUpload
		return a, a.upload.FocusFirst()

	case screens.RequestDownloadMsg:
		a.download.Reset()
		a.download.SetFile(msg.FileID, msg.FileName)
		a.screen = ScreenDownload
		return a, a.download.FocusFirst()

	// Settings messages
	case screens.LogoutMsg:
		_ = a.client.Logout(a.session.GetRefreshToken())
		a.session.Clear()
		a.login.Reset()
		a.screen = ScreenLogin
		return a, a.login.FocusFirst()
	}

	// Delegate to current screen
	var cmd tea.Cmd
	switch a.screen {
	case ScreenLogin:
		a.login, cmd = a.login.Update(msg)
	case ScreenRegister:
		a.register, cmd = a.register.Update(msg)
	case Screen2FA:
		a.twofa, cmd = a.twofa.Update(msg)
	case ScreenDashboard:
		a.dashboard, cmd = a.dashboard.Update(msg)
	case ScreenUpload:
		a.upload, cmd = a.upload.Update(msg)
	case ScreenDownload:
		a.download, cmd = a.download.Update(msg)
	case ScreenSettings:
		a.settings, cmd = a.settings.Update(msg)
	}

	return a, cmd
}

func (a App) View() string {
	switch a.screen {
	case ScreenLogin:
		return a.login.View()
	case ScreenRegister:
		return a.register.View()
	case Screen2FA:
		return a.twofa.View()
	case ScreenDashboard:
		return a.dashboard.View()
	case ScreenUpload:
		return a.upload.View()
	case ScreenDownload:
		return a.download.View()
	case ScreenSettings:
		return a.settings.View()
	default:
		return ""
	}
}

func (a *App) switchScreen(name string) (App, tea.Cmd) {
	switch name {
	case "login":
		a.login.Reset()
		a.screen = ScreenLogin
		return *a, a.login.FocusFirst()
	case "register":
		a.register.Reset()
		a.screen = ScreenRegister
		return *a, a.register.FocusFirst()
	case "dashboard":
		a.screen = ScreenDashboard
		return *a, a.dashboard.Refresh()
	case "settings":
		a.screen = ScreenSettings
		return *a, a.settings.Init()
	default:
		return *a, nil
	}
}
