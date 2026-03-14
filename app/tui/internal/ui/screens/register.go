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

type RegisterModel struct {
	email    components.StyledInput
	username components.StyledInput
	pass     components.StyledInput
	focused  int // 0=email, 1=username, 2=password
	loading  bool
	spinner  components.FunSpinner
	err      string
	client   *api.Client
	width    int
	height   int
}

func NewRegisterModel(client *api.Client) RegisterModel {
	email := components.NewStyledInput("Email", "you@example.com", false)
	username := components.NewStyledInput("Username", "your username", false)
	pass := components.NewStyledInput("Password", "min 8 chars, 1 upper, 1 digit, 1 special", true)
	email.SetFocused(true)

	return RegisterModel{
		email:    email,
		username: username,
		pass:     pass,
		spinner:  components.NewFunSpinner(),
		client:   client,
	}
}

func (m RegisterModel) Init() tea.Cmd {
	return textinput.Blink
}

func (m RegisterModel) Update(msg tea.Msg) (RegisterModel, tea.Cmd) {
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
			m.focused = (m.focused + 1) % 3
			return m, m.focusField()
		case "shift+tab", "up":
			m.focused = (m.focused + 2) % 3
			return m, m.focusField()
		case "enter":
			if m.email.Value() == "" || m.username.Value() == "" || m.pass.Value() == "" {
				m.err = "All fields are required"
				return m, nil
			}
			m.loading = true
			return m, tea.Batch(m.doRegister(), m.spinner.Init())
		case "esc":
			return m, func() tea.Msg { return SwitchScreenMsg{Screen: "login"} }
		}

	case registerResultMsg:
		m.loading = false
		if msg.err != nil {
			m.err = msg.err.Error()
			return m, nil
		}
		if msg.resp.Warning != "" {
			m.err = msg.resp.Warning + " (press enter to force)"
			return m, nil
		}
		return m, func() tea.Msg { return SwitchScreenMsg{Screen: "login"} }
	}

	if m.loading {
		cmd := m.spinner.Update(msg)
		return m, cmd
	}

	var cmd tea.Cmd
	switch m.focused {
	case 0:
		cmd = m.email.Update(msg)
	case 1:
		cmd = m.username.Update(msg)
	case 2:
		cmd = m.pass.Update(msg)
	}
	return m, cmd
}

// focusField blurs all and focuses current — called from Update so mutations persist.
func (m *RegisterModel) focusField() tea.Cmd {
	m.email.Blur()
	m.username.Blur()
	m.pass.Blur()
	switch m.focused {
	case 0:
		return m.email.Focus()
	case 1:
		return m.username.Focus()
	case 2:
		return m.pass.Focus()
	}
	return nil
}

func (m RegisterModel) View() string {
	var b strings.Builder

	b.WriteString(theme.Logo())
	b.WriteString("\n")
	b.WriteString("  " + theme.BrandLine() + lipgloss.NewStyle().Foreground(lipgloss.Color("#52525b")).
		Render("  —  create your account"))
	b.WriteString("\n\n")

	b.WriteString(m.email.View())
	b.WriteString("\n\n")
	b.WriteString(m.username.View())
	b.WriteString("\n\n")
	b.WriteString(m.pass.View())

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
			Bold(true).Padding(0, 2).Render("Register")
		b.WriteString("  " + btn + lipgloss.NewStyle().Foreground(lipgloss.Color("#52525b")).Render("  press enter"))
	}

	footer := theme.HelpBar(
		theme.KeyHelp("enter", "register"),
		theme.KeyHelp("tab", "next field"),
		theme.KeyHelp("esc", "back to login"),
	)

	content := lipgloss.JoinVertical(lipgloss.Center, "", b.String(), "", footer)
	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, content)
}

type registerResultMsg struct {
	resp *api.RegisterResponse
	err  error
}

func (m RegisterModel) doRegister() tea.Cmd {
	email := m.email.Value()
	username := m.username.Value()
	password := m.pass.Value()
	client := m.client
	return func() tea.Msg {
		resp, err := client.Register(email, username, password, false)
		return registerResultMsg{resp: resp, err: err}
	}
}

func (m *RegisterModel) SetSize(w, h int) {
	m.width = w
	m.height = h
}

func (m *RegisterModel) Reset() {
	m.email.SetValue("")
	m.username.SetValue("")
	m.pass.SetValue("")
	m.err = ""
	m.loading = false
	m.focused = 0
}

func (m *RegisterModel) FocusFirst() tea.Cmd {
	m.focused = 0
	m.email.SetFocused(true)
	m.username.SetFocused(false)
	m.pass.SetFocused(false)
	return textinput.Blink
}
