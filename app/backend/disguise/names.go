package disguise

import (
	"fmt"
	"math/rand"
)

var adjectives = []string{
	"utils", "config", "build", "core", "base", "common", "shared",
	"internal", "simple", "fast", "tiny", "mini", "micro", "basic",
	"clean", "safe", "smart", "auto", "quick", "lean",
}

var nouns = []string{
	"tools", "helpers", "cache", "loader", "parser", "runner",
	"worker", "bridge", "engine", "manager", "handler", "service",
	"module", "plugin", "adapter", "wrapper", "logger", "client",
	"proxy", "store",
}

// RepoName generates a plausible-looking dev project name.
func RepoName(index int) string {
	adj := adjectives[rand.Intn(len(adjectives))]
	noun := nouns[rand.Intn(len(nouns))]
	return fmt.Sprintf("%s-%s-v%d", adj, noun, index)
}
