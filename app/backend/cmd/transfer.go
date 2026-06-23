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

	// Relayed chunk messages are ~88KB (64KB of data, base64-encoded) — well over
	// the library's 32KB default read limit, which would otherwise abort the relay
	// the moment it reads the first chunk. Raise it with headroom; this also caps
	// per-message size to bound memory use.
	conn.SetReadLimit(1 << 20) // 1 MB

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
		s.handleTransferReceiver(ctx, conn, code, s.clientIP(r))
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
	log.Printf("transfer: room created code=%s", room.code)

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
	log.Printf("transfer: paired, relaying code=%s", room.code)
	wsWriteJSON(conn, ctx, transferMessage{Type: "paired"})

	// Relay messages from sender to receiver
	relayed := 0
	for {
		_, msg, err := conn.Read(ctx)
		if err != nil {
			log.Printf("transfer: sender read ended code=%s relayed=%d: %v", room.code, relayed, err)
			return
		}

		room.mu.Lock()
		receiver := room.receiver
		room.mu.Unlock()

		if receiver == nil {
			return
		}

		if err := receiver.Write(ctx, websocket.MessageText, msg); err != nil {
			log.Printf("transfer: relay write failed code=%s relayed=%d: %v", room.code, relayed, err)
			return
		}
		relayed++

		// Check if transfer is done
		var m transferMessage
		if json.Unmarshal(msg, &m) == nil && m.Type == "done" {
			log.Printf("transfer: done code=%s relayed=%d", room.code, relayed)
			// Grace period so receiver processes the done message before we tear down the room
			time.Sleep(3 * time.Second)
			return
		}
	}
}

func (s *Server) handleTransferReceiver(ctx context.Context, conn *websocket.Conn, code, ip string) {
	// Rate-limit join attempts per IP. Pairing codes are short and the WS route is
	// exempt from the global limiter, so without this an attacker could brute-force
	// the active-room code space within a room's 10-minute lifetime.
	if !s.devMode && !s.transferJoinLimiter.allow(ip) {
		wsWriteJSON(conn, ctx, transferMessage{Type: "error", Data: jsonRaw("too many attempts, try again later")})
		return
	}
	room := s.transferHub.getRoom(code)
	if room == nil {
		log.Printf("transfer: receiver join failed (no room) code=%s", code)
		wsWriteJSON(conn, ctx, transferMessage{Type: "error", Data: jsonRaw("invalid or expired code")})
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
	log.Printf("transfer: receiver joined code=%s", code)

	// Notify receiver that pairing succeeded
	wsWriteJSON(conn, ctx, transferMessage{Type: "paired"})

	// The receiver sends no application messages, but we MUST keep reading from
	// the connection: the websocket library only processes control frames
	// (ping/pong/close) while a read is in flight, so without this the closing
	// handshake never completes — surfacing in the browser as "Close received
	// after close" and a dropped connection. Draining also lets us notice when
	// the receiver disconnects.
	recvGone := make(chan struct{})
	go func() {
		defer close(recvGone)
		for {
			if _, _, err := conn.Read(ctx); err != nil {
				return
			}
		}
	}()

	// Wait for the sender to finish, the room to tear down, or the receiver to drop.
	select {
	case <-ctx.Done():
	case <-room.done:
	case <-recvGone:
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
