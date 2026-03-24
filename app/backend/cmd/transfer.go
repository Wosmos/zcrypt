package cmd

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"nhooyr.io/websocket"
)

// transferRoom represents a pairing room for real-time file transfer.
type transferRoom struct {
	code      string
	sender    *websocket.Conn
	receiver  *websocket.Conn
	mu        sync.Mutex
	createdAt time.Time
	done      chan struct{}
}

// transferHub manages active transfer rooms.
type transferHub struct {
	mu    sync.RWMutex
	rooms map[string]*transferRoom
}

func newTransferHub() *transferHub {
	h := &transferHub{rooms: make(map[string]*transferRoom)}
	go h.cleanup()
	return h
}

func (h *transferHub) createRoom() (*transferRoom, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Generate 6-digit code
	var code string
	for attempts := 0; attempts < 10; attempts++ {
		code = generateCode()
		if _, exists := h.rooms[code]; !exists {
			break
		}
	}
	if _, exists := h.rooms[code]; exists {
		return nil, fmt.Errorf("failed to generate unique code")
	}

	room := &transferRoom{
		code:      code,
		createdAt: time.Now(),
		done:      make(chan struct{}),
	}
	h.rooms[code] = room
	return room, nil
}

func (h *transferHub) getRoom(code string) *transferRoom {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.rooms[code]
}

func (h *transferHub) removeRoom(code string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if room, ok := h.rooms[code]; ok {
		select {
		case <-room.done:
		default:
			close(room.done)
		}
		delete(h.rooms, code)
	}
}

func (h *transferHub) cleanup() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		h.mu.Lock()
		now := time.Now()
		for code, room := range h.rooms {
			if now.Sub(room.createdAt) > 10*time.Minute {
				select {
				case <-room.done:
				default:
					close(room.done)
				}
				delete(h.rooms, code)
			}
		}
		h.mu.Unlock()
	}
}

func generateCode() string {
	b := make([]byte, 3)
	rand.Read(b)
	n := (int(b[0])<<16 | int(b[1])<<8 | int(b[2])) % 1000000
	return fmt.Sprintf("%06d", n)
}

// transferMessage is the JSON envelope for WebSocket messages.
type transferMessage struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data,omitempty"`
}

// HandleTransferWS handles WebSocket connections for real-time file transfer.
// Protocol:
//
//	Sender connects → gets room code
//	Receiver connects with code → paired
//	Sender sends "file_info" with metadata
//	Sender sends "chunk" messages with encrypted data (base64)
//	Sender sends "done" when complete
//	All data is end-to-end encrypted — server just relays
func (s *Server) HandleTransferWS(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"},
	})
	if err != nil {
		log.Printf("transfer: ws accept: %v", err)
		return
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Minute)
	defer cancel()

	// First message determines role: {"type":"create"} or {"type":"join","data":"123456"}
	_, msg, err := conn.Read(ctx)
	if err != nil {
		return
	}

	var initial transferMessage
	if err := json.Unmarshal(msg, &initial); err != nil {
		conn.Close(websocket.StatusInvalidFramePayloadData, "invalid message")
		return
	}

	switch initial.Type {
	case "create":
		s.handleTransferSender(ctx, conn)
	case "join":
		var code string
		if err := json.Unmarshal(initial.Data, &code); err != nil {
			conn.Close(websocket.StatusInvalidFramePayloadData, "invalid code")
			return
		}
		s.handleTransferReceiver(ctx, conn, code)
	default:
		conn.Close(websocket.StatusInvalidFramePayloadData, "unknown type")
	}
}

func (s *Server) handleTransferSender(ctx context.Context, conn *websocket.Conn) {
	room, err := s.transferHub.createRoom()
	if err != nil {
		wsWriteJSON(conn, ctx, transferMessage{Type: "error", Data: jsonRaw("too many active rooms")})
		return
	}
	defer s.transferHub.removeRoom(room.code)

	room.mu.Lock()
	room.sender = conn
	room.mu.Unlock()

	// Send code to sender
	wsWriteJSON(conn, ctx, transferMessage{Type: "code", Data: jsonRaw(room.code)})

	// Wait for receiver to join or timeout
	select {
	case <-ctx.Done():
		return
	case <-room.done:
		return
	case <-waitForReceiver(room):
	}

	// Notify sender that receiver connected
	wsWriteJSON(conn, ctx, transferMessage{Type: "paired"})

	// Relay messages from sender to receiver
	for {
		_, msg, err := conn.Read(ctx)
		if err != nil {
			return
		}

		room.mu.Lock()
		receiver := room.receiver
		room.mu.Unlock()

		if receiver == nil {
			return
		}

		if err := receiver.Write(ctx, websocket.MessageText, msg); err != nil {
			return
		}

		// Check if transfer is done
		var m transferMessage
		if json.Unmarshal(msg, &m) == nil && m.Type == "done" {
			// Grace period so receiver processes the done message before we tear down the room
			time.Sleep(3 * time.Second)
			return
		}
	}
}

func (s *Server) handleTransferReceiver(ctx context.Context, conn *websocket.Conn, code string) {
	room := s.transferHub.getRoom(code)
	if room == nil {
		wsWriteJSON(conn, ctx, transferMessage{Type: "error", Data: jsonRaw("invalid code")})
		return
	}

	room.mu.Lock()
	if room.receiver != nil {
		room.mu.Unlock()
		wsWriteJSON(conn, ctx, transferMessage{Type: "error", Data: jsonRaw("room already has a receiver")})
		return
	}
	room.receiver = conn
	room.mu.Unlock()

	// Notify receiver that pairing succeeded
	wsWriteJSON(conn, ctx, transferMessage{Type: "paired"})

	// Wait for sender to complete or disconnect
	select {
	case <-ctx.Done():
	case <-room.done:
	}
}

func waitForReceiver(room *transferRoom) <-chan struct{} {
	ch := make(chan struct{})
	go func() {
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()
		for range ticker.C {
			room.mu.Lock()
			hasReceiver := room.receiver != nil
			room.mu.Unlock()
			if hasReceiver {
				close(ch)
				return
			}
			select {
			case <-room.done:
				return
			default:
			}
		}
	}()
	return ch
}

func wsWriteJSON(conn *websocket.Conn, ctx context.Context, msg transferMessage) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return conn.Write(ctx, websocket.MessageText, data)
}

func jsonRaw(v interface{}) json.RawMessage {
	data, _ := json.Marshal(v)
	return data
}
