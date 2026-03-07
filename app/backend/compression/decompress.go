package compression

import (
	"fmt"
	"io"
	"os"

	"github.com/klauspost/compress/zstd"
)

// DecompressFile decompresses a zstd-compressed file.
func DecompressFile(srcPath, dstPath string) error {
	src, err := os.Open(srcPath)
	if err != nil {
		return fmt.Errorf("open source: %w", err)
	}
	defer src.Close()

	dst, err := os.Create(dstPath)
	if err != nil {
		return fmt.Errorf("create output: %w", err)
	}
	defer dst.Close()

	dec, err := zstd.NewReader(src)
	if err != nil {
		return fmt.Errorf("create decoder: %w", err)
	}
	defer dec.Close()

	if _, err := io.Copy(dst, dec); err != nil {
		return fmt.Errorf("decompress: %w", err)
	}

	return nil
}
