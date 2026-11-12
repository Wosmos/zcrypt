//! Backend (control-plane) HTTP client, port of `sidecar/api/client.go`, with
//! the two known sidecar gaps fixed: the refresh token is actually threaded
//! through (auto-refresh on 401 works), and retries use real backoff.

pub mod backup;
pub mod client;
pub mod download;
pub mod keys;
pub mod session;
pub mod types;
pub mod upload;

pub use client::{client_marker, set_app_version, ApiError, Client, TokenState, CLIENT_HEADER};
