package api

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strconv"
)

// InitUpload starts a new upload session.
func (c *Client) InitUpload(req UploadInitRequest) (*UploadInitResponse, error) {
	var resp UploadInitResponse
	err := c.doJSON("POST", "/api/upload/init", req, &resp)
	return &resp, err
}

// UploadChunk uploads a single encrypted chunk (relay mode).
func (c *Client) UploadChunk(sessionID string, index int, data []byte, sha256 string, compressed bool) error {
	path := fmt.Sprintf("/api/upload/%s/chunk/%d", sessionID, index)
	headers := map[string]string{
		"Content-Type":   "application/octet-stream",
		"X-Chunk-SHA256": sha256,
	}
	if compressed {
		headers["X-Chunk-Compressed"] = "true"
	}

	resp, err := c.doRaw("PUT", path, bytes.NewReader(data), headers)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("upload chunk %d: HTTP %d: %s", index, resp.StatusCode, string(body))
	}
	return nil
}

// PresignChunk gets a presigned URL for direct platform upload.
func (c *Client) PresignChunk(sessionID string, index int, sha256 string, size int64) (*PresignResponse, error) {
	path := fmt.Sprintf("/api/upload/%s/presign/%d", sessionID, index)
	var resp PresignResponse
	err := c.doJSON("POST", path, PresignRequest{
		SHA256: sha256,
		Size:   size,
	}, &resp)
	return &resp, err
}

// DirectUploadToURL uploads encrypted data directly to a presigned platform URL.
func (c *Client) DirectUploadToURL(url string, headers map[string]string, data []byte) error {
	if headers == nil {
		headers = make(map[string]string)
	}
	headers["Content-Type"] = "application/octet-stream"
	headers["Content-Length"] = strconv.Itoa(len(data))

	resp, err := c.doExternal("PUT", url, bytes.NewReader(data), headers)
	if err != nil {
		return fmt.Errorf("direct upload: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("direct upload: HTTP %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

// ConfirmChunk confirms a directly-uploaded chunk.
func (c *Client) ConfirmChunk(sessionID string, index int, sha256 string, size int64, remotePath string, compressed bool) error {
	path := fmt.Sprintf("/api/upload/%s/confirm/%d", sessionID, index)
	return c.doJSON("POST", path, ConfirmChunkRequest{
		SHA256:     sha256,
		Size:       size,
		RemotePath: remotePath,
		Compressed: compressed,
	}, nil)
}

// CompleteUpload finalizes an upload session.
func (c *Client) CompleteUpload(sessionID string, encryptedSize, compressedSize int64) (*UploadCompleteResponse, error) {
	path := fmt.Sprintf("/api/upload/%s/complete", sessionID)
	var resp UploadCompleteResponse
	err := c.doJSON("POST", path, UploadCompleteRequest{
		EncryptedSize:  encryptedSize,
		CompressedSize: compressedSize,
	}, &resp)
	return &resp, err
}

// CancelUpload cancels an in-progress upload.
func (c *Client) CancelUpload(sessionID string) error {
	path := fmt.Sprintf("/api/upload/%s", sessionID)
	resp, err := c.doRaw("DELETE", path, nil, nil)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("cancel upload: HTTP %d", resp.StatusCode)
	}
	return nil
}

// GetUploadStatus checks upload progress.
func (c *Client) GetUploadStatus(sessionID string) (*UploadStatusResponse, error) {
	path := fmt.Sprintf("/api/upload/%s/status", sessionID)
	var resp UploadStatusResponse
	err := c.doJSON("GET", path, nil, &resp)
	return &resp, err
}

// UploadChunkWithRetry uploads a chunk with retry logic.
func (c *Client) UploadChunkWithRetry(sessionID string, index int, data []byte, sha256 string, compressed bool, maxRetries int) error {
	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		lastErr = c.UploadChunk(sessionID, index, data, sha256, compressed)
		if lastErr == nil {
			return nil
		}
		if attempt < maxRetries {
			// Simple backoff
			wait := (1 << attempt) * int(http.StatusContinue) // not used for timing, just placeholder
			_ = wait
		}
	}
	return fmt.Errorf("upload chunk %d failed after %d retries: %w", index, maxRetries, lastErr)
}

// DirectUploadWithRetry uploads to presigned URL with retry.
func (c *Client) DirectUploadWithRetry(url string, headers map[string]string, data []byte, maxRetries int) error {
	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		lastErr = c.DirectUploadToURL(url, headers, data)
		if lastErr == nil {
			return nil
		}
	}
	return fmt.Errorf("direct upload failed after %d retries: %w", maxRetries, lastErr)
}
