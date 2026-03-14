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

// LoginMsg is sent when login succeeds.
type LoginMsg struct {
	User         *api.User
	AccessToken  string
	RefreshToken string
}

// Switch2FAMsg is sent when 2FA is required.
type Switch2FAMsg struct {
	TempToken string
}

// SwitchScreenMsg requests a screen transition.
type SwitchScreenMsg struct {
	Screen string
}

type LoginModel struct {
	email   components.StyledInput
	pass    components.StyledInput
	focused int // 0=email, 1=password
	loading bool
	spinner components.FunSpinner
	err     string
	client  *api.Client
	width   int
	height  int
}

func NewLoginModel(client *api.Client) LoginModel {
	email := components.NewStyledInput("Email", "you@example.com", false)
	pass := components.NewStyledInput("Password", "your password", true)
	email.SetFocused(true)

	return LoginModel{
		email:   email,
		pass:    pass,
		spinner: components.NewFunSpinner(),
		client:  client,
	}
}

func (m LoginModel) Init() tea.Cmd {
	return textinput.Blink
}

func (m LoginModel) Update(msg tea.Msg) (LoginModel, tea.Cmd) {
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
		case "tab", "down":
			m.focused = (m.focused + 1) % 2
			m.email.Blur()
			m.pass.Blur()
			if m.focused == 0 {
				return m, m.email.Focus()
			}
			return m, m.pass.Focus()
		case "shift+tab", "up":
			m.focused = (m.focused + 1) % 2
			m.email.Blur()
			m.pass.Blur()
			if m.focused == 0 {
				return m, m.email.Focus()
			}
			return m, m.pass.Focus()
		case "enter":
			if m.email.Value() == "" || m.pass.Value() == "" {
				m.err = "Email and password are required"
				return m, nil
			}
			m.loading = true
			return m, tea.Batch(m.doLogin(), m.spinner.Init())
		case "ctrl+r":
			return m, func() tea.Msg { return SwitchScreenMsg{Screen: "register"} }
		}

	case loginResultMsg:
		m.loading = false
		if msg.err != nil {
			m.err = msg.err.Error()
			return m, nil
		}
		if msg.resp.Requires2FA {
			return m, func() tea.Msg { return Switch2FAMsg{TempToken: msg.resp.TempToken} }
		}
		return m, func() tea.Msg {
			return LoginMsg{
				User:         msg.resp.User,
				AccessToken:  msg.resp.AccessToken,
				RefreshToken: msg.resp.RefreshToken,
			}
		}
	}

	// Update spinner when loading
	if m.loading {
		cmd := m.spinner.Update(msg)
		return m, cmd
	}

	// Update focused input
	var cmd tea.Cmd
	switch m.focused {
	case 0:
		cmd = m.email.Update(msg)
	case 1:
		cmd = m.pass.Update(msg)
	}
	return m, cmd
}

func (m LoginModel) View() string {
	var b strings.Builder

	// Logo
	b.WriteString(theme.Logo())
	b.WriteString("\n")
	b.WriteString("  " + theme.BrandLine() + lipgloss.NewStyle().Foreground(lipgloss.Color("#52525b")).
		Render("  —  zero-knowledge encrypted storage"))
	b.WriteString("\n\n")

	// Form
	b.WriteString(m.email.View())
	b.WriteString("\n\n")
	b.WriteString(m.pass.View())

	// Error
	if m.err != "" {
		b.WriteString("\n\n")
		errStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#ef4444")).Bold(true)
		b.WriteString("  " + errStyle.Render("! "+m.err))
	}

	// Button / loading
	b.WriteString("\n\n")
	if m.loading {
		b.WriteString("  " + m.spinner.View())
	} else {
		btn := lipgloss.NewStyle().
			Background(lipgloss.Color("#00d5e4")).
			Foreground(lipgloss.Color("#09090b")).
			Bold(true).
			Padding(0, 2).
			Render("Sign In")
		hint := lipgloss.NewStyle().Foreground(lipgloss.Color("#52525b")).Render("  press enter")
		b.WriteString("  " + btn + hint)
	}

	// Footer
	footer := theme.HelpBar(
		theme.KeyHelp("enter", "sign in"),
		theme.KeyHelp("tab", "next field"),
		theme.KeyHelp("ctrl+r", "register"),
		theme.KeyHelp("q", "quit"),
	)

	content := lipgloss.JoinVertical(lipgloss.Center,
		"",
		b.String(),
		"",
		footer,
	)

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, content)
}

type loginResultMsg struct {
	resp *api.LoginResponse
	err  error
}

func (m LoginModel) doLogin() tea.Cmd {
	email := m.email.Value()
	password := m.pass.Value()
	client := m.client
	return func() tea.Msg {
		resp, err := client.Login(email, password)
		return loginResultMsg{resp: resp, err: err}
	}
}

func (m *LoginModel) Reset() {
	m.email.SetValue("")
	m.pass.SetValue("")
	m.err = ""
	m.loading = false
	m.focused = 0
}

func (m *LoginModel) SetSize(w, h int) {
	m.width = w
	m.height = h
}

func (m *LoginModel) SetError(err string) {
	m.err = err
}

func (m *LoginModel) FocusFirst() tea.Cmd {
	m.focused = 0
	m.email.SetFocused(true)
	m.pass.SetFocused(false)
	return textinput.Blink
}
