package compression

import (
	"fmt"
	"io"
	"os"

	"github.com/klauspost/compress/zstd"
)

// CompressFile compresses src to dst using zstd at the best compression level.
func CompressFile(srcPath, dstPath string) error {
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

	enc, err := zstd.NewWriter(dst, zstd.WithEncoderLevel(zstd.SpeedBestCompression))
	if err != nil {
		return fmt.Errorf("create encoder: %w", err)
	}

	if _, err := io.Copy(enc, src); err != nil {
		enc.Close()
		return fmt.Errorf("compress: %w", err)
	}

	if err := enc.Close(); err != nil {
		return fmt.Errorf("finalize compression: %w", err)
	}

	return nil
}
