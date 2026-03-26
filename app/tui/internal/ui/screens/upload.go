package screens

import (
	"context"
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/zcrypt/zcrypt-tui/internal/api"
	"github.com/zcrypt/zcrypt-tui/internal/pipeline"
	"github.com/zcrypt/zcrypt-tui/internal/ui/components"
	"github.com/zcrypt/zcrypt-tui/internal/ui/theme"
)

// UploadDoneMsg signals upload completion.
type UploadDoneMsg struct {
	FileName string
	Err      error
}

// UploadProgressMsg carries upload progress updates.
type UploadProgressMsg struct {
	Progress pipeline.UploadProgress
}

type uploadState int

const (
	uploadStateBrowse uploadState = iota
	uploadStatePassphrase
	uploadStateUploading
	uploadStateDone
)

type UploadModel struct {
	picker     components.FilePicker
	passphrase components.StyledInput
	filePath   string // selected file path
	state      uploadState
	progress   pipeline.UploadProgress
	bar        components.ProgressBar
	spinner    components.FunSpinner
	err        string
	cancel     context.CancelFunc
	progressCh <-chan pipeline.UploadProgress
	client     *api.Client
	profile    pipeline.Profile
	width      int
	height     int
}

func NewUploadModel(client *api.Client, profile pipeline.Profile) UploadModel {
	pp := components.NewStyledInput("Passphrase", "encryption passphrase", true)

	return UploadModel{
		picker:     components.NewFilePicker(""),
		passphrase: pp,
		bar:        components.NewProgressBar("Upload Progress"),
		spinner:    components.NewFunSpinner(),
		state:      uploadStateBrowse,
		client:     client,
		profile:    profile,
	}
}

func (m UploadModel) Init() tea.Cmd {
	return nil
}

func (m UploadModel) Update(msg tea.Msg) (UploadModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.picker.SetHeight(m.height - 14)

	case components.FilePickerMsg:
		// File selected from browser
		m.filePath = msg.Path
		m.state = uploadStatePassphrase
		return m, m.passphrase.Focus()

	case UploadProgressMsg:
		m.progress = msg.Progress
		return m, tea.Batch(waitForUploadProgress(m.progressCh), m.spinner.Spinner.Tick)

	case UploadDoneMsg:
		if msg.Err != nil {
			m.err = msg.Err.Error()
		}
		m.state = uploadStateDone
		return m, nil

	case tea.KeyMsg:
		// Cancel during upload
		if m.state == uploadStateUploading && msg.String() == "esc" {
			if m.cancel != nil {
				m.cancel()
			}
			return m, func() tea.Msg { return SwitchScreenMsg{Screen: "dashboard"} }
		}

		// Done — any key goes back
		if m.state == uploadStateDone {
			return m, func() tea.Msg { return SwitchScreenMsg{Screen: "dashboard"} }
		}

		m.err = ""
		switch m.state {
		case uploadStateBrowse:
			if msg.String() == "esc" {
				return m, func() tea.Msg { return SwitchScreenMsg{Screen: "dashboard"} }
			}
			// Delegate to file picker
			cmd := m.picker.Update(msg)
			return m, cmd

		case uploadStatePassphrase:
			switch msg.String() {
			case "esc":
				// Go back to file browser
				m.state = uploadStateBrowse
				m.passphrase.Blur()
				return m, nil
			case "enter":
				if m.passphrase.Value() == "" {
					m.err = "Passphrase is required"
					return m, nil
				}
				m.state = uploadStateUploading
				cmd := m.startUpload()
				return m, cmd
			}
		}
	}

	// Spinner during upload
	if m.state == uploadStateUploading {
		cmd := m.spinner.Update(msg)
		return m, cmd
	}

	// Update passphrase input
	if m.state == uploadStatePassphrase {
		var cmd tea.Cmd
		cmd = m.passphrase.Update(msg)
		return m, cmd
	}

	return m, nil
}

