package screens

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/table"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/zcrypt/zcrypt-tui/internal/api"
	"github.com/zcrypt/zcrypt-tui/internal/ui/components"
	"github.com/zcrypt/zcrypt-tui/internal/ui/theme"
)

// FileListMsg is returned when files are fetched.
type FileListMsg struct {
	Files []api.FileMetadata
	Err   error
}

// QuotaMsg is returned when quota is fetched.
type QuotaMsg struct {
	Quota *api.QuotaInfo
	Err   error
}

// DeleteFileMsg is returned when a file is deleted.
type DeleteFileMsg struct {
	FileID string
	Err    error
}

// BulkDeleteDoneMsg is returned when bulk delete completes.
type BulkDeleteDoneMsg struct {
	Deleted int
	Failed  int
}

// RequestUploadMsg signals the app to open upload screen.
type RequestUploadMsg struct{}

// RequestUploadWithPathMsg signals upload with a pre-filled path.
type RequestUploadWithPathMsg struct {
	FilePath string
}

// RequestDownloadMsg signals the app to open download screen for a file.
type RequestDownloadMsg struct {
	FileID   string
	FileName string
}

type DashboardModel struct {
	files      []api.FileMetadata
	table      table.Model
	quota      *api.QuotaInfo
	searchMode bool
	search     string
	cmdMode    bool
	cmdInput   string
	cmdErr     string
	loading    bool
	err        string
	confirming string // "single:<fileID>" or "bulk"
	selected   map[int]bool // indices of selected files in filtered list
	client     *api.Client
	username   string
	serverURL  string
	width      int
	height     int
}

func NewDashboardModel(client *api.Client, username, serverURL string) DashboardModel {
	return DashboardModel{
		client:    client,
		username:  username,
		serverURL: serverURL,
		loading:   true,
		selected:  make(map[int]bool),
	}
}

func (m DashboardModel) Init() tea.Cmd {
	return tea.Batch(m.fetchFiles(), m.fetchQuota())
}

