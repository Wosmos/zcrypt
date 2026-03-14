package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

// TokenProvider supplies auth tokens for API requests.
type TokenProvider interface {
	GetAccessToken() string
	GetRefreshToken() string
	SetTokens(access, refresh, userID, username, email string)
}

// Client is the HTTP client for the zcrypt backend API.
type Client struct {
	BaseURL    string
	httpClient *http.Client
	tokens     TokenProvider
	refreshMu  sync.Mutex
}

// NewClient creates a new API client.
func NewClient(baseURL string, tokens TokenProvider) *Client {
	return &Client{
		BaseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		tokens: tokens,
	}
}

// doJSON performs a JSON request and decodes the response.
func (c *Client) doJSON(method, path string, body, result interface{}) error {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, c.BaseURL+path, bodyReader)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	if token := c.tokens.GetAccessToken(); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	// Auto-refresh on 401
	if resp.StatusCode == http.StatusUnauthorized && c.tokens.GetRefreshToken() != "" {
		if refreshErr := c.refreshToken(); refreshErr == nil {
			// Retry with new token
			return c.doJSON(method, path, body, result)
		}
	}

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		var errResp ErrorResponse
		if json.Unmarshal(respBody, &errResp) == nil && errResp.Error != "" {
			return fmt.Errorf("%s", errResp.Error)
		}
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	if result != nil {
		if err := json.Unmarshal(respBody, result); err != nil {
			return fmt.Errorf("decode response: %w", err)
		}
	}

	return nil
}

// doRaw performs a request with raw body and returns the response.
func (c *Client) doRaw(method, path string, body io.Reader, headers map[string]string) (*http.Response, error) {
	req, err := http.NewRequest(method, c.BaseURL+path, body)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	if token := c.tokens.GetAccessToken(); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http request: %w", err)
	}

	// Auto-refresh on 401
	if resp.StatusCode == http.StatusUnauthorized && c.tokens.GetRefreshToken() != "" {
		resp.Body.Close()
		if refreshErr := c.refreshToken(); refreshErr == nil {
			return c.doRaw(method, path, body, headers)
		}
	}

	return resp, nil
}

// doExternal performs an HTTP request to an external URL (not the zcrypt API).
func (c *Client) doExternal(method, url string, body io.Reader, headers map[string]string) (*http.Response, error) {
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	for k, v := range headers {
		req.Header.Set(k, v)
	}

	return c.httpClient.Do(req)
}

// refreshToken attempts to refresh the access token.
func (c *Client) refreshToken() error {
	c.refreshMu.Lock()
	defer c.refreshMu.Unlock()

	var resp LoginResponse
	err := c.doJSONNoRetry("POST", "/api/auth/refresh", RefreshRequest{
		RefreshToken: c.tokens.GetRefreshToken(),
	}, &resp)
	if err != nil {
		return err
	}

	if resp.AccessToken != "" {
		user := resp.User
		if user != nil {
			c.tokens.SetTokens(resp.AccessToken, resp.RefreshToken, user.ID, user.Username, user.Email)
		} else {
			c.tokens.SetTokens(resp.AccessToken, resp.RefreshToken, "", "", "")
		}
	}
	return nil
}

// doJSONNoRetry is like doJSON but doesn't retry on 401 (to avoid infinite loops).
func (c *Client) doJSONNoRetry(method, path string, body, result interface{}) error {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, c.BaseURL+path, bodyReader)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		var errResp ErrorResponse
		if json.Unmarshal(respBody, &errResp) == nil && errResp.Error != "" {
			return fmt.Errorf("%s", errResp.Error)
		}
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	if result != nil {
		if err := json.Unmarshal(respBody, result); err != nil {
			return fmt.Errorf("decode response: %w", err)
		}
	}
	return nil
}
