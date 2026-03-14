package components

import (
	"fmt"

	"github.com/charmbracelet/lipgloss"
)

// StatusBar renders the bottom status bar.
type StatusBar struct {
	Width int
}

// View renders the status bar with user info and quota.
func (sb *StatusBar) View(username, serverURL, plan string, usedBytes, quotaBytes int64) string {
	bg := lipgloss.Color("#27272a")
	brand := lipgloss.Color("#00d5e4")
	muted := lipgloss.Color("#71717a")

	leftStyle := lipgloss.NewStyle().Background(bg).Foreground(brand).Bold(true).Padding(0, 1)
	midStyle := lipgloss.NewStyle().Background(bg).Foreground(muted).Padding(0, 1)
	rightStyle := lipgloss.NewStyle().Background(bg).Foreground(muted).Padding(0, 1)

	left := leftStyle.Render(fmt.Sprintf(" %s", username))
	mid := midStyle.Render(serverURL)

	quotaStr := fmt.Sprintf("%s / %s (%s)", FormatBytes(usedBytes), FormatBytes(quotaBytes), plan)
	right := rightStyle.Render(quotaStr)

	// Fill remaining space
	usedWidth := lipgloss.Width(left) + lipgloss.Width(mid) + lipgloss.Width(right)
	gap := sb.Width - usedWidth
	if gap < 0 {
		gap = 0
	}
	filler := lipgloss.NewStyle().Background(bg).Render(fmt.Sprintf("%*s", gap, ""))

	return left + mid + filler + right
}
