# zcrypt Rust/Tauri Roadmap

## Done (committed, this batch)
- Desktop download → core (3.4GB freeze fix)
- Cloudflare DNS resolver + meta retry + per-chunk direct→relay fallback
- Android crash fix (deep_link cfg gate) + Tools icon + VPN-hint error

## Migrate to core (moves bytes / heavy crypto)
1. `decrypt_to_memory` cmd → thumbnails + preview + viewer (biggest win)
2. Bulk download
3. Delete / bulk delete / empty trash (wire existing delete.rs)
4. Upload byos→relay fallback (parity with download)
5. Shared-space download (+ space-key)

## Performance
6. Multi-core crypto (rayon) + pipelined streaming + warm CEK/decrypt caches

## Security
7. SQLCipher on local ledger, passphrase-derived key (encrypts filenames + chunk map)
8. Zeroize keys/plaintext + auto-lock on inactivity + never persist raw keys
9. Sign + notarize + hardened runtime + least-privilege Tauri capabilities

## Native
10. Keychain + biometric, background transfers, folder-watch backup, tray

## Android
11. Rebuild APK (CI=push or local) + regen icon mipmaps + on-device test

## Direct Transfer — make /transfer true P2P (bytes off server)
Today `/transfer` (Send File + Text Pad, live/both-present) relays ALL bytes
through the server over WebSocket (`/api/transfer/ws`) — E2E encrypted but pure
egress. Upgrade to **WebRTC data channels**:
- Reuse the existing WS as the **signaling channel only** (SDP + ICE, a few KB).
- Bytes go **peer-to-peer directly** → ~0 server egress in the common case.
- **Fallback = the existing WS relay** when NAT blocks direct (symmetric NAT
  ~10–20%). No new TURN infra needed for v1 — you already have the relay.
- E2E stays: WebRTC DTLS + your AES-256-GCM app layer. Server sees nothing.
- Cross-env: WebRTC works in browser AND the Tauri webview (web↔web/native↔web).
- Rust: reuse webview WebRTC v1; core does chunk+encrypt; `webrtc-rs` later for
  a pure-native/background path.
- SCOPE: only `/transfer` (live, both online) goes P2P. **Send File + Text Pad
  link-shares (`/send`, `/pad`) are async (recipient offline) → MUST stay
  server-relayed**, same as vault sync.

## Do NOT migrate (leave on API)
- move / rename / folders / search / quota / analytics — pure metadata
- vault cross-device sync — needs the server as the encrypted-metadata coordinator