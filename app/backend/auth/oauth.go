package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// OAuthProviderInfo holds static config for an OAuth provider.
type OAuthProviderInfo struct {
	AuthURL     string
	TokenURL    string
	UserinfoURL string
	Scopes      []string
}

var oauthProviders = map[string]OAuthProviderInfo{
	"google": {
		AuthURL:     "https://accounts.google.com/o/oauth2/v2/auth",
		TokenURL:    "https://oauth2.googleapis.com/token",
		UserinfoURL: "https://www.googleapis.com/oauth2/v2/userinfo",
		Scopes:      []string{"openid", "email", "profile"},
	},
	"github": {
		AuthURL:     "https://github.com/login/oauth/authorize",
		TokenURL:    "https://github.com/login/oauth/access_token",
		UserinfoURL: "https://api.github.com/user",
		Scopes:      []string{"read:user", "user:email"},
	},
}

// OAuthUserInfo holds the user info returned by an OAuth provider.
type OAuthUserInfo struct {
	ProviderID string
	Email      string
	Name       string
}

// BuildOAuthURL constructs the OAuth authorization URL.
func BuildOAuthURL(provider, clientID, redirectURI, state string) (string, error) {
	info, ok := oauthProviders[provider]
	if !ok {
		return "", fmt.Errorf("unsupported provider: %s", provider)
	}

	params := url.Values{
		"client_id":     {clientID},
		"redirect_uri":  {redirectURI},
		"response_type": {"code"},
		"state":         {state},
		"scope":         {strings.Join(info.Scopes, " ")},
	}

	if provider == "google" {
		params.Set("access_type", "offline")
		params.Set("prompt", "select_account")
	}

	return info.AuthURL + "?" + params.Encode(), nil
}

// ExchangeOAuthCode exchanges an authorization code for an access token.
func ExchangeOAuthCode(ctx context.Context, provider, clientID, clientSecret, code, redirectURI string) (string, error) {
	info, ok := oauthProviders[provider]
	if !ok {
		return "", fmt.Errorf("unsupported provider: %s", provider)
	}

	data := url.Values{
		"client_id":     {clientID},
		"client_secret": {clientSecret},
		"code":          {code},
		"redirect_uri":  {redirectURI},
		"grant_type":    {"authorization_code"},
	}

	req, err := http.NewRequestWithContext(ctx, "POST", info.TokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return "", fmt.Errorf("create token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("token exchange: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("parse token response: %w", err)
	}

	if errStr, ok := result["error"].(string); ok {
		desc, _ := result["error_description"].(string)
		return "", fmt.Errorf("oauth error: %s: %s", errStr, desc)
	}

	token, ok := result["access_token"].(string)
	if !ok || token == "" {
		return "", fmt.Errorf("no access_token in response")
	}

	return token, nil
}

// FetchOAuthUserInfo fetches the user's profile from the OAuth provider.
func FetchOAuthUserInfo(ctx context.Context, provider, accessToken string) (*OAuthUserInfo, error) {
	info, ok := oauthProviders[provider]
	if !ok {
		return nil, fmt.Errorf("unsupported provider: %s", provider)
	}

	req, err := http.NewRequestWithContext(ctx, "GET", info.UserinfoURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create userinfo request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("userinfo request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse userinfo: %w", err)
	}

	userInfo := &OAuthUserInfo{}

	switch provider {
	case "google":
		if id, ok := result["id"].(string); ok {
			userInfo.ProviderID = id
		}
		if email, ok := result["email"].(string); ok {
			userInfo.Email = email
		}
		if name, ok := result["name"].(string); ok {
			userInfo.Name = name
		}
	case "github":
		if id, ok := result["id"].(float64); ok {
			userInfo.ProviderID = fmt.Sprintf("%.0f", id)
		}
		if name, ok := result["name"].(string); ok {
			userInfo.Name = name
		}
		// GitHub might not return email in user endpoint
		if email, ok := result["email"].(string); ok && email != "" {
			userInfo.Email = email
		} else {
			// Fetch email from /user/emails endpoint
			email, err := fetchGitHubPrimaryEmail(ctx, accessToken)
			if err == nil {
				userInfo.Email = email
			}
		}
	}

	if userInfo.ProviderID == "" {
		return nil, fmt.Errorf("no provider ID in response")
	}
	if userInfo.Email == "" {
		return nil, fmt.Errorf("no email in response — user may have a private email")
	}

	return userInfo, nil
}

// fetchGitHubPrimaryEmail fetches the primary verified email from GitHub.
func fetchGitHubPrimaryEmail(ctx context.Context, accessToken string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.github.com/user/emails", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := json.Unmarshal(body, &emails); err != nil {
		return "", err
	}

	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email, nil
		}
	}
	// Fallback: any verified email
	for _, e := range emails {
		if e.Verified {
			return e.Email, nil
		}
	}

	return "", fmt.Errorf("no verified email found")
}
