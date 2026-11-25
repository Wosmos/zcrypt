package cmd

import (
	"github.com/zcrypt/zcrypt/pipeline"
)

// userEvent is a user-facing event. Data holds plain ids and counts only: Space
// and file names are sealed (enc1:), so the client decrypts the names it can.
// URL is the in-app route a notification opens.
type userEvent struct {
	Type string
	Data map[string]string
	URL  string
}

// notifyUser delivers ev to the user on both channels: a live SSE event named
// ev.Type to their open streams (web, desktop, Android) and a web push for
// browsers that are closed. Every user-facing event goes through here so no
// event can reach only one channel.
func (s *Server) notifyUser(userID string, ev userEvent) {
	s.signalUser(userID, ev)
	s.deliverPush(userID, pushMessage{Type: ev.Type, Data: ev.Data, URL: ev.URL})
}

// signalUser is the SSE half only, for state-sync signals that are not
// notifications (a member list changed, a key hand-off is waiting). Anything
// the user should be told about uses notifyUser.
func (s *Server) signalUser(userID string, ev userEvent) {
	s.progress.EmitToUser(userID, pipeline.SSEEvent{Type: ev.Type, Payload: eventPayload(ev)})
}

func eventPayload(ev userEvent) map[string]interface{} {
	data := ev.Data
	if data == nil {
		data = map[string]string{}
	}
	return map[string]interface{}{"type": ev.Type, "data": data, "url": ev.URL}
}

func (s *Server) deliverPush(userID string, msg pushMessage) {
	if s.pushSink != nil {
		s.pushSink(userID, msg)
		return
	}
	s.pushToUser(userID, msg)
}
