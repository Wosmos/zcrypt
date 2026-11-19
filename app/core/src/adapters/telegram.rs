//! Telegram platform adapter, port of `app/backend/adapters/telegram.go`.
//!
//! Files are sent as documents to the configured chat/channel via the Bot API.
//! Bot API limits: 50MB upload, but only 20MB download via `getFile`, so
//! chunks larger than 19MB are transparently split into sub-parts.
//!
//! `remote_path` format (the stored locator, identical to the Go backend):
//! `"msgId:fileId"` for a single part, or
//! `"msgId:fileId,msgId:fileId,..."` for multi-part chunks, in part order.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use bytes::Bytes;
use serde::de::DeserializeOwned;
use serde::Deserialize;

use crate::adapters::{AdapterError, PlatformAdapter};
use crate::disguise;
use crate::transport::{upload_client, Idle, IDLE_TIMEOUT};
use crate::types::{Chunk, ChunkRef, Platform};

const API_BASE: &str = "https://api.telegram.org";

/// Bot API limits: 50MB upload, 20MB download via getFile.
/// Use 19MB sub-chunks to stay safely under the download limit.
const MAX_PART_SIZE: usize = 19 * 1024 * 1024;

const PLATFORM: &str = Platform::Telegram.as_str();

const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
const CONTROL_TIMEOUT: Duration = crate::transport::CONTROL_TIMEOUT;
/// Short on purpose, and downloads only: when api.telegram.org is filtered on
/// this network the caller falls back to the server relay, and every second
/// spent here is a second the user stares at a spinner. Uploads keep the long
/// connect timeout so slow mobile networks still get through.
const DOWNLOAD_CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const GET_FILE_TIMEOUT: Duration = Duration::from_secs(10);
const FILE_PATH_TTL: Duration = Duration::from_secs(50 * 60);
const FILE_PATH_CACHE_CAP: usize = 4096;

type FilePathCache = Mutex<HashMap<String, (String, u64, Instant)>>;

/// Telegram Bot API adapter. `account` is the chat id (`@channel_username` or
/// a numeric id): the chat IS the storage location; there are no repos.
pub struct Telegram {
    token: String,
    chat_id: String,
    api_base: String,
    client: reqwest::Client,
    up_client: reqwest::Client,
    dl_client: reqwest::Client,
    idle: Duration,
    file_paths: FilePathCache,
}

impl Telegram {
    pub fn new(token: &str, account: &str) -> Self {
        Self::with_endpoint(token, account, API_BASE, IDLE_TIMEOUT)
    }

    pub(crate) fn with_endpoint(
        token: &str,
        account: &str,
        api_base: &str,
        idle: Duration,
    ) -> Self {
        let pooled = |b: reqwest::ClientBuilder| {
            b.pool_idle_timeout(Duration::from_secs(90))
                .pool_max_idle_per_host(4)
                .build()
                .expect("build reqwest client")
        };
        Self {
            token: token.trim().to_string(),
            chat_id: account.trim().to_string(),
            api_base: api_base.to_string(),
            client: pooled(
                reqwest::Client::builder()
                    .connect_timeout(CONNECT_TIMEOUT)
                    .timeout(CONTROL_TIMEOUT),
            ),
            up_client: pooled(upload_client().connect_timeout(CONNECT_TIMEOUT)),
            dl_client: pooled(
                reqwest::Client::builder()
                    .connect_timeout(DOWNLOAD_CONNECT_TIMEOUT)
                    .read_timeout(idle),
            ),
            idle,
            file_paths: Mutex::new(HashMap::new()),
        }
    }

    fn base(&self) -> &str {
        if self.api_base == API_BASE && crate::reach::telegram_blocked_for_testing() {
            return "http://127.0.0.1:9";
        }
        &self.api_base
    }

    fn api_url(&self, method: &str) -> String {
        format!("{}/bot{}/{}", self.base(), self.token, method)
    }

