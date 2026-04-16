use tauri::{Listener, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

mod sidecar;

#[tauri::command]
async fn upload_file(
    app: tauri::AppHandle,
    file_path: String,
    passphrase: String,
) -> Result<serde_json::Value, String> {
    sidecar::call(
        &app,
        "upload",
        serde_json::json!({
            "file_path": file_path,
            "passphrase": passphrase,
        }),
    )
    .await
}

#[tauri::command]
async fn download_file(
    app: tauri::AppHandle,
    file_id: String,
    passphrase: String,
    save_path: String,
) -> Result<serde_json::Value, String> {
    sidecar::call(
        &app,
        "download",
        serde_json::json!({
            "file_id": file_id,
            "passphrase": passphrase,
            "save_path": save_path,
        }),
    )
    .await
}

#[tauri::command]
async fn get_sidecar_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    sidecar::call(&app, "status", serde_json::json!({})).await
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            upload_file,
            download_file,
            get_sidecar_status,
        ])
        .setup(|app| {
            // Register zcrypt:// scheme at runtime (Linux/Windows only —
            // macOS uses the .app bundle's Info.plist).
            #[cfg(not(target_os = "macos"))]
            app.deep_link().register("zcrypt")?;

            // Handle zcrypt:// deep links (OAuth callback from browser)
            let handle = app.handle().clone();
            app.listen("deep-link://new-url", move |event: tauri::Event| {
                let payload = event.payload();
                if let Some(urls) = payload.strip_prefix('"').and_then(|s: &str| s.strip_suffix('"')) {
                    handle_deep_link(&handle, urls);
                } else {
                    handle_deep_link(&handle, payload);
                }
            });

            // Start sidecar on launch
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = sidecar::start(&handle).await {
                    eprintln!("failed to start sidecar: {}", e);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Navigate the main webview to the OAuth callback page with tokens from a deep link.
/// Incoming URL: zcrypt://oauth/callback?access_token=...&refresh_token=...
fn handle_deep_link(app: &tauri::AppHandle, raw: &str) {
    // The payload may contain the URL directly or as a JSON array element
    let url = raw
        .trim_matches(|c| c == '[' || c == ']' || c == '"')
        .to_string();

    if !url.starts_with("zcrypt://oauth/callback") {
        return;
    }

    // Extract the query string and convert to a fragment-based URL
    // so the existing frontend callback page can handle it identically.
    let query = url.splitn(2, '?').nth(1).unwrap_or("");

    if let Some(webview) = app.get_webview_window("main") {
        let nav_url = format!("/oauth/callback#{}", query);
        let _ = webview.eval(&format!("window.location.replace('{}')", nav_url));
    }
}