func (m DashboardModel) Update(msg tea.Msg) (DashboardModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.table = components.NewFileTable(m.width - 8)
		m.updateTableRows()

	case FileListMsg:
		m.loading = false
		if msg.Err != nil {
			m.err = msg.Err.Error()
			return m, nil
		}
		m.files = msg.Files
		m.selected = make(map[int]bool)
		m.updateTableRows()

	case QuotaMsg:
		if msg.Err == nil {
			m.quota = msg.Quota
		}

	case DeleteFileMsg:
		m.confirming = ""
		if msg.Err != nil {
			m.err = msg.Err.Error()
			return m, nil
		}
		return m, m.fetchFiles()

	case BulkDeleteDoneMsg:
		m.confirming = ""
		m.selected = make(map[int]bool)
		if msg.Failed > 0 {
			m.err = fmt.Sprintf("Deleted %d, failed %d", msg.Deleted, msg.Failed)
		}
		return m, m.fetchFiles()

	case tea.KeyMsg:
		m.err = ""

		// Delete confirmation mode
		if m.confirming != "" {
			switch msg.String() {
			case "y":
				if m.confirming == "bulk" {
					return m, m.doBulkDelete()
				}
				fileID := strings.TrimPrefix(m.confirming, "single:")
				return m, m.doDelete(fileID)
			case "n", "esc":
				m.confirming = ""
			}
			return m, nil
		}

		// Command mode
		if m.cmdMode {
			return m.handleCmdMode(msg)
		}

		// Search mode
		if m.searchMode {
			switch msg.String() {
			case "esc", "enter":
				m.searchMode = false
			case "backspace":
				if len(m.search) > 0 {
					m.search = m.search[:len(m.search)-1]
					m.updateTableRows()
				}
			default:
				if len(msg.String()) == 1 {
					m.search += msg.String()
					m.updateTableRows()
				}
			}
			return m, nil
		}

		switch msg.String() {
		case "u":
			return m, func() tea.Msg { return RequestUploadMsg{} }
		case "d", "enter":
			if row := m.table.SelectedRow(); row != nil {
				fileID := m.getSelectedFileID()
				fileName := row[0]
				// Strip selection marker prefix
				fileName = strings.TrimPrefix(fileName, "● ")
				fileName = strings.TrimPrefix(fileName, "  ")
				return m, func() tea.Msg { return RequestDownloadMsg{FileID: fileID, FileName: fileName} }
			}
		case "x", "delete":
			if len(m.selected) > 0 {
				m.confirming = "bulk"
			} else if fileID := m.getSelectedFileID(); fileID != "" {
				m.confirming = "single:" + fileID
			}
		case " ":
			// Toggle select on current row
			cursor := m.table.Cursor()
			if cursor >= 0 && cursor < len(m.filteredFiles()) {
				if m.selected[cursor] {
					delete(m.selected, cursor)
				} else {
					m.selected[cursor] = true
				}
				m.updateTableRows()
			}
		case "ctrl+a":
			// Select all / deselect all
			filtered := m.filteredFiles()
			if len(m.selected) == len(filtered) {
				m.selected = make(map[int]bool)
			} else {
				m.selected = make(map[int]bool)
				for i := range filtered {
					m.selected[i] = true
				}
			}
			m.updateTableRows()
		case "shift+down", "J":
			// Select current + move down
			cursor := m.table.Cursor()
			if cursor >= 0 && cursor < len(m.filteredFiles()) {
				m.selected[cursor] = true
				m.updateTableRows()
			}
			m.table.MoveDown(1)
		case "shift+up", "K":
			// Select current + move up
			cursor := m.table.Cursor()
			if cursor >= 0 && cursor < len(m.filteredFiles()) {
				m.selected[cursor] = true
				m.updateTableRows()
			}
			m.table.MoveUp(1)
		case "ctrl+d":
			// Deselect all
			m.selected = make(map[int]bool)
			m.updateTableRows()
		case "/":
			m.searchMode = true
			m.search = ""
		case ":":
			m.cmdMode = true
			m.cmdInput = ""
			m.cmdErr = ""
		case "r":
			m.loading = true
			return m, tea.Batch(m.fetchFiles(), m.fetchQuota())
		case "s":
			return m, func() tea.Msg { return SwitchScreenMsg{Screen: "settings"} }
		case "g":
			m.table.GotoTop()
		case "G":
			m.table.GotoBottom()
		}
	}

	// Update table
	var cmd tea.Cmd
	m.table, cmd = m.table.Update(msg)
	return m, cmd
}

func (m *DashboardModel) handleCmdMode(msg tea.KeyMsg) (DashboardModel, tea.Cmd) {
	switch msg.String() {
	case "esc":
		m.cmdMode = false
		m.cmdInput = ""
		m.cmdErr = ""
		return *m, nil
	case "enter":
		cmd := m.executeCommand(m.cmdInput)
		m.cmdMode = false
		m.cmdInput = ""
		return *m, cmd
	case "backspace":
		if len(m.cmdInput) > 0 {
			m.cmdInput = m.cmdInput[:len(m.cmdInput)-1]
		}
		return *m, nil
	default:
		if len(msg.String()) == 1 || msg.String() == " " {
			m.cmdInput += msg.String()
		}
		return *m, nil
	}
}

