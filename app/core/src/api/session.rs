//! Background sessions: a device's backup holds its own sign-in, so it never
//! spends a refresh token the app's session still holds.

use serde::Deserialize;

use super::client::{ApiError, Client};

/// A fresh access + refresh pair.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct SessionPair {
    pub access_token: String,
    pub refresh_token: String,
}

impl Client {
    /// POST /api/auth/sessions/background: starts a second session for this
    /// device, for backups that run while the app is closed.
    pub async fn start_background_session(&self) -> Result<SessionPair, ApiError> {
        self.send_json(|http, base| {
            http.post(format!("{base}/api/auth/sessions/background"))
                .json(&serde_json::json!({}))
        })
        .await
    }

    /// POST /api/auth/logout with this client's refresh token: ends its session
    /// on the server.
    pub async fn sign_out(&self) -> Result<(), ApiError> {
        let (_, refresh) = self.tokens().await;
        let resp = self
            .send(|http, base| {
                http.post(format!("{base}/api/auth/logout"))
                    .json(&serde_json::json!({ "refresh_token": refresh }))
            })
            .await?;
        if resp.status().is_success() {
            Ok(())
        } else {
            Err(ApiError::Status {
                status: resp.status().as_u16(),
                body: String::new(),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    /// Answers one request with `status` and `body`, handing back what it got.
    async fn serve_once(status: &str, body: &str) -> (String, tokio::task::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let reply = format!(
            "HTTP/1.1 {status}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
            body.len()
        );
        let task = tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 8192];
            let mut got = Vec::new();
            loop {
                let n = sock.read(&mut buf).await.unwrap();
                got.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&got);
                if let Some(end) = text.find("\r\n\r\n") {
                    let len = text[..end]
                        .lines()
                        .find_map(|l| {
                            l.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .map(|v| v.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    if got.len() >= end + 4 + len {
                        break;
                    }
                }
                if n == 0 {
                    break;
                }
            }
            sock.write_all(reply.as_bytes()).await.unwrap();
            String::from_utf8_lossy(&got).to_string()
        });
        (base, task)
    }

    #[tokio::test]
    async fn starts_a_background_session_with_the_app_session() {
        let (base, req) = serve_once(
            "200 OK",
            r#"{"access_token":"bg-a","refresh_token":"bg-r"}"#,
        )
        .await;
        let client = Client::new(&base, "app-a", "app-r");
        let pair = client.start_background_session().await.unwrap();
        assert_eq!(
            pair,
            SessionPair {
                access_token: "bg-a".into(),
                refresh_token: "bg-r".into()
            }
        );
        let req = req.await.unwrap();
        assert!(req.starts_with("POST /api/auth/sessions/background "));
        assert!(req
            .to_ascii_lowercase()
            .contains("authorization: bearer app-a"));
        assert_eq!(client.tokens().await, ("app-a".into(), "app-r".into()));
    }

    #[tokio::test]
    async fn signs_out_with_its_own_refresh_token() {
        let (base, req) = serve_once("200 OK", r#"{"success":true}"#).await;
        Client::new(&base, "bg-a", "bg-r").sign_out().await.unwrap();
        let req = req.await.unwrap();
        assert!(req.starts_with("POST /api/auth/logout "));
        assert!(req.ends_with(r#"{"refresh_token":"bg-r"}"#));

        let (base, _req) = serve_once("500 Internal Server Error", "{}").await;
        assert!(Client::new(&base, "bg-a", "bg-r").sign_out().await.is_err());
    }
}