    /// Uploads one document to the chat; returns `(message_id, file_id)`. Fails
    /// only when no bytes move for the idle limit.
    async fn send_document(
        &self,
        data: Bytes,
        filename: String,
    ) -> Result<(i64, String), AdapterError> {
        let idle = Idle::new(self.idle);
        idle.guard(async {
            let len = data.len() as u64;
            let form = reqwest::multipart::Form::new()
                .text("chat_id", self.chat_id.clone())
                // Suppress notifications to avoid spam.
                .text("disable_notification", "true")
                .part(
                    "document",
                    reqwest::multipart::Part::stream_with_length(idle.body(data), len)
                        .file_name(filename),
                );

            let resp = self
                .up_client
                .post(self.api_url("sendDocument"))
                .multipart(form)
                .send()
                .await?;
            let status = resp.status().as_u16();
            let body = resp.text().await?;

            let result: SendDocumentResult = parse_envelope("sendDocument", status, &body)?;
            Ok((result.message_id, result.document.file_id))
        })
        .await
    }

    /// Fetches a file by `file_id`: `getFile` → file_path → direct download
    /// from `https://api.telegram.org/file/bot<token>/<file_path>`.
    async fn download_file(&self, file_id: &str) -> Result<Vec<u8>, AdapterError> {
        let (file_path, _) = self.resolve_file_path(file_id).await?;
        let dl_url = format!("{}/file/bot{}/{}", self.base(), self.token, file_path);
        let res = async {
            let dl = self.dl_client.get(&dl_url).send().await?;
            let dl_status = dl.status().as_u16();
            if dl_status != 200 {
                let dl_body = dl.text().await.unwrap_or_default();
                return Err(AdapterError::Api {
                    platform: PLATFORM,
                    status: dl_status,
                    body: dl_body,
                });
            }
            Ok(dl.bytes().await?.to_vec())
        }
        .await;
        if res.is_err() {
            self.file_paths.lock().unwrap().remove(file_id);
        }
        res
    }

    /// `getFile` → (file_path, file_size), memoized: a file_path stays valid for
    /// at least an hour, so a repeat open skips one serial round trip per part.
    async fn resolve_file_path(&self, file_id: &str) -> Result<(String, u64), AdapterError> {
        if let Some((path, size, at)) = self.file_paths.lock().unwrap().get(file_id) {
            if at.elapsed() < FILE_PATH_TTL {
                return Ok((path.clone(), *size));
            }
        }
        let url = format!("{}?file_id={}", self.api_url("getFile"), file_id);
        let resp = self
            .dl_client
            .get(&url)
            .timeout(GET_FILE_TIMEOUT)
            .send()
            .await?;
        let status = resp.status().as_u16();
        let body = resp.text().await?;
        let result: GetFileResult = parse_envelope("getFile", status, &body)?;
        let mut paths = self.file_paths.lock().unwrap();
        if paths.len() >= FILE_PATH_CACHE_CAP {
            paths.clear();
        }
        paths.insert(
            file_id.to_string(),
            (result.file_path.clone(), result.file_size, Instant::now()),
        );
        Ok((result.file_path, result.file_size))
    }

    /// Deletes one message from the chat.
    async fn delete_message(&self, message_id: i64) -> Result<(), AdapterError> {
        let payload = serde_json::json!({
            "chat_id": self.chat_id,
            "message_id": message_id,
        });

        let resp = self
            .client
            .post(self.api_url("deleteMessage"))
            .json(&payload)
            .send()
            .await?;
        let status = resp.status().as_u16();
        let body = resp.text().await?;

        let _: bool = parse_envelope("deleteMessage", status, &body)?;
        Ok(())
    }
}

