//! Backend (control-plane) HTTP client — port of `sidecar/api/client.go`, with
//! the two known sidecar gaps fixed: the refresh token is actually threaded
//! through (auto-refresh on 401 works), and retries use real backoff.

pub mod client;
pub mod download;
pub mod types;
pub mod upload;

pub use client::{ApiError, Client, TokenState};
