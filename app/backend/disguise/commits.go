package disguise

import "math/rand"

var commitMessages = []string{
	"chore: update cache artifacts",
	"refactor: optimize build output",
	"fix: update stale references",
	"chore: rebuild generated assets",
	"fix: correct module paths",
	"chore: sync dependency cache",
	"refactor: clean up build scripts",
	"chore: update artifact checksums",
	"fix: resolve path conflicts",
	"chore: regenerate output files",
	"refactor: simplify module structure",
	"chore: bump artifact version",
	"fix: patch output encoding",
	"chore: refresh build cache",
	"refactor: normalize file structure",
}

// CommitMessage returns a random conventional-commit-style message.
func CommitMessage() string {
	return commitMessages[rand.Intn(len(commitMessages))]
}
