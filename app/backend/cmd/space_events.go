package cmd

import (
	"context"
	"strconv"
	"sync"
	"time"
)

// Space events. Data carries ids and plain counts only; Space and file names
// are sealed on the device, so clients look the name up by space_id.
//
//	inviteReceived       invitee            a member's key grant is in place
//	invitePending        invitee            invited before they unlocked their
//	                                        vault; carries the inviter's username
//	                                        only (the Space is not visible yet)
//	memberJoined         owner + admins     someone was added to a Space
//	memberLeft           owner + admins     a member left
//	memberRemoved        the removed user   an owner/admin removed them
//	roleChanged          the member         their role changed
//	spaceDeleted         former members     the owner deleted the Space
//	filesAdded           other members      files were shared in (batched)
//	spaceMembersChanged  all members        SSE only: refetch the member list
//	spaceKeyNeeded       owner + admins     SSE only: a pending invitee can now
//	                                        receive the Space key
const spaceURL = "/spaces"

const filesAddedWindow = 10 * time.Second

func spaceEvent(typ, spaceID string, extra map[string]string) userEvent {
	data := map[string]string{"space_id": spaceID}
	for k, v := range extra {
		data[k] = v
	}
	return userEvent{Type: typ, Data: data, URL: spaceURL}
}

func (s *Server) usernameOf(ctx context.Context, userID string) string {
	if u, err := s.db.GetUserByID(ctx, userID); err == nil && u != nil {
		return u.Username
	}
	return ""
}

func without(ids []string, skip ...string) []string {
	out := make([]string, 0, len(ids))
outer:
	for _, id := range ids {
		for _, k := range skip {
			if id == k {
				continue outer
			}
		}
		out = append(out, id)
	}
	return out
}

func (s *Server) signalMembersChanged(ids []string, spaceID string) {
	for _, id := range ids {
		s.signalUser(id, spaceEvent("spaceMembersChanged", spaceID, nil))
	}
}

// spaceMemberAdded tells the Space's owner and admins someone joined and every
// other member to refetch the list. actorID is the inviter, who already knows.
func (s *Server) spaceMemberAdded(ctx context.Context, spaceID, memberID, role, actorID string) {
	members, admins, err := s.db.SharedVaultAudience(ctx, spaceID)
	if err != nil {
		return
	}
	extra := map[string]string{"user_id": memberID, "username": s.usernameOf(ctx, memberID), "role": role}
	for _, id := range without(admins, actorID, memberID) {
		s.notifyUser(id, spaceEvent("memberJoined", spaceID, extra))
	}
	s.signalMembersChanged(without(members, memberID), spaceID)
}

func (s *Server) spaceMemberGone(ctx context.Context, spaceID, memberID string, left, wasActive bool) {
	members, admins, err := s.db.SharedVaultAudience(ctx, spaceID)
	if err != nil {
		return
	}
	if left {
		extra := map[string]string{"user_id": memberID, "username": s.usernameOf(ctx, memberID)}
		for _, id := range without(admins, memberID) {
			s.notifyUser(id, spaceEvent("memberLeft", spaceID, extra))
		}
	} else if wasActive {
		s.notifyUser(memberID, spaceEvent("memberRemoved", spaceID, nil))
	}
	s.signalMembersChanged(without(members, memberID), spaceID)
}

func (s *Server) spaceRoleChanged(ctx context.Context, spaceID, memberID, role string) {
	members, _, err := s.db.SharedVaultAudience(ctx, spaceID)
	if err != nil {
		return
	}
	for _, id := range members {
		if id == memberID {
			s.notifyUser(id, spaceEvent("roleChanged", spaceID, map[string]string{"role": role}))
		} else {
			s.signalUser(id, spaceEvent("spaceMembersChanged", spaceID, nil))
		}
	}
}

func (s *Server) spaceDeleted(spaceID, actorID string, members []string) {
	for _, id := range without(members, actorID) {
		s.notifyUser(id, spaceEvent("spaceDeleted", spaceID, nil))
	}
}

// filesAddedBatcher folds a burst of adds by one person to one Space into a
// single filesAdded event, sent once the burst has been quiet for the window.
type filesAddedBatcher struct {
	mu      sync.Mutex
	window  time.Duration
	pending map[string]*filesAddedBurst
	// flush delivers a finished burst; nil means Server.flushFilesAdded.
	flush func(spaceID, actorID string, count int)
}

type filesAddedBurst struct {
	count int
	timer *time.Timer
}

func newFilesAddedBatcher(window time.Duration) *filesAddedBatcher {
	return &filesAddedBatcher{window: window, pending: make(map[string]*filesAddedBurst)}
}

func (s *Server) spaceFilesAdded(spaceID, actorID string, count int) {
	if count <= 0 || s.filesAdded == nil {
		return
	}
	b := s.filesAdded
	key := spaceID + "|" + actorID
	b.mu.Lock()
	defer b.mu.Unlock()
	burst := b.pending[key]
	if burst == nil {
		burst = &filesAddedBurst{}
		b.pending[key] = burst
	} else {
		burst.timer.Stop()
	}
	burst.count += count
	burst.timer = time.AfterFunc(b.window, func() {
		b.mu.Lock()
		if b.pending[key] != burst {
			b.mu.Unlock()
			return
		}
		total := burst.count
		delete(b.pending, key)
		b.mu.Unlock()
		if b.flush != nil {
			b.flush(spaceID, actorID, total)
			return
		}
		s.flushFilesAdded(spaceID, actorID, total)
	})
}

func (s *Server) flushFilesAdded(spaceID, actorID string, count int) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	members, _, err := s.db.SharedVaultAudience(ctx, spaceID)
	if err != nil {
		return
	}
	extra := map[string]string{"user_id": actorID, "username": s.usernameOf(ctx, actorID), "count": strconv.Itoa(count)}
	for _, id := range without(members, actorID) {
		s.notifyUser(id, spaceEvent("filesAdded", spaceID, extra))
	}
}
