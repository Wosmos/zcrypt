package components

import (
	"fmt"

	"github.com/charmbracelet/bubbles/progress"
	"github.com/charmbracelet/lipgloss"
)

// ProgressBar is a styled progress bar with speed and ETA display.
type ProgressBar struct {
	Model progress.Model
	Label string
}

// NewProgressBar creates a styled progress bar.
func NewProgressBar(label string) ProgressBar {
	p := progress.New(
		progress.WithDefaultGradient(),
		progress.WithWidth(40),
	)
	p.Full = '█'
	p.Empty = '░'
	p.FullColor = "#00d5e4"
	p.EmptyColor = "#3f3f46"

	return ProgressBar{
		Model: p,
		Label: label,
	}
}

// View renders the progress bar with label, percentage, and optional speed.
func (pb *ProgressBar) View(percent float64, speed float64) string {
	labelStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#e4e4e7")).Bold(true)
	mutedStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#71717a"))

	bar := pb.Model.ViewAs(percent)
	pctStr := fmt.Sprintf(" %3.0f%%", percent*100)

	line := labelStyle.Render(pb.Label) + "\n" + bar + mutedStyle.Render(pctStr)

	if speed > 0 {
		line += mutedStyle.Render(fmt.Sprintf("  %s/s", FormatBytes(int64(speed))))
	}

	return line
}

// FormatBytes formats bytes into human-readable string.
func FormatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}
