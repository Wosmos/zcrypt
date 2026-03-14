package screens

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/zcrypt/zcrypt-tui/internal/api"
	"github.com/zcrypt/zcrypt-tui/internal/config"
	"github.com/zcrypt/zcrypt-tui/internal/pipeline"
	"github.com/zcrypt/zcrypt-tui/internal/ui/components"
	"github.com/zcrypt/zcrypt-tui/internal/ui/theme"
)

// DownloadDoneMsg signals download completion.
type DownloadDoneMsg struct {
	FileName string
	SavePath string
	Err      error
}

// DownloadProgressMsg carries download progress updates.
type DownloadProgressMsg struct {
	Progress pipeline.DownloadProgress
}

type downloadState int

const (
	downloadStatePassphrase downloadState = iota
	downloadStateDownloading
	downloadStateDone
)

type DownloadModel struct {
	fileID     string
	fileName   string
	passphrase components.StyledInput
	state      downloadState
	progress   pipeline.DownloadProgress
	bar        components.ProgressBar
	spinner    components.FunSpinner
	savePath   string
	err        string
	cancel     context.CancelFunc
	progressCh <-chan pipeline.DownloadProgress
	client     *api.Client
	profile    pipeline.Profile
	cfg        *config.Config
	width      int
	height     int
}

func NewDownloadModel(client *api.Client, profile pipeline.Profile, cfg *config.Config) DownloadModel {
	pp := components.NewStyledInput("Passphrase", "decryption passphrase", true)
	pp.SetFocused(true)

	return DownloadModel{
		passphrase: pp,
		bar:        components.NewProgressBar("Download Progress"),
		spinner:    components.NewFunSpinner(),
		state:      downloadStatePassphrase,
		client:     client,
		profile:    profile,
		cfg:        cfg,
	}
}

func (m DownloadModel) Init() tea.Cmd {
	return textinput.Blink
}

func (m DownloadModel) Update(msg tea.Msg) (DownloadModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

	case DownloadProgressMsg:
		m.progress = msg.Progress
		return m, tea.Batch(waitForDownloadProgress(m.progressCh), m.spinner.Spinner.Tick)

	case DownloadDoneMsg:
		if msg.Err != nil {
			m.err = msg.Err.Error()
		} else {
			m.savePath = msg.SavePath
		}
		m.state = downloadStateDone
		return m, nil

	case tea.KeyMsg:
		if m.state == downloadStateDownloading && msg.String() == "esc" {
			if m.cancel != nil {
				m.cancel()
			}
			return m, func() tea.Msg { return SwitchScreenMsg{Screen: "dashboard"} }
		}

		if m.state == downloadStateDone {
			return m, func() tea.Msg { return SwitchScreenMsg{Screen: "dashboard"} }
		}

		m.err = ""
		switch msg.String() {
		case "esc":
			return m, func() tea.Msg { return SwitchScreenMsg{Screen: "dashboard"} }
		case "enter":
			if m.state == downloadStatePassphrase {
				if m.passphrase.Value() == "" {
					m.err = "Passphrase is required to decrypt"
					return m, nil
				}
				m.state = downloadStateDownloading
				cmd := m.startDownload()
				return m, cmd
			}
		}
	}

	if m.state == downloadStateDownloading {
		cmd := m.spinner.Update(msg)
		return m, cmd
	}

	var cmd tea.Cmd
	if m.state == downloadStatePassphrase {
		cmd = m.passphrase.Update(msg)
	}
	return m, cmd
}

