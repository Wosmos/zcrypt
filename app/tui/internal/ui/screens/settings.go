package screens

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/zcrypt/zcrypt-tui/internal/api"
	"github.com/zcrypt/zcrypt-tui/internal/config"
	"github.com/zcrypt/zcrypt-tui/internal/pipeline"
	"github.com/zcrypt/zcrypt-tui/internal/ui/theme"
)

// LogoutMsg signals logout.
type LogoutMsg struct{}

type settingsFocus int

const (
	settingsProfile settingsFocus = iota
	settingsServer
	settingsLogout
)

type SettingsModel struct {
	cfg       *config.Config
	client    *api.Client
	platforms []api.PlatformStatus
	focus     settingsFocus
	err       string
	width     int
	height    int
}

func NewSettingsModel(cfg *config.Config, client *api.Client) SettingsModel {
	return SettingsModel{
		cfg:    cfg,
		client: client,
		focus:  settingsProfile,
	}
}

func (m SettingsModel) Init() tea.Cmd {
	return m.fetchPlatforms()
}

func (m SettingsModel) Update(msg tea.Msg) (SettingsModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

	case platformsResultMsg:
		if msg.err == nil {
			m.platforms = msg.platforms
		}

	case tea.KeyMsg:
		m.err = ""
		switch msg.String() {
		case "esc":
			return m, func() tea.Msg { return SwitchScreenMsg{Screen: "dashboard"} }
		case "j", "down":
			if m.focus < settingsLogout {
				m.focus++
			}
		case "k", "up":
			if m.focus > settingsProfile {
				m.focus--
			}
		case "enter", " ":
			switch m.focus {
			case settingsProfile:
				m.cycleProfile()
			case settingsLogout:
				return m, func() tea.Msg { return LogoutMsg{} }
			}
		case "1":
			m.cfg.Profile = "light"
			_ = m.cfg.Save()
		case "2":
			m.cfg.Profile = "normal"
			_ = m.cfg.Save()
		case "3":
			m.cfg.Profile = "intense"
			_ = m.cfg.Save()
		case "4":
			m.cfg.Profile = "ludicrous"
			_ = m.cfg.Save()
		}
	}

	return m, nil
}

func (m SettingsModel) View() string {
	title := theme.BigTitleStyle.Render("  Settings")

	var body strings.Builder

	// Profile section
	body.WriteString(m.renderProfileSection())
	body.WriteString("\n\n")
	body.WriteString(theme.Separator(m.width - 12))
	body.WriteString("\n\n")

	// Connection section
	body.WriteString(m.renderConnectionSection())
	body.WriteString("\n\n")
	body.WriteString(theme.Separator(m.width - 12))
	body.WriteString("\n\n")

	// Platform section
	body.WriteString(m.renderPlatformSection())
	body.WriteString("\n\n")
	body.WriteString(theme.Separator(m.width - 12))
	body.WriteString("\n\n")

	// Account section
	body.WriteString(m.renderAccountSection())

	if m.err != "" {
		body.WriteString("\n\n")
		body.WriteString(theme.ErrorStyle.Render("  " + m.err))
	}

	panel := theme.PanelStyle.Width(m.width - 8).Render(body.String())

	footer := theme.HelpBar(
		theme.KeyHelp("1-4", "set profile"),
		theme.KeyHelp("j/k", "navigate"),
		theme.KeyHelp("enter", "select"),
		theme.KeyHelp("esc", "back"),
	)

	content := lipgloss.JoinVertical(lipgloss.Left,
		"",
		lipgloss.NewStyle().Padding(0, 2).Render(title),
		"",
		lipgloss.NewStyle().Padding(0, 2).Render(panel),
		"",
		lipgloss.NewStyle().Padding(0, 2).Render(footer),
	)

	return content
}

func (m SettingsModel) renderProfileSection() string {
	var s strings.Builder
	header := theme.LabelStyle.Render("Performance Profile")
	if m.focus == settingsProfile {
		header = theme.GlowText("Performance Profile")
	}
	s.WriteString(header)
	s.WriteString("\n\n")

	profiles := pipeline.ProfileNames()
	for _, name := range profiles {
		p := pipeline.GetProfile(name)
		selected := m.cfg.Profile == name

		indicator := "  "
		nameStyle := theme.MutedStyle
		if selected {
			indicator = theme.KeyStyle.Render(">") + " "
			nameStyle = lipgloss.NewStyle().Foreground(theme.ColorBrand).Bold(true)
		}

		detail := theme.DimStyle.Render(fmt.Sprintf("%d workers, %dMB chunks, zstd %d",
			p.Workers, p.ChunkSize>>20, p.ZstdLevel))

		s.WriteString(fmt.Sprintf("  %s%s  %s\n", indicator, nameStyle.Render(name), detail))
	}

	return s.String()
}

func (m SettingsModel) renderConnectionSection() string {
	var s strings.Builder
	if m.focus == settingsServer {
		s.WriteString(theme.GlowText("Server"))
	} else {
		s.WriteString(theme.LabelStyle.Render("Server"))
	}
	s.WriteString("\n\n")
	s.WriteString("  " + theme.ValueStyle.Render(m.cfg.ServerURL))
	s.WriteString("\n")
	s.WriteString("  " + theme.DimStyle.Render("User: "+m.cfg.Username+" ("+m.cfg.Email+")"))
	return s.String()
}

func (m SettingsModel) renderPlatformSection() string {
	var s strings.Builder
	s.WriteString(theme.LabelStyle.Render("Connected Platforms"))
	s.WriteString("\n\n")

	if len(m.platforms) == 0 {
		s.WriteString("  " + theme.MutedStyle.Render("No platforms connected"))
		return s.String()
	}

	for _, p := range m.platforms {
		status := theme.SuccessStyle.Render("connected")
		if !p.Connected {
			status = theme.ErrorStyle.Render("disconnected")
		}
		name := lipgloss.NewStyle().Foreground(theme.ColorText).Bold(true).Width(14).Render(p.Platform)
		s.WriteString(fmt.Sprintf("  %s %s", name, status))
		if p.Username != "" {
			s.WriteString("  " + theme.DimStyle.Render("@"+p.Username))
		}
		s.WriteString("\n")
	}

	return s.String()
}

func (m SettingsModel) renderAccountSection() string {
	var s strings.Builder
	if m.focus == settingsLogout {
		s.WriteString(lipgloss.NewStyle().Foreground(theme.ColorError).Bold(true).Render("Logout"))
	} else {
		s.WriteString(theme.LabelStyle.Render("Logout"))
	}
	s.WriteString("\n\n")
	s.WriteString("  " + theme.DimStyle.Render("Sign out and clear saved tokens"))
	return s.String()
}

func (m *SettingsModel) cycleProfile() {
	profiles := pipeline.ProfileNames()
	for i, name := range profiles {
		if name == m.cfg.Profile {
			m.cfg.Profile = profiles[(i+1)%len(profiles)]
			_ = m.cfg.Save()
			return
		}
	}
	m.cfg.Profile = "normal"
}

type platformsResultMsg struct {
	platforms []api.PlatformStatus
	err       error
}

func (m SettingsModel) fetchPlatforms() tea.Cmd {
	client := m.client
	return func() tea.Msg {
		platforms, err := client.GetPlatformStatus()
		return platformsResultMsg{platforms: platforms, err: err}
	}
}

func (m *SettingsModel) SetSize(w, h int) {
	m.width = w
	m.height = h
}
