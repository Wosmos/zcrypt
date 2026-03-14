package api

// GetPlatformStatus returns connection status for all platforms.
func (c *Client) GetPlatformStatus() ([]PlatformStatus, error) {
	var statuses []PlatformStatus
	err := c.doJSON("GET", "/api/platforms/status", nil, &statuses)
	if statuses == nil {
		statuses = []PlatformStatus{}
	}
	return statuses, err
}

// ConnectPlatform adds a platform token.
func (c *Client) ConnectPlatform(platform, token string) (*ConnectPlatformResponse, error) {
	var resp ConnectPlatformResponse
	err := c.doJSON("POST", "/api/platforms/connect", ConnectPlatformRequest{
		Platform: platform,
		Token:    token,
	}, &resp)
	return &resp, err
}

// DisconnectPlatform removes a platform token.
func (c *Client) DisconnectPlatform(platform, username string) error {
	return c.doJSON("DELETE", "/api/platforms/disconnect", DisconnectPlatformRequest{
		Platform: platform,
		Username: username,
	}, nil)
}
