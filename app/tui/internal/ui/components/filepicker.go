package components

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

var (
	fpDir   = lipgloss.NewStyle().Foreground(lipgloss.Color("#67e8f9")).Bold(true) // cyan-bright for dirs
	fpFile  = lipgloss.NewStyle().Foreground(lipgloss.Color("#e4e4e7"))            // white for files
	fpSel   = lipgloss.NewStyle().Foreground(lipgloss.Color("#09090b")).Background(lipgloss.Color("#00d5e4")).Bold(true)
	fpMuted = lipgloss.NewStyle().Foreground(lipgloss.Color("#52525b"))
	fpSize  = lipgloss.NewStyle().Foreground(lipgloss.Color("#71717a"))
	fpPath  = lipgloss.NewStyle().Foreground(lipgloss.Color("#00d5e4")).Bold(true)
)

// FilePickerMsg is sent when a file is selected.
type FilePickerMsg struct {
	Path string
}

type entry struct {
	name  string
	isDir bool
	size  int64
}

// FilePicker is a directory-browsing file selector component.
type FilePicker struct {
	dir     string
	entries []entry
	cursor  int
	scroll  int
	height  int
	err     string
}

// NewFilePicker creates a file picker starting at the given directory.
func NewFilePicker(startDir string) FilePicker {
	if startDir == "" {
		startDir, _ = os.UserHomeDir()
	}
	fp := FilePicker{height: 12}
	fp.loadDir(startDir)
	return fp
}

func (fp *FilePicker) loadDir(dir string) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		fp.err = err.Error()
		return
	}
	fp.dir = abs
	fp.cursor = 0
	fp.scroll = 0
	fp.err = ""

	items, err := os.ReadDir(abs)
	if err != nil {
		fp.err = err.Error()
		return
	}

	fp.entries = nil

	// Parent directory entry
	if abs != "/" {
		fp.entries = append(fp.entries, entry{name: "..", isDir: true})
	}

	// Separate dirs and files, sort each alphabetically
	var dirs, files []entry
	for _, item := range items {
		if strings.HasPrefix(item.Name(), ".") {
			continue // skip hidden files
		}
		info, _ := item.Info()
		var size int64
		if info != nil {
			size = info.Size()
		}
		e := entry{name: item.Name(), isDir: item.IsDir(), size: size}
		if item.IsDir() {
			dirs = append(dirs, e)
		} else {
			files = append(files, e)
		}
	}
	sort.Slice(dirs, func(i, j int) bool { return dirs[i].name < dirs[j].name })
	sort.Slice(files, func(i, j int) bool { return files[i].name < files[j].name })
	fp.entries = append(fp.entries, dirs...)
	fp.entries = append(fp.entries, files...)
}

// Dir returns the current directory.
func (fp *FilePicker) Dir() string { return fp.dir }

// SetHeight sets the visible rows.
func (fp *FilePicker) SetHeight(h int) {
	if h > 4 {
		fp.height = h
	}
}

// Update handles key events. Returns a tea.Cmd if a file was selected.
func (fp *FilePicker) Update(msg tea.Msg) tea.Cmd {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "up", "k":
			if fp.cursor > 0 {
				fp.cursor--
				if fp.cursor < fp.scroll {
					fp.scroll = fp.cursor
				}
			}
		case "down", "j":
			if fp.cursor < len(fp.entries)-1 {
				fp.cursor++
				if fp.cursor >= fp.scroll+fp.height {
					fp.scroll = fp.cursor - fp.height + 1
				}
			}
		case "enter":
			if fp.cursor >= 0 && fp.cursor < len(fp.entries) {
				e := fp.entries[fp.cursor]
				if e.isDir {
					if e.name == ".." {
						fp.loadDir(filepath.Dir(fp.dir))
					} else {
						fp.loadDir(filepath.Join(fp.dir, e.name))
					}
				} else {
					selected := filepath.Join(fp.dir, e.name)
					return func() tea.Msg { return FilePickerMsg{Path: selected} }
				}
			}
		case "backspace", "left", "h":
			fp.loadDir(filepath.Dir(fp.dir))
		case "~":
			home, _ := os.UserHomeDir()
			fp.loadDir(home)
		}
	}
	return nil
}

// View renders the file picker.
func (fp *FilePicker) View() string {
	var b strings.Builder

	// Current path
	b.WriteString("  " + fpPath.Render(fp.dir))
	b.WriteString("\n\n")

	if fp.err != "" {
		b.WriteString("  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#f87171")).Render(fp.err))
		return b.String()
	}

	if len(fp.entries) == 0 {
		b.WriteString("  " + fpMuted.Render("(empty directory)"))
		return b.String()
	}

	// Visible window
	end := fp.scroll + fp.height
	if end > len(fp.entries) {
		end = len(fp.entries)
	}

	for i := fp.scroll; i < end; i++ {
		e := fp.entries[i]
		selected := i == fp.cursor

		var icon, name, size string
		if e.isDir {
			icon = " "
			name = e.name + "/"
		} else {
			icon = " "
			name = e.name
			size = FormatBytes(e.size)
		}

		line := fmt.Sprintf("  %s %s", icon, name)

		if selected {
			// Pad to fixed width for selection highlight
			padded := fmt.Sprintf("%-42s", line)
			if size != "" {
				b.WriteString(fpSel.Render(padded) + " " + fpSize.Render(size))
			} else {
				b.WriteString(fpSel.Render(padded))
			}
		} else {
			if e.isDir {
				b.WriteString(fpDir.Render(line))
			} else {
				b.WriteString(fpFile.Render(line))
				if size != "" {
					b.WriteString("  " + fpSize.Render(size))
				}
			}
		}

		if i < end-1 {
			b.WriteString("\n")
		}
	}

	// Scroll indicator
	if len(fp.entries) > fp.height {
		b.WriteString("\n")
		b.WriteString(fpMuted.Render(fmt.Sprintf("  %d/%d items", fp.cursor+1, len(fp.entries))))
	}

	return b.String()
}