#[async_trait]
impl PlatformAdapter for Telegram {
    fn platform_name(&self) -> &'static str {
        PLATFORM
    }

    /// Telegram doesn't have repos: the chat_id IS the storage location.
    /// The pool manager still needs a unique name, so combine chat_id + name.
    async fn create_repo(&self, name: &str) -> Result<String, AdapterError> {
        Ok(format!("tg:{}/{}", self.chat_id, name))
    }

    async fn upload(&self, repo: &str, chunk: Chunk) -> Result<ChunkRef, AdapterError> {
        let Chunk { r#ref: mut r, data } = chunk;

        let remote_path = if r.remote_path.is_empty() {
            disguise::chunk_filename()
        } else {
            r.remote_path.clone()
        };

        let mut part_refs = Vec::new();
        let mut sent_ids: Vec<i64> = Vec::new();

        let sent: Result<(), AdapterError> = async {
            if data.len() <= MAX_PART_SIZE {
                // Single part: fits within the Telegram download limit.
                let (msg_id, file_id) = self
                    .send_document(data.clone(), remote_path.clone())
                    .await?;
                sent_ids.push(msg_id);
                part_refs.push(format!("{msg_id}:{file_id}"));
            } else {
                // Multi-part: split into 19MB sub-chunks named `<name>.p<idx>`.
                for (part_idx, (start, end)) in part_ranges(data.len()).into_iter().enumerate() {
                    let name = part_name(&remote_path, part_idx);
                    let (msg_id, file_id) = self
                        .send_document(data.slice(start..end), name)
                        .await
                        .map_err(|e| match e {
                            AdapterError::Other(msg) => {
                                AdapterError::Other(format!("upload chunk part {part_idx}: {msg}"))
                            }
                            other => other,
                        })?;
                    sent_ids.push(msg_id);
                    part_refs.push(format!("{msg_id}:{file_id}"));
                }
            }
            Ok(())
        }
        .await;

        // A later part failing would otherwise leave the earlier parts in the
        // user's chat for good: the caller retries the whole chunk.
        if let Err(e) = sent {
            for id in sent_ids {
                let _ = self.delete_message(id).await;
            }
            return Err(e);
        }

        r.platform = PLATFORM.to_string();
        r.repo = repo.to_string();
        r.remote_path = part_refs.join(",");
        Ok(r)
    }

    async fn download(&self, r#ref: &ChunkRef) -> Result<Vec<u8>, AdapterError> {
        let mut all_data = Vec::new();

        for (i, part) in r#ref.remote_path.split(',').enumerate() {
            let (_, file_id) = parse_part_ref(part)
                .map_err(|e| AdapterError::Other(format!("parse part ref {i}: {e}")))?;

            let data = self.download_file(file_id).await?;
            all_data.extend_from_slice(&data);
        }

        Ok(all_data)
    }

    /// Removes every message part of a chunk. Each part is attempted (a
    /// failure on one part doesn't skip the rest) and per-part errors are
    /// collected so the deletion worker retries instead of recording a false
    /// success. "message to delete not found" (already gone) and "message
    /// can't be deleted" (permanently undeletable) are treated as success:
    /// retrying can never improve on either.
    async fn delete(&self, r#ref: &ChunkRef) -> Result<(), AdapterError> {
        let mut errs: Vec<String> = Vec::new();

        for (i, part) in r#ref.remote_path.split(',').enumerate() {
            let msg_id = match parse_part_ref(part) {
                Ok((msg_id, _)) => msg_id,
                Err(e) => {
                    errs.push(format!("parse part ref {i}: {e}"));
                    continue;
                }
            };

            if let Err(err) = self.delete_message(msg_id).await {
                if is_delete_final(&err) {
                    continue;
                }
                errs.push(format!("delete message {msg_id}: {err}"));
            }
        }

        if errs.is_empty() {
            Ok(())
        } else {
            Err(AdapterError::Other(errs.join("; ")))
        }
    }

    /// Telegram doesn't expose storage usage per chat; the pipeline tracks
    /// this via the DB instead.
    async fn get_repo_size(&self, _repo: &str) -> Result<i64, AdapterError> {
        Ok(0)
    }

    /// The Bot API can't enumerate a chat's messages.
    async fn list_chunks(&self, _repo: &str) -> Result<Vec<ChunkRef>, AdapterError> {
        Err(AdapterError::NotFound(
            "telegram chats cannot be listed".into(),
        ))
    }
}

// --- Bot API response envelope ---

#[derive(Deserialize)]
struct ApiEnvelope<T> {
    #[serde(default)]
    ok: bool,
    result: Option<T>,
    #[serde(default)]
    description: String,
    parameters: Option<RateParams>,
}

#[derive(Deserialize)]
struct RateParams {
    #[serde(default)]
    retry_after: u64,
}

