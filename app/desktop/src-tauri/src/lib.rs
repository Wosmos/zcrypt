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
        .invoke_handler(tauri::generate_handler![
            upload_file,
            download_file,
            get_sidecar_status,
        ])
        .setup(|app| {
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
