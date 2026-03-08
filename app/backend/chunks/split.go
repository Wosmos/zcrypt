package chunks

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
)

const ChunkSize = 10 * 1024 * 1024 // 10MB — smaller chunks for resumable uploads

// SplitFile splits a file into chunks of ChunkSize bytes.
// Returns paths to the created chunk files in the output directory.
func SplitFile(srcPath, outDir string) ([]string, error) {
	src, err := os.Open(srcPath)
	if err != nil {
		return nil, fmt.Errorf("open source: %w", err)
	}
	defer src.Close()

	if err := os.MkdirAll(outDir, 0700); err != nil {
		return nil, fmt.Errorf("create output dir: %w", err)
	}

	var paths []string
	buf := make([]byte, ChunkSize)
	index := 0

	for {
		n, err := io.ReadFull(src, buf)
		if n > 0 {
			chunkPath := filepath.Join(outDir, fmt.Sprintf("chunk_%03d", index))
			if writeErr := os.WriteFile(chunkPath, buf[:n], 0600); writeErr != nil {
				return nil, fmt.Errorf("write chunk %d: %w", index, writeErr)
			}
			paths = append(paths, chunkPath)
			index++
		}
		if err == io.EOF || err == io.ErrUnexpectedEOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read chunk %d: %w", index, err)
		}
	}

	return paths, nil
}
