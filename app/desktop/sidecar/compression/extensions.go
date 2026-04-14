package compression

import (
	"path/filepath"
	"strings"
)

// compressedExtensions is the set of file extensions that are already compressed.
// Matches the browser's skip list from store/upload.ts.
var compressedExtensions = map[string]bool{
	// Images
	".jpg": true, ".jpeg": true, ".png": true, ".gif": true,
	".webp": true, ".avif": true, ".heic": true, ".heif": true,
	// Video
	".mp4": true, ".mkv": true, ".avi": true, ".mov": true,
	".webm": true, ".flv": true, ".m4v": true,
	// Audio
	".mp3": true, ".aac": true, ".ogg": true, ".flac": true,
	".opus": true, ".wma": true, ".m4a": true,
	// Archives
	".zip": true, ".rar": true, ".7z": true, ".gz": true,
	".bz2": true, ".xz": true, ".zst": true, ".lz4": true,
	".br": true,
	// Documents (already compressed internally)
	".pdf": true, ".docx": true, ".xlsx": true, ".pptx": true,
	// Fonts
	".woff": true, ".woff2": true,
}

// ShouldCompress returns true if the file would benefit from compression.
func ShouldCompress(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	// Handle .tar.gz
	if strings.HasSuffix(strings.ToLower(filename), ".tar.gz") {
		return false
	}
	return !compressedExtensions[ext]
}
