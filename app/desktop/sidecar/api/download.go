package api

import (
	"fmt"
	"io"
)

// GetFileMeta returns metadata for a file (including salt for decryption).
func (c *Client) GetFileMeta(fileID string) (*FileMetaResponse, error) {
	var resp FileMetaResponse
	err := c.doJSON("GET", fmt.Sprintf("/api/files/%s/meta", fileID), nil, &resp)
	return &resp, err
}

// GetFileChunk downloads a single encrypted chunk with metadata headers.
func (c *Client) GetFileChunk(fileID string, index int) (*ChunkDownload, error) {
	path := fmt.Sprintf("/api/files/%s/chunks/%d", fileID, index)
	resp, err := c.doRaw("GET", path, nil, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("download chunk %d: HTTP %d: %s", index, resp.StatusCode, string(body))
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read chunk %d: %w", index, err)
	}

	return &ChunkDownload{
		Data:       data,
		SHA256:     resp.Header.Get("X-Chunk-SHA256"),
		Compressed: resp.Header.Get("X-Chunk-Compressed") == "true",
	}, nil
}
