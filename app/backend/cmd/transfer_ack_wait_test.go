package cmd

import (
	"os"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"
)

// The server must hold the room past the sender's own ack wait, or a slow
// receiver shows up on the sender as a dropped connection.
func TestTransferAckWaitOutlastsTheSender(t *testing.T) {
	src, err := os.ReadFile("../../frontend/lib/transfer-socket.ts")
	if err != nil {
		t.Skipf("frontend source not present: %v", err)
	}
	m := regexp.MustCompile(`TRANSFER_ACK_WAIT_MS = ([0-9_]+);`).FindSubmatch(src)
	if m == nil {
		t.Fatal("TRANSFER_ACK_WAIT_MS not found")
	}
	ms, err := strconv.Atoi(strings.ReplaceAll(string(m[1]), "_", ""))
	if err != nil {
		t.Fatal(err)
	}
	if sender := time.Duration(ms) * time.Millisecond; transferAckWait <= sender {
		t.Fatalf("transferAckWait %v must outlast the sender's %v", transferAckWait, sender)
	}
}
