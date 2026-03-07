package chunks

import (
	"fmt"
	"io"
	"os"
	"sort"
)

// MergeFiles concatenates chunk files (sorted by name) into a single output file.
func MergeFiles(chunkPaths []string, dstPath string) error {
	sort.Strings(chunkPaths)

	dst, err := os.Create(dstPath)
	if err != nil {
		return fmt.Errorf("create output: %w", err)
	}
	defer dst.Close()

	for i, path := range chunkPaths {
		chunk, err := os.Open(path)
		if err != nil {
			return fmt.Errorf("open chunk %d: %w", i, err)
		}

		if _, err := io.Copy(dst, chunk); err != nil {
			chunk.Close()
			return fmt.Errorf("copy chunk %d: %w", i, err)
		}
		chunk.Close()
	}

	return nil
}
