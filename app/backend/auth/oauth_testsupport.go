//go:build integration

package auth

// SetOAuthEndpointsForTest points a provider at stub token and userinfo URLs and
// returns a function that restores the originals.
func SetOAuthEndpointsForTest(provider, tokenURL, userinfoURL string) func() {
	orig := oauthProviders[provider]
	patched := orig
	patched.TokenURL = tokenURL
	patched.UserinfoURL = userinfoURL
	oauthProviders[provider] = patched
	return func() { oauthProviders[provider] = orig }
}
