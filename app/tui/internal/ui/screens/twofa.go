package screens

import (
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/zcrypt/zcrypt-tui/internal/api"
	"github.com/zcrypt/zcrypt-tui/internal/ui/components"
	"github.com/zcrypt/zcrypt-tui/internal/ui/theme"
)

type TwoFAModel struct {
	code      components.StyledInput
	tempToken string
	loading   bool
	spinner   components.FunSpinner
	err       string
	client    *api.Client
	width     int
	height    int
}

func NewTwoFAModel(client *api.Client) TwoFAModel {
	code := components.NewStyledInput("Authentication Code", "6-digit code", false)
	code.SetFocused(true)
	return TwoFAModel{
		code:    code,
		spinner: components.NewFunSpinner(),
		client:  client,
	}
}

func (m TwoFAModel) Init() tea.Cmd {
	return textinput.Blink
}

func (m TwoFAModel) Update(msg tea.Msg) (TwoFAModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

	case tea.KeyMsg:
		if m.loading {
			return m, nil
		}
		m.err = ""
		switch msg.String() {
		case "enter":
			if m.code.Value() == "" {
				m.err = "Code is required"
				return m, nil
			}
			m.loading = true
			return m, tea.Batch(m.doVerify(), m.spinner.Init())
		case "esc":
			return m, func() tea.Msg { return SwitchScreenMsg{Screen: "login"} }
		}

	case twofaResultMsg:
		m.loading = false
		if msg.err != nil {
			m.err = msg.err.Error()
			return m, nil
		}
		return m, func() tea.Msg {
			return LoginMsg{
				User:         msg.resp.User,
				AccessToken:  msg.resp.AccessToken,
				RefreshToken: msg.resp.RefreshToken,
			}
		}
	}

	if m.loading {
		cmd := m.spinner.Update(msg)
		return m, cmd
	}

	cmd := m.code.Update(msg)
	return m, cmd
}

func (m TwoFAModel) View() string {
	var b strings.Builder

	title := lipgloss.NewStyle().Foreground(lipgloss.Color("#00d5e4")).Bold(true).
		Render("Two-Factor Authentication")
	b.WriteString("  " + title)
	b.WriteString("\n")
	b.WriteString("  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#71717a")).
		Render("Enter the 6-digit code from your authenticator app"))
	b.WriteString("\n\n")

	b.WriteString(m.code.View())

	if m.err != "" {
		b.WriteString("\n\n")
		b.WriteString("  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#ef4444")).Bold(true).Render("! "+m.err))
	}

	b.WriteString("\n\n")
	if m.loading {
		b.WriteString("  " + m.spinner.View())
	} else {
		btn := lipgloss.NewStyle().
			Background(lipgloss.Color("#00d5e4")).
			Foreground(lipgloss.Color("#09090b")).
			Bold(true).Padding(0, 2).Render("Verify")
		b.WriteString("  " + btn)
	}

	footer := theme.HelpBar(theme.KeyHelp("enter", "verify"), theme.KeyHelp("esc", "back"))

	content := lipgloss.JoinVertical(lipgloss.Center, "", "", b.String(), "", footer)
	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, content)
}

type twofaResultMsg struct {
	resp *api.LoginResponse
	err  error
}

func (m TwoFAModel) doVerify() tea.Cmd {
	token := m.tempToken
	code := m.code.Value()
	client := m.client
	return func() tea.Msg {
		resp, err := client.Verify2FA(token, code)
		return twofaResultMsg{resp: resp, err: err}
	}
}

func (m *TwoFAModel) SetTempToken(token string) {
	m.tempToken = token
}

func (m *TwoFAModel) SetSize(w, h int) {
	m.width = w
	m.height = h
}

func (m *TwoFAModel) Reset() {
	m.code.SetValue("")
	m.err = ""
	m.loading = false
}
