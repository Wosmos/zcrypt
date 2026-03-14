package components

import (
	"github.com/charmbracelet/bubbles/table"
	"github.com/charmbracelet/lipgloss"
)

// NewFileTable creates a styled file list table.
func NewFileTable(width int) table.Model {
	columns := []table.Column{
		{Title: "Name", Width: width*40/100 - 2},
		{Title: "Size", Width: width * 12 / 100},
		{Title: "Type", Width: width * 10 / 100},
		{Title: "Chunks", Width: width * 10 / 100},
		{Title: "Date", Width: width * 18 / 100},
	}

	t := table.New(
		table.WithColumns(columns),
		table.WithFocused(true),
		table.WithHeight(15),
	)

	s := table.DefaultStyles()
	s.Header = s.Header.
		BorderStyle(lipgloss.NormalBorder()).
		BorderForeground(lipgloss.Color("#3f3f46")).
		BorderBottom(true).
		Bold(true).
		Foreground(lipgloss.Color("#00d5e4"))

	s.Selected = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#09090b")).
		Background(lipgloss.Color("#00d5e4")).
		Bold(true)

	s.Cell = s.Cell.
		Foreground(lipgloss.Color("#e4e4e7"))

	t.SetStyles(s)

	return t
}
