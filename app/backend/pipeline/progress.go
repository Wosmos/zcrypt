package pipeline

import (
	"sync"

	"github.com/zcrypt/zcrypt/types"
)

// SSEEvent wraps both progress and audit events for SSE delivery.
type SSEEvent struct {
	Type    string      `json:"type"`    // "progress" or "audit"
	Payload interface{} `json:"payload"`
}

// subscriber tracks an SSE connection with user context.
type subscriber struct {
	ch      chan SSEEvent
	userID  string
	isAdmin bool
}

// ProgressEmitter manages progress and audit event subscribers.
type ProgressEmitter struct {
	mu          sync.RWMutex
	subscribers map[string]*subscriber
}

// NewProgressEmitter creates a new emitter.
func NewProgressEmitter() *ProgressEmitter {
	return &ProgressEmitter{
		subscribers: make(map[string]*subscriber),
	}
}

// Subscribe registers a new listener and returns its channel.
func (pe *ProgressEmitter) Subscribe(id, userID string, isAdmin bool) <-chan SSEEvent {
	pe.mu.Lock()
	defer pe.mu.Unlock()

	ch := make(chan SSEEvent, 32)
	pe.subscribers[id] = &subscriber{
		ch:      ch,
		userID:  userID,
		isAdmin: isAdmin,
	}
	return ch
}

// Unsubscribe removes a listener.
func (pe *ProgressEmitter) Unsubscribe(id string) {
	pe.mu.Lock()
	defer pe.mu.Unlock()

	if sub, ok := pe.subscribers[id]; ok {
		close(sub.ch)
		delete(pe.subscribers, id)
	}
}

// ErrorEvent creates a progress event that signals an error for a file.
func ErrorEvent(fileID, errMsg string) types.ProgressEvent {
	return types.ProgressEvent{
		FileID:  fileID,
		Stage:   "error: " + errMsg,
		Percent: -1,
	}
}

// Emit sends a progress event to the owning user (or all admins).
func (pe *ProgressEmitter) Emit(event types.ProgressEvent) {
	pe.mu.RLock()
	defer pe.mu.RUnlock()

	// Strip user_id from the payload sent to clients (internal routing only)
	clientEvent := event
	targetUserID := event.UserID
	clientEvent.UserID = ""

	sse := SSEEvent{Type: "progress", Payload: clientEvent}
	for _, sub := range pe.subscribers {
		// If event has a user_id, only send to that user (or admins)
		if targetUserID != "" && sub.userID != targetUserID && !sub.isAdmin {
			continue
		}
		select {
		case sub.ch <- sse:
		default:
			// drop if subscriber is slow
		}
	}
}

// EmitToUser sends a custom event to a specific user's SSE connections.
func (pe *ProgressEmitter) EmitToUser(userID string, event SSEEvent) {
	pe.mu.RLock()
	defer pe.mu.RUnlock()

	for _, sub := range pe.subscribers {
		if sub.userID == userID {
			select {
			case sub.ch <- event:
			default:
			}
		}
	}
}

// EmitAudit sends an audit event. Admins get all events; regular users only get their own.
func (pe *ProgressEmitter) EmitAudit(event types.AuditEvent) {
	pe.mu.RLock()
	defer pe.mu.RUnlock()

	sse := SSEEvent{Type: "audit", Payload: event}
	for _, sub := range pe.subscribers {
		// Admins see all, users only see their own events
		if sub.isAdmin || (event.UserID != nil && *event.UserID == sub.userID) {
			select {
			case sub.ch <- sse:
			default:
			}
		}
	}
}
