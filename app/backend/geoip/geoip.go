// Package geoip places an IP address on the map using a local DB-IP Lite
// database (https://db-ip.com, CC BY 4.0). The lookup never leaves the
// process: no address is sent to a third party.
package geoip

import (
	"fmt"
	"net/netip"
	"strings"

	"github.com/oschwald/maxminddb-golang/v2"
)

// Place is where an address sits. Every field may be empty.
type Place struct {
	Country string
	Region  string
	City    string
}

// DB is an open location database. A nil *DB is valid and finds nothing, so
// callers never have to check whether one was configured.
type DB struct {
	reader *maxminddb.Reader
}

type record struct {
	Country struct {
		ISOCode string `maxminddb:"iso_code"`
	} `maxminddb:"country"`
	Subdivisions []struct {
		Names map[string]string `maxminddb:"names"`
	} `maxminddb:"subdivisions"`
	City struct {
		Names map[string]string `maxminddb:"names"`
	} `maxminddb:"city"`
}

// Open memory-maps the database at path.
func Open(path string) (*DB, error) {
	r, err := maxminddb.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open geoip database: %w", err)
	}
	return &DB{reader: r}, nil
}

// Close releases the database.
func (db *DB) Close() error {
	if db == nil {
		return nil
	}
	return db.reader.Close()
}

// Lookup returns where ip is. Private, loopback and unparseable addresses,
// and any lookup failure, give an empty Place.
func (db *DB) Lookup(ip string) Place {
	if db == nil {
		return Place{}
	}
	addr, err := netip.ParseAddr(strings.TrimSpace(ip))
	if err != nil || !addr.IsGlobalUnicast() || addr.IsPrivate() {
		return Place{}
	}
	var rec record
	if err := db.reader.Lookup(addr.Unmap()).Decode(&rec); err != nil {
		return Place{}
	}
	p := Place{Country: strings.ToUpper(rec.Country.ISOCode), City: rec.City.Names["en"]}
	if len(rec.Subdivisions) > 0 {
		p.Region = rec.Subdivisions[0].Names["en"]
	}
	return p
}
