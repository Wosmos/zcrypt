package api

import (
	"bufio"
	"fmt"
	"net/http"
	"strings"
)

// SSEEvent represents a server-sent event.
type SSEEvent struct {
	Event string
	Data  string
}

// SSEClient connects to the SSE endpoint for real-time events.
type SSEClient struct {
	url    string
	token  string
	client *http.Client
	done   chan struct{}
}

// NewSSEClient creates a new SSE client.
func NewSSEClient(baseURL, token string) *SSEClient {
	return &SSEClient{
		url:    baseURL + "/api/events?token=" + token,
		token:  token,
		client: &http.Client{},
		done:   make(chan struct{}),
	}
}

// Connect starts listening for events. Returns a channel of events.
func (s *SSEClient) Connect() (<-chan SSEEvent, error) {
	req, err := http.NewRequest("GET", s.url, nil)
	if err != nil {
		return nil, fmt.Errorf("create SSE request: %w", err)
	}
	req.Header.Set("Accept", "text/event-stream")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("SSE connect: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, fmt.Errorf("SSE HTTP %d", resp.StatusCode)
	}

	events := make(chan SSEEvent, 16)

	go func() {
		defer resp.Body.Close()
		defer close(events)

		scanner := bufio.NewScanner(resp.Body)
		var event, data string

		for scanner.Scan() {
			select {
			case <-s.done:
				return
			default:
			}

			line := scanner.Text()

			if line == "" {
				// Empty line = end of event
				if data != "" {
					events <- SSEEvent{Event: event, Data: data}
				}
				event = ""
				data = ""
				continue
			}

			if strings.HasPrefix(line, "event: ") {
				event = strings.TrimPrefix(line, "event: ")
			} else if strings.HasPrefix(line, "data: ") {
				data = strings.TrimPrefix(line, "data: ")
			}
		}
	}()

	return events, nil
}

// Close stops the SSE connection.
func (s *SSEClient) Close() {
	close(s.done)
}
