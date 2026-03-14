package components

import (
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

var (
	cyan  = lipgloss.Color("#00d5e4")
	white = lipgloss.Color("#e4e4e7")
	dim   = lipgloss.Color("#52525b")
	muted = lipgloss.Color("#3f3f46")

	focusedBorder = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(cyan).
			Padding(0, 1)

	blurredBorder = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(muted).
			Padding(0, 1)

	focusedLabel = lipgloss.NewStyle().
			Foreground(cyan).
			Bold(true)

	blurredLabel = lipgloss.NewStyle().
			Foreground(dim)

	indicator = lipgloss.NewStyle().
			Foreground(cyan).
			Bold(true).
			Render("▸ ")
)

// StyledInput wraps a bubbles textinput with terminal-native styling.
type StyledInput struct {
	Model textinput.Model
	Label string
	Width int
}

// NewStyledInput creates a styled text input with boxed borders.
func NewStyledInput(label, placeholder string, isPassword bool) StyledInput {
	ti := textinput.New()
	ti.Placeholder = placeholder
	ti.CharLimit = 256
	ti.Width = 44
	ti.Prompt = "  "
	ti.PromptStyle = lipgloss.NewStyle().Foreground(dim)
	ti.TextStyle = lipgloss.NewStyle().Foreground(white)
	ti.PlaceholderStyle = lipgloss.NewStyle().Foreground(muted)
	ti.Cursor.Style = lipgloss.NewStyle().Foreground(cyan)

	if isPassword {
		ti.EchoMode = textinput.EchoPassword
		ti.EchoCharacter = '•'
	}

	return StyledInput{
		Model: ti,
		Label: label,
		Width: 50,
	}
}

// SetFocused sets focus state and updates visual prompt (no Cmd returned).
// Use in constructors where you can't return a tea.Cmd.
func (s *StyledInput) SetFocused(focused bool) {
	if focused {
		s.Model.Focus()
		s.Model.Prompt = "> "
		s.Model.PromptStyle = lipgloss.NewStyle().Foreground(cyan)
	} else {
		s.Model.Blur()
		s.Model.Prompt = "  "
		s.Model.PromptStyle = lipgloss.NewStyle().Foreground(dim)
	}
}

// Focus focuses the input.
func (s *StyledInput) Focus() tea.Cmd {
	s.Model.PromptStyle = lipgloss.NewStyle().Foreground(cyan)
	s.Model.Prompt = "> "
	return s.Model.Focus()
}

// Blur unfocuses the input.
func (s *StyledInput) Blur() {
	s.Model.PromptStyle = lipgloss.NewStyle().Foreground(dim)
	s.Model.Prompt = "  "
	s.Model.Blur()
}

// Value returns the current input value.
func (s *StyledInput) Value() string {
	return s.Model.Value()
}

// SetValue sets the input value.
func (s *StyledInput) SetValue(v string) {
	s.Model.SetValue(v)
}

// Update handles input events.
func (s *StyledInput) Update(msg tea.Msg) tea.Cmd {
	var cmd tea.Cmd
	s.Model, cmd = s.Model.Update(msg)
	return cmd
}

// View renders the input as a boxed field with focus indicator.
func (s *StyledInput) View() string {
	focused := s.Model.Focused()

	// Label with indicator
	var label string
	if focused {
		label = indicator + focusedLabel.Render(s.Label)
	} else {
		label = "  " + blurredLabel.Render(s.Label)
	}

	// Input box with border
	var box string
	inputView := s.Model.View()
	if focused {
		box = focusedBorder.Width(s.Width).Render(inputView)
	} else {
		box = blurredBorder.Width(s.Width).Render(inputView)
	}

	return label + "\n" + box
}
