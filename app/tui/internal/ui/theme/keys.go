package theme

import "github.com/charmbracelet/bubbles/key"

// KeyMap defines global key bindings.
type KeyMap struct {
	Quit   key.Binding
	Back   key.Binding
	Help   key.Binding
	Enter  key.Binding
	Tab    key.Binding
	Upload key.Binding
	Delete key.Binding
}

// DefaultKeyMap returns the default key bindings.
var DefaultKeyMap = KeyMap{
	Quit: key.NewBinding(
		key.WithKeys("q", "ctrl+c"),
		key.WithHelp("q", "quit"),
	),
	Back: key.NewBinding(
		key.WithKeys("esc"),
		key.WithHelp("esc", "back"),
	),
	Help: key.NewBinding(
		key.WithKeys("?"),
		key.WithHelp("?", "help"),
	),
	Enter: key.NewBinding(
		key.WithKeys("enter"),
		key.WithHelp("enter", "confirm"),
	),
	Tab: key.NewBinding(
		key.WithKeys("tab"),
		key.WithHelp("tab", "next field"),
	),
	Upload: key.NewBinding(
		key.WithKeys("u"),
		key.WithHelp("u", "upload"),
	),
	Delete: key.NewBinding(
		key.WithKeys("x", "delete"),
		key.WithHelp("x", "delete"),
	),
}