func (m UploadModel) View() string {
	title := lipgloss.NewStyle().Foreground(lipgloss.Color("#00d5e4")).Bold(true).
		Render("Upload File")

	var body strings.Builder

	switch m.state {
	case uploadStateBrowse:
		body.WriteString(m.picker.View())

	case uploadStatePassphrase:
		body.WriteString("  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#a1a1aa")).Render("File") +
			"  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#e4e4e7")).Render(m.filePath))
		body.WriteString("\n\n")
		body.WriteString(m.passphrase.View())
		body.WriteString("\n\n")
		body.WriteString("  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#71717a")).
			Render("This passphrase encrypts your file. You'll need it to decrypt."))
		body.WriteString("\n")
		body.WriteString("  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#f59e0b")).Bold(true).
			Render("! If you lose it, your file cannot be recovered."))

	case uploadStateUploading:
		body.WriteString(m.renderProgress())

	case uploadStateDone:
		if m.err != "" {
			body.WriteString("  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#ef4444")).Bold(true).
				Render("! Upload failed: "+m.err))
		} else {
			body.WriteString("  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#22c55e")).Bold(true).
				Render("Upload complete!"))
			body.WriteString("\n\n")
			body.WriteString("  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#a1a1aa")).Render("File") +
				"  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#e4e4e7")).Render(m.progress.FileName))
			body.WriteString("\n")
			body.WriteString("  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#a1a1aa")).Render("Size") +
				"  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#e4e4e7")).Render(components.FormatBytes(m.progress.BytesTotal)))
		}
		body.WriteString("\n\n")
		body.WriteString("  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#52525b")).Render("Press any key to go back"))
	}

	if m.err != "" && m.state != uploadStateDone {
		body.WriteString("\n\n")
		body.WriteString("  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#ef4444")).Bold(true).Render("! "+m.err))
	}

	panel := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#27272a")).
		Padding(1, 2).
		Width(m.width - 8).
		Render(body.String())

	var footer string
	switch m.state {
	case uploadStateBrowse:
		footer = theme.HelpBar(
			theme.KeyHelp("j/k", "navigate"),
			theme.KeyHelp("enter", "select"),
			theme.KeyHelp("backspace", "parent"),
			theme.KeyHelp("~", "home"),
			theme.KeyHelp("esc", "cancel"),
		)
	case uploadStatePassphrase:
		footer = theme.HelpBar(
			theme.KeyHelp("enter", "upload"),
			theme.KeyHelp("esc", "back"),
		)
	case uploadStateUploading:
		footer = theme.HelpBar(theme.KeyHelp("esc", "cancel upload"))
	}

	content := lipgloss.JoinVertical(lipgloss.Left,
		"",
		"  "+title,
		"",
		"  "+panel,
		"",
		"  "+footer,
	)

	return content
}

func (m UploadModel) renderProgress() string {
	p := m.progress
	var s strings.Builder

	s.WriteString("  " + m.spinner.View())
	s.WriteString("\n\n")

	pct := 0.0
	if p.ChunksTotal > 0 {
		pct = float64(p.ChunksDone) / float64(p.ChunksTotal)
	}
	s.WriteString("  " + m.bar.View(pct, p.Speed))

	s.WriteString("\n\n")
	chunks := fmt.Sprintf("  Chunks: %d / %d", p.ChunksDone, p.ChunksTotal)
	s.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("#71717a")).Render(chunks))
	if p.BytesTotal > 0 {
		bytes := fmt.Sprintf("    %s / %s", components.FormatBytes(p.BytesDone), components.FormatBytes(p.BytesTotal))
		s.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("#71717a")).Render(bytes))
	}

	s.WriteString("\n")
	if p.Stage != "" {
		stage := fmt.Sprintf("  Stage: %s", p.Stage)
		s.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("#52525b")).Render(stage))
		s.WriteString("  ")
	}
	badge := fmt.Sprintf("Profile: %s  |  Workers: %d  |  Chunk: %s",
		m.profile.Name, m.profile.Workers, components.FormatBytes(int64(m.profile.ChunkSize)))
	s.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("#52525b")).Render(badge))

	return s.String()
}

func waitForUploadProgress(ch <-chan pipeline.UploadProgress) tea.Cmd {
	if ch == nil {
		return nil
	}
	return func() tea.Msg {
		p, ok := <-ch
		if !ok {
			return nil
		}
		return UploadProgressMsg{Progress: p}
	}
}

func (m *UploadModel) startUpload() tea.Cmd {
	filePath := m.filePath
	passphrase := m.passphrase.Value()
	client := m.client
	profile := m.profile

	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel

	ch := make(chan pipeline.UploadProgress, 4)
	m.progressCh = ch

	return tea.Batch(
		func() tea.Msg {
			engine := pipeline.NewUploadEngine(client, profile)
			err := engine.Upload(ctx, filePath, passphrase, func(p pipeline.UploadProgress) {
				select {
				case ch <- p:
				default:
				}
			})
			close(ch)
			return UploadDoneMsg{FileName: filePath, Err: err}
		},
		waitForUploadProgress(ch),
		m.spinner.Init(),
	)
}

func (m *UploadModel) SetSize(w, h int) {
	m.width = w
	m.height = h
	m.picker.SetHeight(h - 14)
}

func (m *UploadModel) Reset() {
	m.passphrase.SetValue("")
	m.filePath = ""
	m.state = uploadStateBrowse
	m.err = ""
	m.progress = pipeline.UploadProgress{}
	m.progressCh = nil
	m.picker = components.NewFilePicker("")
}

func (m *UploadModel) FocusFirst() tea.Cmd {
	m.state = uploadStateBrowse
	m.passphrase.SetFocused(false)
	return textinput.Blink
}

// SetFilePath pre-fills the file path (used by command bar).
func (m *UploadModel) SetFilePath(path string) {
	m.filePath = path
}
