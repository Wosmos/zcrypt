package api

import "fmt"

// ListFiles returns all files for the authenticated user.
func (c *Client) ListFiles(filter string) ([]FileMetadata, error) {
	path := "/api/files"
	if filter != "" {
		path += "?filter=" + filter
	}
	var files []FileMetadata
	err := c.doJSON("GET", path, nil, &files)
	if err != nil {
		return nil, err
	}
	// API may return null for empty list
	if files == nil {
		files = []FileMetadata{}
	}
	return files, nil
}

// DeleteFile deletes a file by ID.
func (c *Client) DeleteFile(id string) error {
	return c.doJSON("DELETE", fmt.Sprintf("/api/files/%s", id), nil, nil)
}
