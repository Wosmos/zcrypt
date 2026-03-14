package components

import (
	"math/rand"

	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

var funMessages = []string{
	"Establishing secure connection",
	"Negotiating encryption",
	"Spinning up quantum tunnels",
	"Waking up the hamsters",
	"Reticulating splines",
	"Consulting the oracle",
	"Warming up the flux capacitor",
	"Decrypting the matrix",
	"Hacking the mainframe",
	"Surfing the interwebs",
	"Philosophizing about bits",
	"Calibrating photon torpedoes",
	"Counting electrons",
	"Bribing the firewall",
	"Shaking hands with the server",
}

// FunSpinner wraps a spinner with rotating fun messages.
type FunSpinner struct {
	Spinner spinner.Model
	msg     string
}

// NewFunSpinner creates a branded spinner with fun status messages.
func NewFunSpinner() FunSpinner {
	s := spinner.New()
	s.Spinner = spinner.MiniDot
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("#00d5e4"))
	return FunSpinner{
		Spinner: s,
		msg:     funMessages[rand.Intn(len(funMessages))],
	}
}

// Init returns the spinner tick command.
func (f FunSpinner) Init() tea.Cmd {
	return f.Spinner.Tick
}

// Update handles spinner updates.
func (f *FunSpinner) Update(msg tea.Msg) tea.Cmd {
	var cmd tea.Cmd
	f.Spinner, cmd = f.Spinner.Update(msg)
	// Rotate message on each spinner frame
	if _, ok := msg.(spinner.TickMsg); ok {
		if rand.Intn(8) == 0 { // change message occasionally
			f.msg = funMessages[rand.Intn(len(funMessages))]
		}
	}
	return cmd
}

// View renders the spinner with its fun message.
func (f FunSpinner) View() string {
	msgStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#a1a1aa"))
	dots := lipgloss.NewStyle().Foreground(lipgloss.Color("#52525b")).Render("...")
	return f.Spinner.View() + " " + msgStyle.Render(f.msg) + dots
}

// NewSpinner creates a branded spinner (simple version).
func NewSpinner() spinner.Model {
	s := spinner.New()
	s.Spinner = spinner.MiniDot
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("#00d5e4"))
	return s
}