func (m DownloadModel) View() string {
	title := lipgloss.NewStyle().Foreground(lipgloss.Color("#00d5e4")).Bold(true).
		Render("Download & Decrypt")

	var body strings.Builder

	// File info
	body.WriteString("  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#a1a1aa")).Render("File") +
		"  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#e4e4e7")).Render(m.fileName))
	body.WriteString("\n\n")

	switch m.state {
	case downloadStatePassphrase:
		body.WriteString(m.passphrase.View())
		body.WriteString("\n\n")
		body.WriteString("  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#71717a")).
			Render("Enter the passphrase used to encrypt this file"))

	case downloadStateDownloading:
		body.WriteString("  " + m.spinner.View())
		body.WriteString("\n\n")
		p := m.progress
		pct := 0.0
		if p.ChunksTotal > 0 {
			pct = float64(p.ChunksDone) / float64(p.ChunksTotal)
		}
		body.WriteString("  " + m.bar.View(pct, p.Speed))
		body.WriteString("\n\n")
		chunks := fmt.Sprintf("  Chunks: %d / %d", p.ChunksDone, p.ChunksTotal)
		body.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("#71717a")).Render(chunks))
		if p.BytesTotal > 0 {
			bytes := fmt.Sprintf("    %s / %s", components.FormatBytes(p.BytesDone), components.FormatBytes(p.BytesTotal))
			body.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("#71717a")).Render(bytes))
		}
		if p.Stage != "" {
			body.WriteString("\n")
			stage := fmt.Sprintf("  Stage: %s", p.Stage)
			body.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("#52525b")).Render(stage))
		}

	case downloadStateDone:
		if m.err != "" {
			body.WriteString("  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#ef4444")).Bold(true).
				Render("! Download failed: "+m.err))
		} else {
			body.WriteString("  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#22c55e")).Bold(true).
				Render("Download complete!"))
			body.WriteString("\n\n")
			body.WriteString("  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#a1a1aa")).Render("Saved to") +
				"  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#e4e4e7")).Render(m.savePath))
		}
		body.WriteString("\n\n")
		body.WriteString("  " + lipgloss.NewStyle().Foreground(lipgloss.Color("#52525b")).Render("Press any key to go back"))
	}

	if m.err != "" && m.state != downloadStateDone {
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
	case downloadStatePassphrase:
		footer = theme.HelpBar(theme.KeyHelp("enter", "decrypt & download"), theme.KeyHelp("esc", "cancel"))
	case downloadStateDownloading:
		footer = theme.HelpBar(theme.KeyHelp("esc", "cancel"))
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

func waitForDownloadProgress(ch <-chan pipeline.DownloadProgress) tea.Cmd {
	if ch == nil {
		return nil
	}
	return func() tea.Msg {
		p, ok := <-ch
		if !ok {
			return nil
		}
		return DownloadProgressMsg{Progress: p}
	}
}

func (m *DownloadModel) startDownload() tea.Cmd {
	fileID := m.fileID
	passphrase := m.passphrase.Value()
	client := m.client
	profile := m.profile
	fileName := m.fileName

	dlDir := config.DefaultDownloadDir()
	if m.cfg != nil && m.cfg.DownloadDir != "" {
		dlDir = m.cfg.DownloadDir
	}
	savePath := filepath.Join(dlDir, fileName)

	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel

	ch := make(chan pipeline.DownloadProgress, 4)
	m.progressCh = ch

	return tea.Batch(
		func() tea.Msg {
			engine := pipeline.NewDownloadEngine(client, profile)
			err := engine.Download(ctx, fileID, passphrase, savePath, func(p pipeline.DownloadProgress) {
				select {
				case ch <- p:
				default:
				}
			})
			close(ch)
			return DownloadDoneMsg{FileName: fileName, SavePath: savePath, Err: err}
		},
		waitForDownloadProgress(ch),
		m.spinner.Init(),
	)
}

func (m *DownloadModel) SetFile(fileID, fileName string) {
	m.fileID = fileID
	m.fileName = fileName
}

func (m *DownloadModel) SetSize(w, h int) {
	m.width = w
	m.height = h
}

func (m *DownloadModel) Reset() {
	m.passphrase.SetValue("")
	m.state = downloadStatePassphrase
	m.err = ""
	m.savePath = ""
	m.progress = pipeline.DownloadProgress{}
	m.progressCh = nil
}

func (m *DownloadModel) FocusFirst() tea.Cmd {
	m.state = downloadStatePassphrase
	m.passphrase.SetFocused(true)
	return textinput.Blink
}