#[derive(Debug, Deserialize)]
struct SendDocumentResult {
    message_id: i64,
    #[serde(default)]
    document: DocumentInfo,
}

#[derive(Debug, Deserialize, Default)]
struct DocumentInfo {
    #[serde(default)]
    file_id: String,
}

#[derive(Debug, Deserialize)]
struct GetFileResult {
    #[serde(default)]
    file_path: String,
    #[serde(default)]
    file_size: u64,
}

/// Decodes a Bot API response. `ok:false` with `parameters.retry_after` (or an
/// HTTP 429) maps to `RateLimited`; any other `ok:false` maps to `Api` with
/// the Telegram `description` as the body.
fn parse_envelope<T: DeserializeOwned>(
    method: &str,
    status: u16,
    body: &str,
) -> Result<T, AdapterError> {
    let env: ApiEnvelope<T> = serde_json::from_str(body)
        .map_err(|e| AdapterError::Other(format!("decode {method}: {e}")))?;

    if !env.ok {
        let retry_after = env.parameters.map(|p| p.retry_after).unwrap_or(0);
        if status == 429 || retry_after > 0 {
            return Err(AdapterError::RateLimited {
                platform: PLATFORM,
                retry_after_secs: (retry_after > 0).then_some(retry_after),
            });
        }
        return Err(AdapterError::Api {
            platform: PLATFORM,
            status,
            body: env.description,
        });
    }

    env.result
        .ok_or_else(|| AdapterError::Other(format!("decode {method}: missing result")))
}

// --- pure helpers ---

/// Whether a deleteMessage failure is terminal: the message is already gone
/// or the Bot API will never allow deleting it.
fn is_delete_final(err: &AdapterError) -> bool {
    let msg = err.to_string().to_lowercase();
    msg.contains("message to delete not found") || msg.contains("message can't be deleted")
}

/// Byte ranges `(start, end)` for splitting an oversized chunk into
/// `MAX_PART_SIZE` sub-parts, mirroring the Go offset loop.
fn part_ranges(len: usize) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let mut offset = 0;
    while offset < len {
        ranges.push((offset, (offset + MAX_PART_SIZE).min(len)));
        offset += MAX_PART_SIZE;
    }
    ranges
}

/// Disguised filename for sub-part `idx` of a split chunk, e.g. `name.bin.p0`.
fn part_name(base: &str, idx: usize) -> String {
    format!("{base}.p{idx}")
}

