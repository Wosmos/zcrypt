package theme

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// Brand colors — electric cyan + zinc dark palette
var (
	ColorBrand       = lipgloss.Color("#00d5e4")
	ColorBrandBright = lipgloss.Color("#67e8f9")
	ColorBrandDim    = lipgloss.Color("#006b73")
	ColorAccent      = lipgloss.Color("#a78bfa") // violet accent
	ColorText        = lipgloss.Color("#e4e4e7")
	ColorTextMuted   = lipgloss.Color("#71717a")
	ColorTextDim     = lipgloss.Color("#52525b")
	ColorError       = lipgloss.Color("#f87171")
	ColorSuccess     = lipgloss.Color("#4ade80")
	ColorWarning     = lipgloss.Color("#fbbf24")
	ColorSurface     = lipgloss.Color("#09090b")
	ColorSurfaceAlt  = lipgloss.Color("#18181b")
	ColorSurface2    = lipgloss.Color("#27272a")
	ColorBorder      = lipgloss.Color("#3f3f46")
	ColorBorderDim   = lipgloss.Color("#27272a")
)

// Reusable styles
var (
	TitleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(ColorBrand)

	BigTitleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(ColorBrand).
			MarginBottom(1)

	SubtitleStyle = lipgloss.NewStyle().
			Foreground(ColorTextMuted).
			Italic(true)

	ErrorStyle = lipgloss.NewStyle().
			Foreground(ColorError).
			Bold(true)

	SuccessStyle = lipgloss.NewStyle().
			Foreground(ColorSuccess).
			Bold(true)

	WarningStyle = lipgloss.NewStyle().
			Foreground(ColorWarning)

	MutedStyle = lipgloss.NewStyle().
			Foreground(ColorTextMuted)

	DimStyle = lipgloss.NewStyle().
			Foreground(ColorTextDim)

	// Panels
	PanelStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(ColorBorderDim).
			Padding(1, 2)

	ActivePanelStyle = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(ColorBrand).
				Padding(1, 2)

	GlowPanelStyle = lipgloss.NewStyle().
			Border(lipgloss.DoubleBorder()).
			BorderForeground(ColorBrand).
			Padding(1, 3)

	// Buttons
	ButtonStyle = lipgloss.NewStyle().
			Foreground(ColorSurface).
			Background(ColorBrand).
			Padding(0, 3).
			Bold(true)

	ButtonDimStyle = lipgloss.NewStyle().
			Foreground(ColorTextMuted).
			Background(ColorSurface2).
			Padding(0, 3)

	// Status bar
	StatusBarStyle = lipgloss.NewStyle().
			Background(ColorSurfaceAlt).
			Foreground(ColorTextMuted).
			Padding(0, 1)

	// Keys
	KeyStyle = lipgloss.NewStyle().
			Foreground(ColorBrand).
			Bold(true)

	KeyDescStyle = lipgloss.NewStyle().
			Foreground(ColorTextDim)

	// Labels
	LabelStyle = lipgloss.NewStyle().
			Foreground(ColorText).
			Bold(true)

	ValueStyle = lipgloss.NewStyle().
			Foreground(ColorTextMuted)

	// Badge styles
	BadgeStyle = lipgloss.NewStyle().
			Foreground(ColorSurface).
			Background(ColorBrand).
			Padding(0, 1).
			Bold(true)

	BadgeDimStyle = lipgloss.NewStyle().
			Foreground(ColorTextMuted).
			Background(ColorSurface2).
			Padding(0, 1)

	// Separator
	SeparatorStyle = lipgloss.NewStyle().
			Foreground(ColorBorderDim)
)

// Logo returns the futuristic ASCII art logo.
func Logo() string {
	lines := []string{
		"              ┌─┐         ┌┐  ",
		"  ┌──┐┌──┐┌──┤ │┌──┐┌──┐ │├──┐",
		"  │  ││  ─┤│  │ ││  │├──┘ ││  │",
		"  └──┘└──┘└──┘└─┘├──┘└──┘o└┘└──┘",
		"                 │  cloud  ",
	}

	var rendered strings.Builder
	brandStyle := lipgloss.NewStyle().Foreground(ColorBrand).Bold(true)
	dimStyle := lipgloss.NewStyle().Foreground(ColorBrandDim)

	for i, line := range lines {
		if i < 2 {
			rendered.WriteString(dimStyle.Render(line))
		} else {
			rendered.WriteString(brandStyle.Render(line))
		}
		if i < len(lines)-1 {
			rendered.WriteString("\n")
		}
	}
	return rendered.String()
}

// BrandLine returns a compact one-line branding string.
func BrandLine() string {
	name := lipgloss.NewStyle().Foreground(ColorBrand).Bold(true).Render("zcrypt")
	dot := lipgloss.NewStyle().Foreground(ColorBrandBright).Render(".")
	cloud := lipgloss.NewStyle().Foreground(ColorTextMuted).Render("cloud")
	return name + dot + cloud
}

// Separator returns a horizontal line.
func Separator(width int) string {
	return SeparatorStyle.Render(strings.Repeat("─", width))
}

// KeyHelp renders a single key binding help item.
func KeyHelp(key, desc string) string {
	return KeyStyle.Render(key) + KeyDescStyle.Render(" "+desc)
}

// HelpBar renders a row of key help items.
func HelpBar(items ...string) string {
	return MutedStyle.Render(strings.Join(items, "  "))
}

// GlowText renders text with the brand color and bold.
func GlowText(text string) string {
	return lipgloss.NewStyle().Foreground(ColorBrandBright).Bold(true).Render(text)
}

// Tag renders a small colored tag.
func Tag(text string, color lipgloss.Color) string {
	return lipgloss.NewStyle().
		Foreground(ColorSurface).
		Background(color).
		Padding(0, 1).
		Bold(true).
		Render(text)
}
