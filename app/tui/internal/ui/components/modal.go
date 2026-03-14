package components

import (
	"github.com/charmbracelet/lipgloss"
)

// Modal renders a centered modal overlay.
type Modal struct {
	Title   string
	Content string
	Width   int
}

// View renders the modal.
func (m *Modal) View() string {
	width := m.Width
	if width == 0 {
		width = 50
	}

	titleStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#00d5e4")).
		Bold(true).
		MarginBottom(1)

	boxStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#00d5e4")).
		Padding(1, 2).
		Width(width)

	content := titleStyle.Render(m.Title) + "\n" + m.Content

	return boxStyle.Render(content)
}

// ConfirmModal renders a yes/no confirmation modal.
func ConfirmModal(title, message string, width int) string {
	helpStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#71717a"))
	content := message + "\n\n" + helpStyle.Render("[y] confirm  [n/esc] cancel")
	m := Modal{Title: title, Content: content, Width: width}
	return m.View()
}
