package api

// GetQuota returns the user's storage quota info.
func (c *Client) GetQuota() (*QuotaInfo, error) {
	var quota QuotaInfo
	err := c.doJSON("GET", "/api/quota", nil, &quota)
	return &quota, err
}
