package pipeline

import "runtime"

// Profile defines performance tuning parameters.
type Profile struct {
	Name                string
	Workers             int
	ChunkSize           int
	ZstdLevel           int
	ConcurrentUploads   int
	ConcurrentDownloads int
}

// Profiles contains all available performance profiles.
var Profiles = map[string]Profile{
	"light": {
		Name:                "light",
		Workers:             2,
		ChunkSize:           4 << 20, // 4 MB
		ZstdLevel:           1,
		ConcurrentUploads:   1,
		ConcurrentDownloads: 2,
	},
	"normal": {
		Name:                "normal",
		Workers:             4,
		ChunkSize:           10 << 20, // 10 MB
		ZstdLevel:           2,
		ConcurrentUploads:   2,
		ConcurrentDownloads: 3,
	},
	"intense": {
		Name:                "intense",
		Workers:             8,
		ChunkSize:           16 << 20, // 16 MB
		ZstdLevel:           3,
		ConcurrentUploads:   4,
		ConcurrentDownloads: 4,
	},
	"ludicrous": {
		Name:                "ludicrous",
		Workers:             0,        // resolved at runtime
		ChunkSize:           32 << 20, // 32 MB
		ZstdLevel:           3,
		ConcurrentUploads:   8,
		ConcurrentDownloads: 8,
	},
}

// GetProfile returns a profile by name, resolving dynamic values.
func GetProfile(name string) Profile {
	p, ok := Profiles[name]
	if !ok {
		p = Profiles["normal"]
	}
	if p.Workers == 0 {
		p.Workers = runtime.NumCPU()
		if p.Workers < 2 {
			p.Workers = 2
		}
	}
	return p
}

// ProfileNames returns all available profile names in order.
func ProfileNames() []string {
	return []string{"light", "normal", "intense", "ludicrous"}
}
