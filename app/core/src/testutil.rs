//! A tiny one-request-per-connection HTTP server for transport tests.

use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[allow(dead_code)]
pub struct Req {
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

pub enum Reply {
    Full {
        status: u16,
        headers: Vec<(String, String)>,
        body: Vec<u8>,
    },
    Trickle {
        body: Vec<u8>,
        piece: usize,
        gap: Duration,
    },
    StallBody {
        declared: usize,
        sent: Vec<u8>,
    },
    Hang,
}

impl Reply {
    pub fn status(status: u16, body: &str) -> Self {
        Reply::Full {
            status,
            headers: vec![],
            body: body.as_bytes().to_vec(),
        }
    }

    pub fn with_header(status: u16, name: &str, value: &str, body: &str) -> Self {
        Reply::Full {
            status,
            headers: vec![(name.into(), value.into())],
            body: body.as_bytes().to_vec(),
        }
    }
}

pub type Hits = Arc<AtomicUsize>;

pub async fn serve<F>(handler: F) -> (String, Hits)
where
    F: Fn(usize, Req) -> Reply + Send + Sync + 'static,
{
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let hits: Hits = Arc::new(AtomicUsize::new(0));
    let counter = hits.clone();
    let handler = Arc::new(handler);
    tokio::spawn(async move {
        while let Ok((sock, _)) = listener.accept().await {
            let n = counter.fetch_add(1, Ordering::SeqCst);
            let handler = handler.clone();
            tokio::spawn(async move {
                let _ = handle(sock, n, handler).await;
            });
        }
    });
    (base, hits)
}

async fn handle<F>(
    mut sock: tokio::net::TcpStream,
    n: usize,
    handler: Arc<F>,
) -> std::io::Result<()>
where
    F: Fn(usize, Req) -> Reply,
{
    let mut buf = Vec::new();
    let mut chunk = [0u8; 8192];
    let head_end = loop {
        let k = sock.read(&mut chunk).await?;
        if k == 0 {
            return Ok(());
        }
        buf.extend_from_slice(&chunk[..k]);
        if let Some(p) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            break p + 4;
        }
    };
    let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
    let mut lines = head.split("\r\n");
    let mut first = lines.next().unwrap_or_default().split(' ');
    let method = first.next().unwrap_or_default().to_string();
    let path = first.next().unwrap_or_default().to_string();
    let headers: HashMap<String, String> = lines
        .filter_map(|l| l.split_once(':'))
        .map(|(k, v)| (k.trim().to_ascii_lowercase(), v.trim().to_string()))
        .collect();
    let want: usize = headers
        .get("content-length")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let mut body = buf[head_end..].to_vec();
    while body.len() < want {
        let k = sock.read(&mut chunk).await?;
        if k == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..k]);
    }
    let reply = handler(
        n,
        Req {
            method,
            path,
            headers,
            body,
        },
    );
    match reply {
        Reply::Full {
            status,
            headers,
            body,
        } => {
            let mut out = format!(
                "HTTP/1.1 {status} X\r\ncontent-length: {}\r\nconnection: close\r\n",
                body.len()
            );
            for (k, v) in headers {
                out.push_str(&format!("{k}: {v}\r\n"));
            }
            out.push_str("\r\n");
            sock.write_all(out.as_bytes()).await?;
            sock.write_all(&body).await?;
        }
        Reply::Trickle { body, piece, gap } => {
            let head = format!(
                "HTTP/1.1 200 OK\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
                body.len()
            );
            sock.write_all(head.as_bytes()).await?;
            for p in body.chunks(piece) {
                tokio::time::sleep(gap).await;
                sock.write_all(p).await?;
                sock.flush().await?;
            }
        }
        Reply::StallBody { declared, sent } => {
            let head = format!(
                "HTTP/1.1 200 OK\r\ncontent-length: {declared}\r\nconnection: close\r\n\r\n"
            );
            sock.write_all(head.as_bytes()).await?;
            sock.write_all(&sent).await?;
            sock.flush().await?;
            tokio::time::sleep(Duration::from_secs(60)).await;
        }
        Reply::Hang => tokio::time::sleep(Duration::from_secs(60)).await,
    }
    Ok(())
}