func (m *DashboardModel) executeCommand(input string) tea.Cmd {
	input = strings.TrimSpace(input)
	if input == "" {
		return nil
	}

	parts := strings.SplitN(input, " ", 2)
	cmd := strings.ToLower(parts[0])
	var arg string
	if len(parts) > 1 {
		arg = strings.TrimSpace(parts[1])
	}

	switch cmd {
	case "ls", "list", "refresh":
		m.loading = true
		return tea.Batch(m.fetchFiles(), m.fetchQuota())

	case "upload", "up":
		if arg != "" {
			return func() tea.Msg { return RequestUploadWithPathMsg{FilePath: arg} }
		}
		return func() tea.Msg { return RequestUploadMsg{} }

	case "dl", "download":
		if row := m.table.SelectedRow(); row != nil {
			fileID := m.getSelectedFileID()
			fileName := row[0]
			return func() tea.Msg { return RequestDownloadMsg{FileID: fileID, FileName: fileName} }
		}
		m.err = "No file selected"

	case "rm", "delete", "del":
		if len(m.selected) > 0 {
			m.confirming = "bulk"
		} else if fileID := m.getSelectedFileID(); fileID != "" {
			m.confirming = "single:" + fileID
		} else {
			m.err = "No file selected"
		}

	case "search", "find", "grep":
		if arg != "" {
			m.search = arg
			m.updateTableRows()
		} else {
			m.searchMode = true
			m.search = ""
		}

	case "clear":
		m.search = ""
		m.selected = make(map[int]bool)
		m.updateTableRows()

	case "select-all", "sa":
		filtered := m.filteredFiles()
		m.selected = make(map[int]bool)
		for i := range filtered {
			m.selected[i] = true
		}
		m.updateTableRows()

	case "settings", "config":
		return func() tea.Msg { return SwitchScreenMsg{Screen: "settings"} }

	case "logout":
		return func() tea.Msg { return LogoutMsg{} }

	case "q", "quit", "exit":
		return tea.Quit

	case "help", "?":
		m.err = "Commands: ls, upload [path], dl, rm, search [term], clear, sa (select-all), settings, logout, quit"

	default:
		m.err = fmt.Sprintf("Unknown command: %s — type :help for available commands", cmd)
	}

	return nil
}

func (m DashboardModel) View() string {
	if m.width == 0 {
		return ""
	}

	// Header
	header := m.renderHeader()

	// Separator
	sep := theme.Separator(m.width - 4)

	// Table or loading
	var body string
	if m.loading {
		body = lipgloss.NewStyle().Padding(2, 4).Render(
			theme.MutedStyle.Render("  Loading vault..."),
		)
	} else if len(m.files) == 0 {
		body = m.renderEmptyState()
	} else {
		body = lipgloss.NewStyle().Padding(0, 2).Render(m.table.View())
	}

	// Selection indicator
	if len(m.selected) > 0 {
		selBadge := lipgloss.NewStyle().
			Foreground(lipgloss.Color("#09090b")).
			Background(lipgloss.Color("#fbbf24")).
			Bold(true).
			Padding(0, 1).
			Render(fmt.Sprintf(" %d selected ", len(m.selected)))
		body += "\n" + lipgloss.NewStyle().Padding(0, 2).Render(selBadge +
			theme.DimStyle.Render("  x delete selected  ") +
			theme.DimStyle.Render("  a toggle all  ") +
			theme.DimStyle.Render("  space toggle"))
	}

	// Delete confirmation overlay
	if m.confirming != "" {
		var msg string
		if m.confirming == "bulk" {
			msg = fmt.Sprintf("Delete %d selected files? This cannot be undone.", len(m.selected))
		} else {
			msg = "Delete this file? This cannot be undone."
		}
		body += "\n\n" + components.ConfirmModal("Confirm Delete", msg, 56)
	}

	// Error
	if m.err != "" {
		body += "\n" + lipgloss.NewStyle().Padding(0, 2).Render(theme.ErrorStyle.Render("  "+m.err))
	}

	// Search indicator
	if m.searchMode {
		body += "\n" + lipgloss.NewStyle().Padding(0, 2).Render(
			theme.KeyStyle.Render("/") + theme.MutedStyle.Render(" search: ") + m.search + theme.MutedStyle.Render("_"),
		)
	}

	// Command bar
	if m.cmdMode {
		body += "\n" + lipgloss.NewStyle().Padding(0, 2).Render(
			theme.KeyStyle.Render(":") + lipgloss.NewStyle().Foreground(lipgloss.Color("#e4e4e7")).Render(m.cmdInput) +
				lipgloss.NewStyle().Foreground(lipgloss.Color("#00d5e4")).Render("_"),
		)
	}

	// Footer
	footer := m.renderFooter()

	return lipgloss.JoinVertical(lipgloss.Left,
		header,
		sep,
		body,
		"",
		footer,
	)
}

