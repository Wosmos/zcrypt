package cmd

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

func TestWaitBackgroundWaitsForWork(t *testing.T) {
	s := &Server{}
	var done atomic.Bool
	s.goBackground(func() {
		time.Sleep(50 * time.Millisecond)
		done.Store(true)
	})
	s.WaitBackground(context.Background())
	if !done.Load() {
		t.Fatal("WaitBackground returned before the background work finished")
	}
}

func TestWaitBackgroundHonoursDeadline(t *testing.T) {
	s := &Server{}
	release := make(chan struct{})
	defer close(release)
	s.goBackground(func() { <-release })
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	start := time.Now()
	s.WaitBackground(ctx)
	if time.Since(start) > time.Second {
		t.Fatal("WaitBackground ignored its deadline")
	}
}
