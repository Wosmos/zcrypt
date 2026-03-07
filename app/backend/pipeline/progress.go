package pipeline

import (
	"sync"

	"github.com/zpush/zpush/types"
)

// ProgressEmitter manages progress event subscribers.
type ProgressEmitter struct {
	mu          sync.RWMutex
	subscribers map[string]chan types.ProgressEvent
}

// NewProgressEmitter creates a new emitter.
func NewProgressEmitter() *ProgressEmitter {
	return &ProgressEmitter{
		subscribers: make(map[string]chan types.ProgressEvent),
	}
}

// Subscribe registers a new listener and returns its channel and ID.
func (pe *ProgressEmitter) Subscribe(id string) <-chan types.ProgressEvent {
	pe.mu.Lock()
	defer pe.mu.Unlock()

	ch := make(chan types.ProgressEvent, 32)
	pe.subscribers[id] = ch
	return ch
}

// Unsubscribe removes a listener.
func (pe *ProgressEmitter) Unsubscribe(id string) {
	pe.mu.Lock()
	defer pe.mu.Unlock()

	if ch, ok := pe.subscribers[id]; ok {
		close(ch)
		delete(pe.subscribers, id)
	}
}

// Emit sends a progress event to all subscribers.
func (pe *ProgressEmitter) Emit(event types.ProgressEvent) {
	pe.mu.RLock()
	defer pe.mu.RUnlock()

	for _, ch := range pe.subscribers {
		select {
		case ch <- event:
		default:
			// drop if subscriber is slow
		}
	}
}