/// Parses `"msgId:fileId"` into its components (split at the FIRST colon,
/// matching Go's `strings.SplitN(ref, ":", 2)`).
fn parse_part_ref(r#ref: &str) -> Result<(i64, &str), String> {
    let (msg, file_id) = r#ref
        .split_once(':')
        .ok_or_else(|| format!("invalid part ref: {:?}", r#ref))?;
    let msg_id: i64 = msg.parse().map_err(|e| format!("parse message id: {e}"))?;
    Ok((msg_id, file_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_part_ref_single() {
        let (msg_id, file_id) = parse_part_ref("12345:AgACAgQAAxkDAAIB").unwrap();
        assert_eq!(msg_id, 12345);
        assert_eq!(file_id, "AgACAgQAAxkDAAIB");
    }

    #[test]
    fn parse_part_ref_splits_at_first_colon_only() {
        // file_id keeps everything after the first colon, matching Go SplitN(_, ":", 2).
        let (msg_id, file_id) = parse_part_ref("7:abc:def").unwrap();
        assert_eq!(msg_id, 7);
        assert_eq!(file_id, "abc:def");
    }

    #[test]
    fn parse_part_ref_empty_file_id_is_accepted() {
        // Go accepts "123:" (fileID == ""); so do we.
        let (msg_id, file_id) = parse_part_ref("123:").unwrap();
        assert_eq!(msg_id, 123);
        assert_eq!(file_id, "");
    }

    #[test]
    fn parse_part_ref_rejects_missing_colon() {
        assert!(parse_part_ref("12345").is_err());
    }

    #[test]
    fn parse_part_ref_rejects_non_numeric_msg_id() {
        assert!(parse_part_ref("abc:file").is_err());
    }

    #[test]
    fn remote_path_round_trip_multi_part() {
        // Build the locator exactly as upload() does, then parse it back as
        // download()/delete() do.
        let parts = [(100i64, "AAA"), (101i64, "BBB"), (102i64, "CCC")];
        let joined = parts
            .iter()
            .map(|(m, f)| format!("{m}:{f}"))
            .collect::<Vec<_>>()
            .join(",");
        assert_eq!(joined, "100:AAA,101:BBB,102:CCC");

        let parsed: Vec<(i64, &str)> = joined
            .split(',')
            .map(|p| parse_part_ref(p).unwrap())
            .collect();
        assert_eq!(parsed, vec![(100, "AAA"), (101, "BBB"), (102, "CCC")]);
    }

    #[test]
    fn part_ranges_exact_limit_is_single_range() {
        // (upload() takes the single-part branch at <= MAX_PART_SIZE, but the
        // splitter itself must still be exact at the boundary.)
        assert_eq!(part_ranges(MAX_PART_SIZE), vec![(0, MAX_PART_SIZE)]);
    }

    #[test]
    fn part_ranges_one_byte_over_splits_in_two() {
        assert_eq!(
            part_ranges(MAX_PART_SIZE + 1),
            vec![(0, MAX_PART_SIZE), (MAX_PART_SIZE, MAX_PART_SIZE + 1)]
        );
    }

    #[test]
    fn part_ranges_cover_contiguously() {
        let len = 3 * MAX_PART_SIZE + 12345;
        let ranges = part_ranges(len);
        assert_eq!(ranges.len(), 4);
        assert_eq!(ranges[0].0, 0);
        assert_eq!(ranges[ranges.len() - 1].1, len);
        for w in ranges.windows(2) {
            assert_eq!(w[0].1, w[1].0, "ranges must be contiguous");
        }
        for (start, end) in &ranges {
            assert!(end - start <= MAX_PART_SIZE);
        }
    }

    #[test]
    fn part_ranges_empty_input_yields_nothing() {
        assert!(part_ranges(0).is_empty());
    }

    #[test]
    fn part_name_matches_go_format() {
        assert_eq!(
            part_name("8e3168bae666969f.bin", 0),
            "8e3168bae666969f.bin.p0"
        );
        assert_eq!(
            part_name("8e3168bae666969f.bin", 12),
            "8e3168bae666969f.bin.p12"
        );
    }

    #[test]
    fn is_delete_final_matches_terminal_descriptions() {
        let gone = AdapterError::Api {
            platform: PLATFORM,
            status: 400,
            body: "Bad Request: message to delete not found".into(),
        };
        let undeletable = AdapterError::Api {
            platform: PLATFORM,
            status: 400,
            body: "Bad Request: message can't be deleted".into(),
        };
        let other = AdapterError::Api {
            platform: PLATFORM,
            status: 400,
            body: "Bad Request: chat not found".into(),
        };
        assert!(is_delete_final(&gone));
        assert!(is_delete_final(&undeletable));
        assert!(!is_delete_final(&other));
    }

    #[test]
    fn transient_classification() {
        assert!(AdapterError::RateLimited {
            platform: PLATFORM,
            retry_after_secs: Some(5),
        }
        .is_transient());
        assert!(AdapterError::Api {
            platform: PLATFORM,
            status: 500,
            body: "internal".into(),
        }
        .is_transient());
        assert!(AdapterError::Api {
            platform: PLATFORM,
            status: 429,
            body: "too many requests".into(),
        }
        .is_transient());
        assert!(!AdapterError::Api {
            platform: PLATFORM,
            status: 400,
            body: "bad request".into(),
        }
        .is_transient());
        assert!(!AdapterError::Other("decode".into()).is_transient());
        assert!(!AdapterError::NotFound("x".into()).is_transient());
    }

    #[test]
    fn envelope_rate_limit_maps_to_rate_limited() {
        let body = r#"{"ok":false,"error_code":429,"description":"Too Many Requests: retry after 33","parameters":{"retry_after":33}}"#;
        let err = parse_envelope::<SendDocumentResult>("sendDocument", 429, body).unwrap_err();
        match err {
            AdapterError::RateLimited {
                platform,
                retry_after_secs,
            } => {
                assert_eq!(platform, PLATFORM);
                assert_eq!(retry_after_secs, Some(33));
            }
            other => panic!("expected RateLimited, got: {other}"),
        }
    }

    #[test]
    fn envelope_ok_false_maps_to_api_error_with_description() {
        let body = r#"{"ok":false,"error_code":400,"description":"Bad Request: chat not found"}"#;
        let err = parse_envelope::<GetFileResult>("getFile", 400, body).unwrap_err();
        match err {
            AdapterError::Api {
                platform,
                status,
                body,
            } => {
                assert_eq!(platform, PLATFORM);
                assert_eq!(status, 400);
                assert_eq!(body, "Bad Request: chat not found");
            }
            other => panic!("expected Api, got: {other}"),
        }
    }

    #[test]
    fn envelope_ok_true_returns_result() {
        let body = r#"{"ok":true,"result":{"message_id":42,"document":{"file_id":"XYZ"}}}"#;
        let res: SendDocumentResult = parse_envelope("sendDocument", 200, body).unwrap();
        assert_eq!(res.message_id, 42);
        assert_eq!(res.document.file_id, "XYZ");
    }
}

#[cfg(test)]
mod transfer_tests {
    use super::*;
    use crate::testutil::{serve, Reply};
    use std::sync::atomic::Ordering;
    use std::sync::Arc;
    use std::time::Instant;

    const OK: &str = r#"{"ok":true,"result":{"message_id":11,"document":{"file_id":"F1"}}}"#;

    fn chunk(len: usize) -> Chunk {
        Chunk {
            r#ref: ChunkRef::default(),
            data: Bytes::from(vec![3u8; len]),
        }
    }

    #[tokio::test]
    async fn a_send_the_server_never_answers_fails_near_the_idle_limit() {
        let (base, _) = serve(|_, _| Reply::Hang).await;
        let tg = Telegram::with_endpoint("tok", "1", &base, Duration::from_millis(400));
        let started = Instant::now();
        let r = tg
            .send_document(Bytes::from(vec![1u8; 2048]), "a.bin".into())
            .await;
        assert!(matches!(r, Err(AdapterError::Stalled(_))), "{r:?}");
        assert!(started.elapsed() < Duration::from_secs(3));
    }

    #[tokio::test]
    async fn a_rate_limit_is_surfaced_once_for_the_engine_to_retry() {
        let (base, hits) = serve(|_, _| {
            Reply::status(
                429,
                r#"{"ok":false,"description":"Too Many Requests","parameters":{"retry_after":3}}"#,
            )
        })
        .await;
        let tg = Telegram::with_endpoint("tok", "1", &base, Duration::from_secs(5));
        let started = Instant::now();
        let err = tg.upload("tg:1/x", chunk(1024)).await.unwrap_err();
        assert_eq!(err.retry_after_secs(), Some(3));
        assert!(started.elapsed() < Duration::from_secs(2));
        assert_eq!(hits.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn a_failed_later_part_deletes_the_earlier_ones_from_the_chat() {
        let deleted: Arc<std::sync::Mutex<Vec<String>>> = Arc::default();
        let record = deleted.clone();
        let (base, _) = serve(move |n, req| {
            if req.path.ends_with("/deleteMessage") {
                record
                    .lock()
                    .unwrap()
                    .push(String::from_utf8_lossy(&req.body).to_string());
                return Reply::status(200, r#"{"ok":true,"result":true}"#);
            }
            if n == 0 {
                Reply::status(200, OK)
            } else {
                Reply::status(400, r#"{"ok":false,"description":"Bad Request: nope"}"#)
            }
        })
        .await;
        let tg = Telegram::with_endpoint("tok", "1", &base, Duration::from_secs(10));
        let r = tg.upload("tg:1/x", chunk(MAX_PART_SIZE + 1)).await;
        assert!(r.is_err());
        let gone = deleted.lock().unwrap().clone();
        assert_eq!(gone.len(), 1, "{gone:?}");
        assert!(gone[0].contains("\"message_id\":11"), "{gone:?}");
    }
}
