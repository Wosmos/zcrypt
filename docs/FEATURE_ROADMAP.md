# zcrypt — Feature Roadmap & Ideas

> Brainstormed March 18, 2026. Prioritize based on user demand and engineering effort.

---

## Phase 1: Viral Growth Features (High impact, builds top-of-funnel)

### zcrypt Send (WeTransfer killer)
- `zcrypt.cloud/send` — drag drop file, get encrypted share link
- No login required for sender or receiver
- Client-side encryption, key in URL fragment (#key=...) — server never sees plaintext
- Limits: 50 MB / 24h expiry for anonymous, higher for accounts
- Burn-after-read option
- Every share link = free brand exposure

### zcrypt Pad (Encrypted text sharing)
- `zcrypt.cloud/pad` — type/paste text, get encrypted link
- No login required
- Options: expiry (1h/24h/7d), burn-after-read, password protect
- Private mode: syncs across logged-in devices via WebSocket
- Like blank.new but encrypted

### QR Share
- Sender shows QR code on screen
- Receiver scans with phone camera, downloads immediately
- Zero friction, zero accounts needed

---

## Phase 2: Device Bridge (Differentiator — nobody else does this)

### LAN File Transfer (Encrypted AirDrop)
- Peer-to-peer between devices on same WiFi
- Auto-discover via mDNS/Bonjour
- Simplified pipeline: File → Encrypt (stream) → TCP → Decrypt (stream)
- No cloud round-trip, no storage quota used
- Adaptive speed:
  - Fast mode (>50 Mbps): no compression, large buffers, parallel TCP streams
  - Balanced (1-50 Mbps): optional compression, medium buffers
  - Slow mode (<1 Mbps): compress everything, tiny chunks, aggressive resume
- Resumable transfers — connection drops at 80%, resume from 80%
- Auto bandwidth detection on connect (100KB test packet)
- Connection resilience: auto-retry on WiFi drops, resume on reconnect
- TUI support: `zcrypt send file.pdf --to laptop`

### Clipboard Sync
- Copy on PC, paste on laptop — end-to-end encrypted
- Real-time via WebSocket between logged-in devices
- Text, images, links

### Selective Folder Sync
- Mark folders to stay synced between devices
- LAN when both online, cloud fallback when not
- Like Syncthing but with zero-knowledge encryption

---

## Phase 3: Privacy Power Features (Differentiator for privacy audience)

### Plausible Deniability Mode
- Two passphrases: real one opens vault, decoy opens fake vault
- For journalists, activists, border crossings
- Inspired by VeraCrypt hidden volumes

### Dead Man's Switch
- Set trusted contact + timeout (e.g., 90 days no login)
- If timeout expires, trusted contact gets access to vault or specific folders
- Huge for estate planning, journalists, whistleblowers

### Expiring Vault
- Temporary vault that auto-destructs after set date
- Crypto keys deleted, data unrecoverable
- For projects, legal cases, events

---

## Phase 4: Productivity Features

### Encrypted Photo Gallery
- Auto-organize by date, like Google Photos but encrypted
- On-device ML for search ("find beach photos") — runs in browser, not server
- Thumbnail generation client-side

### Vault Snapshots (Time Travel)
- View vault at any point in time
- Roll back accidental deletes or changes
- Leverage git history already stored under the hood

### Secure Notes
- Encrypted markdown notes alongside files
- Searchable, taggable, synced across devices
- Like Obsidian inside your vault

### Shared Vaults (Team)
- Shared encrypted folder between 2+ people
- Per-member key wrapping (vault key encrypted per member)
- For teams, couples, families

### File Integrity Monitor
- Notification if any file changes unexpectedly
- Stores hashes, compares on sync
- For legal docs, contracts, evidence

### Offline Vault
- Pin files/folders for offline access
- Encrypted local cache, decrypted on demand
- Syncs when back online

---

## No-Login Tier Limits

| Feature | Anonymous | Free account | Paid |
|---------|-----------|-------------|------|
| File send max size | 50 MB | 500 MB | 5 GB |
| File send expiry | 24 hours | 7 days | 30 days / never |
| Uploads per day | 5 | 50 | Unlimited |
| Text pad expiry | 1 hour | 7 days | 30 days / never |
| Password protect | No | Yes | Yes |
| Burn after read | Yes | Yes | Yes |
| Custom expiry | No | Yes | Yes |
| LAN transfer | Yes (with app) | Yes | Yes |
| Clipboard sync | No | Yes | Yes |

---

## Competitive Positioning

| Feature | pCloud | Tresorit | Proton Drive | **zcrypt** |
|---------|--------|----------|-------------|-----------|
| LAN transfer | No | No | No | Yes |
| Text pad | No | No | No | Yes |
| No-login sharing | No | No | No | Yes |
| Dead man's switch | No | No | No | Yes |
| BYOB storage | No | No | No | Yes |
| Time travel | No | No | No | Yes (git) |
| TUI app | No | No | No | Yes |
| Plausible deniability | No | No | No | Yes |
| Burn after read | No | No | No | Yes |
| QR share | No | No | No | Yes |

**Positioning: zcrypt is not just encrypted storage — it's a privacy toolkit.**

---

*This is a living document. Update as features ship or priorities change.*
