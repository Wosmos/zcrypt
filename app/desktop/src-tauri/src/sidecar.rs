use std::sync::OnceLock;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin};
use tokio::sync::Mutex;

static SIDECAR_STDIN: OnceLock<Mutex<ChildStdin>> = OnceLock::new();
static SIDECAR_PROCESS: OnceLock<Mutex<Child>> = OnceLock::new();

/// Resolve the sidecar binary path.
/// In dev mode it's next to the tauri config; in production it's in the resource dir.
fn resolve_sidecar_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let target = current_target_triple();

    // Try resource dir first (production bundle)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let path = resource_dir.join(format!("zcrypt-sidecar-{}", target));
        if path.exists() {
            return Ok(path);
        }
    }

    // Dev mode: binary is in the src-tauri directory
    let dev_path = std::env::current_exe()
        .map_err(|e| format!("current_exe: {}", e))?
        .parent()
        .ok_or("no parent dir")?
        .join(format!("../../zcrypt-sidecar-{}", target));
    if dev_path.exists() {
        return Ok(dev_path);
    }

    // Also try src-tauri directly
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let manifest_path = manifest_dir.join(format!("zcrypt-sidecar-{}", target));
    if manifest_path.exists() {
        return Ok(manifest_path);
    }

    Err(format!(
        "sidecar not found. Run build-sidecar.sh first. Looked in: {:?}, {:?}",
        dev_path, manifest_path
    ))
}

fn current_target_triple() -> &'static str {
    if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "aarch64-apple-darwin"
        } else {
            "x86_64-apple-darwin"
        }
    } else if cfg!(target_os = "linux") {
        if cfg!(target_arch = "aarch64") {
            "aarch64-unknown-linux-gnu"
        } else {
            "x86_64-unknown-linux-gnu"
        }
    } else {
        "x86_64-pc-windows-msvc"
    }
}

/// Start the Go sidecar process.
/// The sidecar communicates via JSON-over-stdin/stdout (one JSON object per line).
pub async fn start(app: &AppHandle) -> Result<(), String> {
    let sidecar_path = resolve_sidecar_path(app)?;
    eprintln!("[sidecar] starting: {:?}", sidecar_path);

    let mut child = tokio::process::Command::new(&sidecar_path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn sidecar {:?}: {}", sidecar_path, e))?;

    let stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take();

    SIDECAR_STDIN
        .set(Mutex::new(stdin))
        .map_err(|_| "sidecar already started")?;
    SIDECAR_PROCESS
        .set(Mutex::new(child))
        .map_err(|_| "sidecar already started")?;

    // Read stderr in background for logging
    if let Some(stderr) = stderr {
        tauri::async_runtime::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[sidecar:err] {}", line);
            }
        });
    }

    // Read stdout in background — route progress events
    tauri::async_runtime::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            eprintln!("[sidecar] {}", line);
        }
    });

    Ok(())
}

/// Send a JSON-RPC-style command to the sidecar and read the response.
pub async fn call(
    _app: &AppHandle,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let stdin = SIDECAR_STDIN
        .get()
        .ok_or("sidecar not started")?;

    let request = serde_json::json!({
        "method": method,
        "params": params,
    });

    let mut line = serde_json::to_string(&request).map_err(|e| e.to_string())?;
    line.push('\n');

    let mut guard = stdin.lock().await;
    guard
        .write_all(line.as_bytes())
        .await
        .map_err(|e| format!("write to sidecar: {}", e))?;
    guard
        .flush()
        .await
        .map_err(|e| format!("flush sidecar: {}", e))?;

    // For now, return acknowledgement.
    // Full implementation will read the response line from stdout
    // matched by request ID.
    Ok(serde_json::json!({"status": "ok", "method": method}))
}
