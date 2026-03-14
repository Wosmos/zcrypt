package api

// Login authenticates with email and password.
func (c *Client) Login(email, password string) (*LoginResponse, error) {
	var resp LoginResponse
	err := c.doJSON("POST", "/api/auth/login", LoginRequest{
		Email:    email,
		Password: password,
	}, &resp)
	return &resp, err
}

// Register creates a new account.
func (c *Client) Register(email, username, password string, force bool) (*RegisterResponse, error) {
	var resp RegisterResponse
	err := c.doJSON("POST", "/api/auth/register", RegisterRequest{
		Email:    email,
		Username: username,
		Password: password,
		Force:    force,
	}, &resp)
	return &resp, err
}

// RefreshTokens refreshes the access token.
func (c *Client) RefreshTokens(refreshToken string) (*LoginResponse, error) {
	var resp LoginResponse
	err := c.doJSONNoRetry("POST", "/api/auth/refresh", RefreshRequest{
		RefreshToken: refreshToken,
	}, &resp)
	return &resp, err
}

// Verify2FA verifies a TOTP code during login.
func (c *Client) Verify2FA(tempToken, code string) (*LoginResponse, error) {
	var resp LoginResponse
	err := c.doJSON("POST", "/api/auth/2fa/verify", Verify2FARequest{
		TempToken: tempToken,
		Code:      code,
	}, &resp)
	return &resp, err
}

// GetMe returns the current authenticated user.
func (c *Client) GetMe() (*User, error) {
	var user User
	err := c.doJSON("GET", "/api/auth/me", nil, &user)
	return &user, err
}

// Logout invalidates the refresh token.
func (c *Client) Logout(refreshToken string) error {
	return c.doJSON("POST", "/api/auth/logout", LogoutRequest{
		RefreshToken: refreshToken,
	}, nil)
}
