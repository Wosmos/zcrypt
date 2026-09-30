package cmd

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	shareTicketTTL    = 6 * time.Hour
	shareTicketHeader = "X-Download-Ticket"
)

type shareTicket struct {
	Nonce string
}

func (s *Server) shareTicketMAC(payload string) []byte {
	mac := hmac.New(sha256.New, []byte(s.cfg.JWTSecret))
	mac.Write([]byte("share-download-ticket|"))
	mac.Write([]byte(payload))
	return mac.Sum(nil)
}

// issueShareTicket signs a short-lived ticket bound to one link (and, for a
// folder link, one file). Chunk fetches carrying it keep working after the
// link's download cap is reached, and completing it counts exactly one download.
func (s *Server) issueShareTicket(linkID, fileID string) string {
	nb := make([]byte, 16)
	_, _ = rand.Read(nb)
	payload := strings.Join([]string{
		linkID, fileID, hex.EncodeToString(nb), strconv.FormatInt(time.Now().Add(shareTicketTTL).Unix(), 10),
	}, "|")
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." +
		base64.RawURLEncoding.EncodeToString(s.shareTicketMAC(payload))
}

func (s *Server) parseShareTicket(raw, linkID, fileID string) (shareTicket, bool) {
	parts := strings.Split(raw, ".")
	if len(parts) != 2 {
		return shareTicket{}, false
	}
	pb, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return shareTicket{}, false
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || !hmac.Equal(sig, s.shareTicketMAC(string(pb))) {
		return shareTicket{}, false
	}
	f := strings.Split(string(pb), "|")
	if len(f) != 4 || f[0] != linkID || f[1] != fileID {
		return shareTicket{}, false
	}
	exp, err := strconv.ParseInt(f[3], 10, 64)
	if err != nil || time.Now().Unix() > exp {
		return shareTicket{}, false
	}
	return shareTicket{Nonce: f[2]}, true
}

// shareTicketLive reports whether the request carries a valid, unredeemed
// ticket for this link and file.
func (s *Server) shareTicketLive(r *http.Request, linkID, fileID string) bool {
	raw := r.Header.Get(shareTicketHeader)
	if raw == "" {
		return false
	}
	t, ok := s.parseShareTicket(raw, linkID, fileID)
	if !ok {
		return false
	}
	used, err := s.db.ShareDownloadTicketUsed(r.Context(), t.Nonce)
	return err == nil && !used
}

// linkOpenForChunk is validateShare/validateFolderShare with one relaxation: a
// live ticket lets an in-flight download finish even once the cap is reached.
// Revocation and expiry always win.
func linkOpenForChunk(revoked bool, expiresAt *time.Time, capped, ticketLive bool) bool {
	if revoked || (expiresAt != nil && time.Now().After(*expiresAt)) {
		return false
	}
	return !capped || ticketLive
}

// completeShareDownload counts one finished download for the ticket in the body.
func (s *Server) completeShareDownload(w http.ResponseWriter, r *http.Request, linkID, fileID string, count func(nonce string) (bool, error)) {
	var req struct {
		Ticket string `json:"ticket"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	t, ok := s.parseShareTicket(req.Ticket, linkID, fileID)
	if !ok {
		http.Error(w, `{"error":"invalid or expired ticket"}`, http.StatusForbidden)
		return
	}
	counted, err := count(t.Nonce)
	if err != nil {
		http.Error(w, `{"error":"failed to record download"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = fmt.Fprintf(w, `{"success":true,"counted":%t}`, counted)
}

// linkChunkCommit returns the step that runs once a chunk's bytes are in hand and
// before they are sent. It counts the download on the server: under a live ticket
// when every chunk of the file has been served, for a ticketless client when the
// last chunk is. A false result means the cap was reached and the chunk is withheld.
func (s *Server) linkChunkCommit(r *http.Request, linkID, fileID string, idx, count int,
	complete func(nonce string) (bool, error)) func() bool {
	nonce := ""
	if s.shareTicketLive(r, linkID, fileID) {
		t, _ := s.parseShareTicket(r.Header.Get(shareTicketHeader), linkID, fileID)
		nonce = t.Nonce
	}
	return func() bool {
		if nonce == "" {
			if idx != count-1 {
				return true
			}
			nb := make([]byte, 16)
			_, _ = rand.Read(nb)
			counted, err := complete(hex.EncodeToString(nb))
			return err == nil && counted
		}
		served, err := s.db.RecordShareTicketChunk(r.Context(), nonce, idx)
		if err != nil {
			return false
		}
		if served < count {
			return true
		}
		counted, err := complete(nonce)
		return err == nil && counted
	}
}