func (m DashboardModel) renderHeader() string {
	left := lipgloss.NewStyle().Padding(1, 2).Render(
		theme.BrandLine() + "  " + theme.TitleStyle.Render("Vault") + "  " + m.renderFileCount(),
	)

	var quotaStr string
	if m.quota != nil {
		used := components.FormatBytes(m.quota.UsedBytes)
		total := components.FormatBytes(m.quota.QuotaBytes)
		pct := float64(m.quota.UsedBytes) / float64(m.quota.QuotaBytes) * 100
		if m.quota.IsUnlimited {
			quotaStr = theme.MutedStyle.Render(fmt.Sprintf("%s used  ", used)) + theme.Tag("UNLIMITED", lipgloss.Color("#a78bfa"))
		} else {
			quotaStr = theme.MutedStyle.Render(fmt.Sprintf("%s / %s (%.0f%%)  ", used, total, pct)) + theme.Tag(strings.ToUpper(m.quota.Plan), lipgloss.Color("#00d5e4"))
		}
	}

	right := lipgloss.NewStyle().Padding(1, 2).Render(quotaStr)

	gap := m.width - lipgloss.Width(left) - lipgloss.Width(right)
	if gap < 0 {
		gap = 0
	}

	return left + strings.Repeat(" ", gap) + right
}

func (m DashboardModel) renderFileCount() string {
	count := len(m.files)
	if count == 0 {
		return theme.MutedStyle.Render("no files")
	}
	return theme.MutedStyle.Render(fmt.Sprintf("%d files", count))
}

func (m DashboardModel) renderEmptyState() string {
	box := lipgloss.NewStyle().
		Padding(3, 6).
		Align(lipgloss.Center)

	content := theme.MutedStyle.Render("Your vault is empty") + "\n\n" +
		theme.DimStyle.Render("Press ") + theme.KeyStyle.Render("u") + theme.DimStyle.Render(" to upload your first file") + "\n" +
		theme.DimStyle.Render("  or ") + theme.KeyStyle.Render(":upload /path") + theme.DimStyle.Render(" to upload directly")

	return lipgloss.Place(m.width, 12, lipgloss.Center, lipgloss.Center, box.Render(content))
}

func (m DashboardModel) renderFooter() string {
	// Position indicator
	var posStr string
	rows := m.table.Rows()
	if len(rows) > 0 {
		pos := m.table.Cursor() + 1
		total := len(rows)
		posStr = lipgloss.NewStyle().Foreground(lipgloss.Color("#52525b")).
			Render(fmt.Sprintf("  %d/%d", pos, total))
	}

	nav := theme.KeyHelp("j/k", "navigate") + "  " +
		theme.KeyHelp("g/G", "top/bottom")
	actions := theme.KeyHelp("enter", "download") + "  " +
		theme.KeyHelp("u", "upload") + "  " +
		theme.KeyHelp("x", "delete")
	sel := theme.KeyHelp("space", "select") + "  " +
		theme.KeyHelp("shift+j/k", "range") + "  " +
		theme.KeyHelp("ctrl+a", "all")
	other := theme.KeyHelp("/", "search") + "  " +
		theme.KeyHelp(":", "cmd") + "  " +
		theme.KeyHelp("q", "quit")

	pipeSep := lipgloss.NewStyle().Foreground(lipgloss.Color("#3f3f46")).Render(" │ ")

	bar := nav + pipeSep + actions + pipeSep + sel + pipeSep + other + posStr

	return lipgloss.NewStyle().Padding(0, 2).Render(bar)
}

