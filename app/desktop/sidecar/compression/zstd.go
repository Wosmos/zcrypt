package compression

import (
	"fmt"
	"sync"

	"github.com/klauspost/compress/zstd"
)

var (
	decoderOnce sync.Once
	decoder     *zstd.Decoder
)

func getDecoder() *zstd.Decoder {
	decoderOnce.Do(func() {
		decoder, _ = zstd.NewReader(nil)
	})
	return decoder
}

// Compress compresses data with zstd at the given level (1-3).
// Returns (compressed, true) if compression saves >= 5%, otherwise (original, false).
func Compress(data []byte, level int) ([]byte, bool) {
	var encLevel zstd.EncoderLevel
	switch {
	case level <= 1:
		encLevel = zstd.SpeedFastest
	case level == 2:
		encLevel = zstd.SpeedDefault
	default:
		encLevel = zstd.SpeedBetterCompression
	}

	enc, err := zstd.NewWriter(nil, zstd.WithEncoderLevel(encLevel))
	if err != nil {
		return data, false
	}
	defer enc.Close()

	compressed := enc.EncodeAll(data, make([]byte, 0, len(data)))

	// Only use compressed if it saves >= 5% (matches browser threshold)
	if len(compressed) < int(float64(len(data))*0.95) {
		return compressed, true
	}
	return data, false
}

// Decompress decompresses zstd-compressed data.
func Decompress(data []byte) ([]byte, error) {
	dec := getDecoder()
	result, err := dec.DecodeAll(data, nil)
	if err != nil {
		return nil, fmt.Errorf("zstd decompress: %w", err)
	}
	return result, nil
}
