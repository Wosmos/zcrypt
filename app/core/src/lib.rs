//! zcrypt-core — the shared client engine.
//!
//! One crate powering the desktop (Tauri) and mobile shells: zero-knowledge
//! crypto, the chunk pipeline, the local SQLite ledger, backend API client,
//! and direct-to-platform storage adapters.
//!
//! The crypto module is NORMATIVE-conformant: it must pass the shared vectors
//! in `app/backend/crypto/testvectors/vectors.json` (see docs/CRYPTO_FORMAT.md).
//! Never change crypto behavior here without regenerating those vectors and
//! updating the TS + Go implementations in the same change.

pub mod adapters;
pub mod api;
pub mod compression;
pub mod crypto;
pub mod disguise;
pub mod engines;
pub mod localdb;
pub mod placement;
pub mod profiles;
pub mod reppool;
pub mod types;