func fileTypeIcon(ext string) string {
	switch strings.ToLower(ext) {
	case "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico":
		return "◆"
	case "mp4", "mov", "avi", "mkv", "webm", "flv":
		return "▶"
	case "mp3", "wav", "flac", "ogg", "aac", "m4a":
		return "♫"
	case "pdf", "doc", "docx", "txt", "rtf", "odt":
		return "▤"
	case "zip", "tar", "gz", "rar", "7z", "bz2":
		return "▣"
	case "go", "py", "js", "ts", "rs", "c", "cpp", "java", "rb":
		return "◇"
	case "csv", "xls", "xlsx", "json", "xml", "yaml", "yml":
		return "▦"
	case "bin", "exe", "dll", "so", "dylib":
		return "●"
	default:
		return "○"
	}
}

func (m *DashboardModel) updateTableRows() {
	filtered := m.filteredFiles()
	var rows []table.Row
	for i, f := range filtered {
		ext := filepath.Ext(f.OriginalName)
		if ext != "" {
			ext = ext[1:]
		} else {
			ext = "-"
		}

		icon := fileTypeIcon(ext)

		// Selection marker
		sel := "  "
		if m.selected[i] {
			sel = "● "
		}

		date := f.CreatedAt
		if t, err := time.Parse(time.RFC3339, f.CreatedAt); err == nil {
			date = t.Format("Jan 02, 15:04")
		}

		rows = append(rows, table.Row{
			sel + f.OriginalName,
			components.FormatBytes(f.OriginalSize),
			icon + " " + ext,
			fmt.Sprintf("%d", f.ChunkCount),
			date,
		})
	}
	m.table.SetRows(rows)
}

func (m DashboardModel) getSelectedFileID() string {
	cursor := m.table.Cursor()
	filtered := m.filteredFiles()
	if cursor >= 0 && cursor < len(filtered) {
		return filtered[cursor].ID
	}
	return ""
}

func (m DashboardModel) filteredFiles() []api.FileMetadata {
	if m.search == "" {
		return m.files
	}
	var filtered []api.FileMetadata
	for _, f := range m.files {
		if strings.Contains(strings.ToLower(f.OriginalName), strings.ToLower(m.search)) {
			filtered = append(filtered, f)
		}
	}
	return filtered
}

func (m DashboardModel) fetchFiles() tea.Cmd {
	client := m.client
	return func() tea.Msg {
		files, err := client.ListFiles("")
		return FileListMsg{Files: files, Err: err}
	}
}

func (m DashboardModel) fetchQuota() tea.Cmd {
	client := m.client
	return func() tea.Msg {
		quota, err := client.GetQuota()
		return QuotaMsg{Quota: quota, Err: err}
	}
}

func (m DashboardModel) doDelete(fileID string) tea.Cmd {
	client := m.client
	return func() tea.Msg {
		err := client.DeleteFile(fileID)
		return DeleteFileMsg{FileID: fileID, Err: err}
	}
}

func (m DashboardModel) doBulkDelete() tea.Cmd {
	client := m.client
	filtered := m.filteredFiles()
	var ids []string
	for idx := range m.selected {
		if idx < len(filtered) {
			ids = append(ids, filtered[idx].ID)
		}
	}
	return func() tea.Msg {
		deleted, failed := 0, 0
		for _, id := range ids {
			if err := client.DeleteFile(id); err != nil {
				failed++
			} else {
				deleted++
			}
		}
		return BulkDeleteDoneMsg{Deleted: deleted, Failed: failed}
	}
}

func (m *DashboardModel) SetSize(w, h int) {
	m.width = w
	m.height = h
	m.table = components.NewFileTable(w - 8)
	m.updateTableRows()
}

func (m *DashboardModel) SetUser(username, serverURL string) {
	m.username = username
	m.serverURL = serverURL
}

func (m *DashboardModel) Refresh() tea.Cmd {
	m.loading = true
	return tea.Batch(m.fetchFiles(), m.fetchQuota())
}
