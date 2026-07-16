use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, Instant};

// Tray + menu APIs exist only on desktop Tauri (gated as #[cfg(desktop)] /
// #[cfg(all(desktop, feature = "tray-icon"))] upstream), so these imports and
// their uses must be desktop-only or the mobile (android/ios) target won't compile.
#[cfg(desktop)]
use tauri::menu::{MenuBuilder, MenuItemBuilder};
#[cfg(desktop)]
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Listener, Manager};
// Only needed for the `.deep_link()` call below, which is itself macOS-gated
// (macOS registers the scheme via the .app bundle's Info.plist instead).
#[cfg(not(target_os = "macos"))]
use tauri_plugin_deep_link::DeepLinkExt;
use tokio::sync::{RwLock, watch};

use zcrypt_core::api::Client;
use zcrypt_core::engines::{self, CredProvider, EngineContext, PlatformCreds};
use zcrypt_core::localdb::LocalDb;
use zcrypt_core::profiles;
use zcrypt_core::types::{Progress, ProgressFn};

/// OS keychain service name for all zcrypt desktop secrets.
const KEYCHAIN_SERVICE: &str = "app.zcrypt.desktop";
/// Tauri event carrying `zcrypt_core::types::Progress` payloads.
const PROGRESS_EVENT: &str = "zcrypt://progress";
/// Emitted when the inactivity auto-lock clears the cached passphrase, so the
/// frontend CAN react (e.g. re-prompt) if it wants to — nothing currently
/// listens for it; this just leaves the hook in place.
const AUTO_LOCK_EVENT: &str = "zcrypt://auto-locked";
/// How long the cached vault passphrase (and the core's warm key cache) may
/// sit idle before auto-lock forgets them. Convenience-only, mirroring a
/// password manager's idle timeout: it stops the folder-watch agent (and
/// anything that would reuse the cached warm keys) from running forever on a
/// machine the user walked away from. The frontend's OWN vault-lock state is
/// separate and unaffected.
const INACTIVITY_TIMEOUT: Duration = Duration::from_secs(300);
/// How often the auto-lock task checks for inactivity. A simple periodic poll
/// comparing timestamps — not a per-call reset-and-cancel timer — so there's
/// no cancellation race to get wrong; this only needs to be tighter than the
/// multi-minute timeout above, not tight to the second.
const INACTIVITY_POLL_INTERVAL: Duration = Duration::from_secs(30);

/// Token-rotation callback shape expected by `Client::with_rotate_hook`
/// (the core keeps its own alias private).
type RotateHook = Arc<dyn Fn(&str, &str) + Send + Sync>;

/// Managed engine state — replaces the old Go sidecar process.
///
/// - `client` is built on `start_sync` (needs base URL + tokens).
/// - `db` is opened lazily on first use.
/// - `sync_cancel` flips the watch channel the sync worker listens on.
struct EngineState {
    client: RwLock<Option<Arc<Client>>>,
    db: StdMutex<Option<Arc<LocalDb>>>,
    sync_cancel: StdMutex<Option<watch::Sender<bool>>>,
    profile: profiles::Profile,
    /// Vault passphrase cached after unlock so the background folder-watch agent
    /// can encrypt new files without prompting. Cleared on lock/logout, or by
    /// the inactivity auto-lock (see INACTIVITY_TIMEOUT).
    passphrase: StdMutex<Option<String>>,
    /// Active folder-watch watcher — dropping it stops watching (and ends the
    /// processor task, whose channel sender lives inside the watcher callback).
    watcher: StdMutex<Option<notify::RecommendedWatcher>>,
    /// Updated by `touch_activity()` on every passphrase-bearing command; the
    /// auto-lock task compares this against `INACTIVITY_TIMEOUT`.
    last_activity: StdMutex<Instant>,
}

impl Default for EngineState {
    fn default() -> Self {
        EngineState {
            client: RwLock::new(None),
            db: StdMutex::new(None),
            sync_cancel: StdMutex::new(None),
            profile: profiles::NORMAL,
            passphrase: StdMutex::new(None),
            watcher: StdMutex::new(None),
            last_activity: StdMutex::new(Instant::now()),
        }
    }
}

impl EngineState {
    /// Mark the vault as just-used, resetting the inactivity clock. Called by
    /// every command that sets or relies on the cached passphrase.
    fn touch_activity(&self) {
        *self.last_activity.lock().unwrap() = Instant::now();
    }

    /// Lazily open the local SQLite ledger.
    fn db(&self) -> Result<Arc<LocalDb>, String> {
        let mut guard = self.db.lock().unwrap();
        if let Some(db) = guard.as_ref() {
            return Ok(db.clone());
        }
        let db = Arc::new(LocalDb::open().map_err(|e| format!("open local db: {}", e))?);
        *guard = Some(db.clone());
        Ok(db)
    }

    async fn client(&self) -> Result<Arc<Client>, String> {
        self.client
            .read()
            .await
            .clone()
            .ok_or_else(|| "engine not connected — call start_sync first".to_string())
    }

    /// Build an engine context that forwards progress to the webview.
    async fn context(&self, app: &tauri::AppHandle) -> Result<EngineContext, String> {
        Ok(EngineContext {
            client: self.client().await?,
            db: self.db()?,
            profile: self.profile,
            progress: progress_emitter(app),
            creds: keychain_creds(),
        })
    }
}

/// ProgressFn closure that emits `zcrypt://progress` window events.
fn progress_emitter(app: &tauri::AppHandle) -> ProgressFn {
    let app = app.clone();
    Arc::new(move |p: Progress| {
        let _ = app.emit(PROGRESS_EVENT, &p);
    })
}

/// Runs for the lifetime of the app: every INACTIVITY_POLL_INTERVAL, forgets
/// the cached passphrase (and the core's warm key cache) if nothing has
/// touched it for INACTIVITY_TIMEOUT. A periodic poll comparing timestamps —
/// not a per-call reset-and-cancel timer — so there's no cancellation race:
/// every passphrase-bearing command just updates a timestamp via
/// `touch_activity()`, and this task alone decides when to act on it.
fn spawn_inactivity_autolock(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut tick = tokio::time::interval(INACTIVITY_POLL_INTERVAL);
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            tick.tick().await;
            let state = app.state::<EngineState>();
            let idle = state.last_activity.lock().unwrap().elapsed();
            if idle < INACTIVITY_TIMEOUT {
                continue;
            }
            // .take() both checks and clears in one lock acquisition — a race
            // with an explicit clear_passphrase() just means both agree the
            // end state is None, never a corrupt/partial state.
            let had_passphrase = state.passphrase.lock().unwrap().take().is_some();
            if had_passphrase {
                zcrypt_core::crypto::clear_key_cache();
                let _ = app.emit(AUTO_LOCK_EVENT, ());
            }
        }
    });
}

fn keychain_entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, key).map_err(|e| format!("keychain: {}", e))
}

/// Read a keychain secret, returning None for a missing/unreadable entry.
fn keychain_read(key: &str) -> Option<String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, key)
        .ok()?
        .get_password()
        .ok()
}

/// CredProvider backed by the OS keychain: the user's own platform tokens are
/// stored by the frontend via `keychain_set` under `platform.<id>.token` /
/// `platform.<id>.account`. Returns None when a platform isn't connected, so
/// the engine falls back to the server-managed relay path. These tokens are the
/// user's OWN — the managed-pool token never lives on the client.
fn keychain_creds() -> CredProvider {
    Arc::new(|platform: &str| {
        let token = keychain_read(&format!("platform.{platform}.token"))?;
        let account = keychain_read(&format!("platform.{platform}.account")).unwrap_or_default();
        Some(PlatformCreds { token, account })
    })
}

// ---------------------------------------------------------------------------
// Transfer commands
// ---------------------------------------------------------------------------

/// Encrypt + chunk a file into the local ledger only (sync worker pushes it
/// later). Returns the local file id.
#[tauri::command]
async fn local_upload(
    app: tauri::AppHandle,
    state: tauri::State<'_, EngineState>,
    file_path: String,
    passphrase: String,
    profile: Option<String>,
) -> Result<String, String> {
    state.touch_activity();
    let mut ctx = state.context(&app).await?;
    if let Some(name) = profile.as_deref() {
        ctx.profile = profiles::get_profile(name);
    }
    engines::local_upload(&ctx, Path::new(&file_path), &passphrase)
        .await
        .map_err(|e| e.to_string())
}

/// Full pipeline upload straight to the backend/platforms.
#[tauri::command]
async fn upload_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, EngineState>,
    file_path: String,
    passphrase: String,
    platform: Option<String>,
) -> Result<(), String> {
    state.touch_activity();
    let ctx = state.context(&app).await?;
    engines::upload(&ctx, Path::new(&file_path), &passphrase, platform)
        .await
        .map_err(|e| e.to_string())
}

/// Await a file already saved via `local_upload` reaching genuine sync
/// completion. The frontend calls this right after `local_upload` so the
/// upload row can show "Saved locally" -> "Syncing..." -> a TRUE "Done" only
/// once the file is actually confirmed on the backend/platform, instead of
/// treating local_upload's fast local-encrypt return as "Done".
#[tauri::command]
async fn sync_uploaded_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, EngineState>,
    file_id: String,
    platform: Option<String>,
) -> Result<(), String> {
    let ctx = state.context(&app).await?;
    engines::sync_uploaded_file(&ctx, &file_id, platform)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn download_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, EngineState>,
    file_id: String,
    passphrase: String,
    user_id: String,
    save_path: String,
) -> Result<(), String> {
    state.touch_activity();
    let ctx = state.context(&app).await?;
    engines::download(
        &ctx,
        &file_id,
        &passphrase,
        &user_id,
        None,
        Path::new(&save_path),
    )
    .await
    .map_err(|e| e.to_string())
}

/// One entry of a bulk-download request — mirrors the frontend's
/// `BulkDownloadFile` (its `fileSize` is browser-only queue bookkeeping, not
/// needed here).
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BulkFileArg {
    file_id: String,
    filename: String,
    /// This file's OWN resolved passphrase (vault passphrase, or the relevant
    /// folder password) — NOT one shared passphrase for the whole batch. A
    /// bulk selection can span files from different password-protected
    /// folders; the frontend already resolves this per file for the web
    /// bulk-ZIP path, so this mirrors it exactly. See `engines::BulkFile`.
    passphrase: String,
}

/// Bulk download: N files packed into ONE ZIP via the in-process core —
/// memory/disk use bounded by the single largest file, not the sum of the
/// whole batch (unlike the in-browser path, which holds every file's full
/// decrypted bytes in memory simultaneously and caps total selection size at
/// 2GB for exactly that reason). Any single file's failure aborts the whole
/// batch and cleans up the partial zip, and duplicate filenames get the same
/// " (1)", " (2)", ... suffix — both matching lib/bulk-download.ts exactly.
#[tauri::command]
async fn bulk_download_zip(
    app: tauri::AppHandle,
    state: tauri::State<'_, EngineState>,
    files: Vec<BulkFileArg>,
    user_id: String,
    save_path: String,
) -> Result<(), String> {
    state.touch_activity();
    let ctx = state.context(&app).await?;
    let files: Vec<engines::BulkFile> = files
        .into_iter()
        .map(|f| engines::BulkFile {
            file_id: f.file_id,
            filename: f.filename,
            passphrase: f.passphrase,
        })
        .collect();
    engines::bulk_download(&ctx, &files, &user_id, Path::new(&save_path))
        .await
        .map_err(|e| e.to_string())
}

/// In-memory decrypt for thumbnails / preview / the in-app viewer: fetch →
/// verify → decrypt → decompress → return the plaintext bytes (no disk write).
/// Returns a raw byte IPC response (not base64) so large previews don't inflate
/// the bridge. Capped in the core at 512 MiB — callers fall back to a streamed
/// download above that.
#[tauri::command]
async fn decrypt_to_memory(
    app: tauri::AppHandle,
    state: tauri::State<'_, EngineState>,
    file_id: String,
    passphrase: String,
    user_id: String,
) -> Result<tauri::ipc::Response, String> {
    state.touch_activity();
    let ctx = state.context(&app).await?;
    let bytes = engines::decrypt_to_memory(&ctx, &file_id, &passphrase, &user_id, None)
        .await
        .map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Download a shared-space file via the in-process core — works for the owner
/// and any member alike. `space_key_b64` is base64 for the file's
/// ALREADY-RESOLVED content key, not the space's raw symmetric key: the
/// frontend (`lib/spaces.ts`'s `spaceFileKey()`) unwraps the space-wrapped CEK
/// client-side against the `SharedVaultFile` record it holds (the file's
/// generic metadata carries a DIFFERENT ciphertext — the owner's
/// passphrase-wrapped envelope — which the space key can't unwrap) and passes
/// us the result directly, mirroring the web client's `resolveKey` override.
/// `passphrase`/`user_id` are empty: this bypasses passphrase-derived key
/// resolution entirely, and hmac_v1 whole-file verification is skipped rather
/// than attempted with no passphrase — see `crypto::can_verify_whole_file_hash`.
#[tauri::command]
async fn download_space_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, EngineState>,
    file_id: String,
    space_key_b64: String,
    save_path: String,
) -> Result<(), String> {
    // Doesn't touch the cached passphrase, but the user is clearly at the app
    // actively using it — counts as activity same as any passphrase-bearing
    // command, so it doesn't get auto-locked out from under them mid-session.
    state.touch_activity();
    let ctx = state.context(&app).await?;
    let space_key = base64_decode(&space_key_b64)?;
    engines::download(
        &ctx,
        &file_id,
        "",
        "",
        Some(space_key),
        Path::new(&save_path),
    )
    .await
    .map_err(|e| e.to_string())
}

/// In-memory decrypt of a shared-space file (thumbnails / preview / viewer) —
/// the space-key sibling of `decrypt_to_memory`. See `download_space_file` for
/// why `passphrase`/`user_id` are empty.
#[tauri::command]
async fn decrypt_space_to_memory(
    app: tauri::AppHandle,
    state: tauri::State<'_, EngineState>,
    file_id: String,
    space_key_b64: String,
) -> Result<tauri::ipc::Response, String> {
    state.touch_activity(); // see download_space_file
    let ctx = state.context(&app).await?;
    let space_key = base64_decode(&space_key_b64)?;
    let bytes = engines::decrypt_to_memory(&ctx, &file_id, "", "", Some(space_key))
        .await
        .map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD
        .decode(s)
        .map_err(|e| format!("space key b64: {e}"))
}

/// byos-direct delete: remove the file's ciphertext directly from the user's own
/// storage (device holds the token) and drop the backend metadata — no server
/// deletion-worker load. Falls back to a server purge for chunks on platforms
/// the device has no credentials for.
#[tauri::command]
async fn delete_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, EngineState>,
    file_id: String,
) -> Result<(), String> {
    let ctx = state.context(&app).await?;
    engines::delete(&ctx, &file_id)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Sync worker
// ---------------------------------------------------------------------------

/// Build the API client (persisting rotated tokens back to the OS keychain)
/// and (re)start the background sync worker.
#[tauri::command]
async fn start_sync(
    app: tauri::AppHandle,
    state: tauri::State<'_, EngineState>,
    base_url: String,
    access_token: String,
    refresh_token: String,
) -> Result<(), String> {
    let rotate_hook: RotateHook = Arc::new(|access, refresh| {
        if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, "auth.access") {
            let _ = entry.set_password(access);
        }
        if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, "auth.refresh") {
            let _ = entry.set_password(refresh);
        }
    });
    let client = Arc::new(
        Client::new(&base_url, &access_token, &refresh_token).with_rotate_hook(rotate_hook),
    );
    *state.client.write().await = Some(client.clone());

    let db = state.db()?;

    // Cancel any previous sync worker, then install a fresh cancel channel.
    let (cancel_tx, cancel_rx) = watch::channel(false);
    {
        let mut guard = state.sync_cancel.lock().unwrap();
        if let Some(old) = guard.take() {
            let _ = old.send(true);
        }
        *guard = Some(cancel_tx);
    }

    let ctx = EngineContext {
        client,
        db,
        profile: state.profile,
        progress: progress_emitter(&app),
        creds: keychain_creds(),
    };
    tauri::async_runtime::spawn(async move {
        engines::run_sync(ctx, cancel_rx).await;
    });
    Ok(())
}

#[tauri::command]
async fn stop_sync(state: tauri::State<'_, EngineState>) -> Result<(), String> {
    if let Some(cancel) = state.sync_cancel.lock().unwrap().take() {
        let _ = cancel.send(true);
    }
    Ok(())
}

#[tauri::command]
async fn sync_status(state: tauri::State<'_, EngineState>) -> Result<serde_json::Value, String> {
    let db = state.db()?;
    let stats = engines::sync_status(&db).map_err(|e| e.to_string())?;
    serde_json::to_value(stats).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_engine_status() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "ready": true,
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

/// Enable/disable launch-at-login (desktop only; mobile lifecycle is OS-managed
/// so this is a no-op there). The desktop backup agent wants to start with the
/// OS so folder-watch resumes without the user relaunching.
#[tauri::command]
async fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    #[cfg(desktop)]
    let result = {
        use tauri_plugin_autostart::ManagerExt;
        let m = app.autolaunch();
        (if enabled { m.enable() } else { m.disable() }).map_err(|e| format!("autostart: {}", e))
    };
    #[cfg(not(desktop))]
    let result = {
        let _ = (app, enabled);
        Ok(())
    };
    result
}

/// Whether launch-at-login is currently enabled (false on mobile / on error).
#[tauri::command]
async fn is_autostart_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    #[cfg(desktop)]
    let result = {
        use tauri_plugin_autostart::ManagerExt;
        app.autolaunch()
            .is_enabled()
            .map_err(|e| format!("autostart: {}", e))
    };
    #[cfg(not(desktop))]
    let result = {
        let _ = app;
        Ok(false)
    };
    result
}

// ---------------------------------------------------------------------------
// Folder-watch backup agent
// ---------------------------------------------------------------------------

/// Cache the vault passphrase after unlock so the background folder-watch agent
/// can encrypt new files without a prompt. Kept in memory only.
#[tauri::command]
async fn set_passphrase(
    state: tauri::State<'_, EngineState>,
    passphrase: String,
) -> Result<(), String> {
    *state.passphrase.lock().unwrap() = Some(passphrase);
    state.touch_activity();
    Ok(())
}

/// Forget the cached passphrase (on lock / logout). The folder-watch agent then
/// skips new files until the vault is unlocked again. Also forgets the core's
/// warm file-key cache (see `crypto::resolve_file_key_cached`) so a resolved
/// key can't outlive the passphrase it was derived from.
#[tauri::command]
async fn clear_passphrase(state: tauri::State<'_, EngineState>) -> Result<(), String> {
    *state.passphrase.lock().unwrap() = None;
    zcrypt_core::crypto::clear_key_cache();
    Ok(())
}

/// Watch a folder: every newly-created file is encrypted into the local ledger
/// (the sync worker then pushes it) and a "Backed up" notification is posted.
/// Requires the vault unlocked (passphrase cached) and the engine connected;
/// events arriving before that are skipped. Replaces any previous watch.
#[tauri::command]
async fn start_folder_watch(
    app: tauri::AppHandle,
    state: tauri::State<'_, EngineState>,
    path: String,
) -> Result<(), String> {
    use notify::{RecursiveMode, Watcher};

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<PathBuf>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            // New files only — Modify would re-upload on every save (versioning
            // is a later refinement); Create covers "drop a file in the folder".
            if matches!(ev.kind, notify::EventKind::Create(_)) {
                for p in ev.paths {
                    if p.is_file() {
                        let _ = tx.send(p);
                    }
                }
            }
        }
    })
    .map_err(|e| format!("watch: {}", e))?;
    watcher
        .watch(Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| format!("watch {}: {}", path, e))?;
    // Keep the watcher alive; dropping it (stop_folder_watch / replace) stops it.
    *state.watcher.lock().unwrap() = Some(watcher);

    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(p) = rx.recv().await {
            let st = app2.state::<EngineState>();
            let pass = { st.passphrase.lock().unwrap().clone() };
            let Some(pass) = pass else { continue }; // vault locked → skip
            let ctx = match st.context(&app2).await {
                Ok(c) => c,
                Err(_) => continue, // engine not connected yet → skip
            };
            match engines::local_upload(&ctx, &p, &pass).await {
                Ok(_) => notify_backup(&app2, &p),
                Err(e) => eprintln!("folder-watch: {}: {}", p.display(), e),
            }
        }
    });
    Ok(())
}

/// Stop the active folder watch (drops the watcher, which ends the processor).
#[tauri::command]
async fn stop_folder_watch(state: tauri::State<'_, EngineState>) -> Result<(), String> {
    *state.watcher.lock().unwrap() = None;
    Ok(())
}

/// Post a local "Backed up <file>" OS notification (all platforms).
fn notify_backup(app: &tauri::AppHandle, path: &Path) {
    use tauri_plugin_notification::NotificationExt;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let _ = app
        .notification()
        .builder()
        .title("zcrypt backup")
        .body(format!("Backed up {}", name))
        .show();
}

// ---------------------------------------------------------------------------
// OS keychain
// ---------------------------------------------------------------------------

#[tauri::command]
async fn keychain_set(key: String, value: String) -> Result<(), String> {
    keychain_entry(&key)?
        .set_password(&value)
        .map_err(|e| format!("keychain set: {}", e))
}

#[tauri::command]
async fn keychain_get(key: String) -> Result<Option<String>, String> {
    match keychain_entry(&key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keychain get: {}", e)),
    }
}

#[tauri::command]
async fn keychain_delete(key: String) -> Result<(), String> {
    match keychain_entry(&key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keychain delete: {}", e)),
    }
}

// ---------------------------------------------------------------------------
// Updater
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
struct UpdateCheck {
    available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
}

/// Desktop-only update check; `{available:false}` whenever the updater is
/// unconfigured or the check fails.
#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<UpdateCheck, String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_updater::UpdaterExt;
        if let Ok(updater) = app.updater()
            && let Ok(Some(update)) = updater.check().await
        {
            return Ok(UpdateCheck {
                available: true,
                version: Some(update.version.clone()),
            });
        }
    }
    #[cfg(not(desktop))]
    let _ = app;
    Ok(UpdateCheck {
        available: false,
        version: None,
    })
}

// ---------------------------------------------------------------------------
// Biometric unlock (Touch ID)
// ---------------------------------------------------------------------------
//
// Convenience-only: lets the vault's own owner re-unlock with Touch ID instead
// of retyping their passphrase (same pattern as 1Password/Bitwarden/Notes).
// Nothing security-sensitive is bypassed — the frontend still holds the real
// passphrase-derived key; this only gates whether it resurfaces the cached
// passphrase (see set_passphrase/clear_passphrase above) without a retype.
// macOS-only for now; every other target gets a compiling no-op.

/// Whether Touch ID (or another local device-owner biometric) is available
/// right now. False on non-macOS targets and whenever the Mac has no usable
/// enrollment (no Touch ID hardware, nothing enrolled, etc).
#[tauri::command]
fn biometric_available() -> bool {
    #[cfg(target_os = "macos")]
    {
        macos_biometrics::available()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

/// Present the OS Touch ID prompt with `reason` as the shown text.
///
/// Returns `Ok(true)` on successful authentication, `Ok(false)` on user
/// cancel or any authentication failure (not enrolled, locked out, denied,
/// etc — all expected outcomes of a declined prompt). `Err` only if the OS
/// never answers the request at all.
#[tauri::command]
async fn biometric_authenticate(reason: String) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        macos_biometrics::authenticate(reason).await
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = reason;
        Ok(false)
    }
}

/// macOS LocalAuthentication (Touch ID) bindings via objc2. Isolated in its
/// own module so the rest of the file stays framework-agnostic.
#[cfg(target_os = "macos")]
mod macos_biometrics {
    use std::sync::Mutex;

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::Bool;
    use objc2_foundation::{NSError, NSString};
    use objc2_local_authentication::{LAContext, LAPolicy};

    /// Touch ID (or other biometrics) only — deliberately excludes the
    /// password/watch fallback so a declined or unavailable Touch ID never
    /// silently degrades into the macOS account-password prompt.
    const POLICY: LAPolicy = LAPolicy::DeviceOwnerAuthenticationWithBiometrics;

    pub(super) fn available() -> bool {
        let context = unsafe { LAContext::new() };
        unsafe { context.canEvaluatePolicy_error(POLICY) }.is_ok()
    }

    pub(super) async fn authenticate(reason: String) -> Result<bool, String> {
        match tokio::task::spawn_blocking(move || authenticate_blocking(&reason)).await {
            Ok(result) => result,
            Err(e) => Err(format!("biometric authenticate: task join: {}", e)),
        }
    }

    /// Runs on a blocking-pool thread: creates the context, shows the
    /// prompt, and waits synchronously for the OS reply callback. Keeping
    /// the whole exchange on one thread sidesteps `LAContext` not being
    /// `Send` — nothing objc-owned ever needs to cross an await point.
    fn authenticate_blocking(reason: &str) -> Result<bool, String> {
        let context: Retained<LAContext> = unsafe { LAContext::new() };
        let reason_ns = NSString::from_str(reason);

        let (tx, rx) = std::sync::mpsc::channel::<bool>();
        let tx = Mutex::new(Some(tx));
        let reply = RcBlock::new(move |success: Bool, _error: *mut NSError| {
            if let Some(tx) = tx.lock().unwrap().take() {
                let _ = tx.send(success.as_bool());
            }
        });

        unsafe {
            context.evaluatePolicy_localizedReason_reply(POLICY, &reason_ns, &reply);
        }

        rx.recv()
            .map_err(|_| "biometric authenticate: no response from Touch ID".to_string())
    }
}

// ---------------------------------------------------------------------------
// Temp files
// ---------------------------------------------------------------------------

/// Write file data to a temp file. Returns the path.
#[tauri::command]
async fn write_temp_file(name: String, data: Vec<u8>) -> Result<String, String> {
    let tmp = std::env::temp_dir().join(format!("zcrypt-{}-{}", std::process::id(), name));
    std::fs::write(&tmp, &data).map_err(|e| format!("write temp: {}", e))?;
    Ok(tmp.to_string_lossy().to_string())
}

#[tauri::command]
async fn remove_temp_file(path: String) -> Result<(), String> {
    let _ = std::fs::remove_file(&path);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(EngineState::default())
        .invoke_handler(tauri::generate_handler![
            local_upload,
            upload_file,
            sync_uploaded_file,
            download_file,
            decrypt_to_memory,
            bulk_download_zip,
            download_space_file,
            decrypt_space_to_memory,
            delete_file,
            start_sync,
            stop_sync,
            sync_status,
            get_engine_status,
            keychain_set,
            keychain_get,
            keychain_delete,
            check_for_updates,
            write_temp_file,
            remove_temp_file,
            set_autostart,
            is_autostart_enabled,
            set_passphrase,
            clear_passphrase,
            start_folder_watch,
            stop_folder_watch,
            biometric_available,
            biometric_authenticate,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                // Launch-at-login support (no auto-enable — the UI toggles it).
                app.handle()
                    .plugin(tauri_plugin_autostart::Builder::new().build())?;
                // The updater plugin is intentionally NOT registered yet: it
                // requires a signed `plugins.updater` config (pubkey + endpoints)
                // set up with the release keypair, and registering it WITHOUT that
                // config panics at launch ("invalid type: null, expected Config").
                // check_for_updates() degrades to "no update" until the release/
                // signing pipeline lands.
            }

            // Register zcrypt:// scheme at runtime (Linux/Windows only — macOS
            // uses the .app bundle's Info.plist, and MOBILE uses the manifest
            // intent-filters). Must be `all(desktop, ...)`: a bare
            // not(target_os="macos") also matches ANDROID, where deep_link()
            // .register() is unsupported and the `?` aborts setup() → the app
            // crashes silently on launch.
            #[cfg(all(desktop, not(target_os = "macos")))]
            app.deep_link().register("zcrypt")?;

            // Handle zcrypt:// deep links (OAuth callback from browser)
            let handle = app.handle().clone();
            app.listen("deep-link://new-url", move |event: tauri::Event| {
                let payload = event.payload();
                if let Some(urls) = payload
                    .strip_prefix('"')
                    .and_then(|s: &str| s.strip_suffix('"'))
                {
                    handle_deep_link(&handle, urls);
                } else {
                    handle_deep_link(&handle, payload);
                }
            });

            #[cfg(desktop)]
            setup_tray(app)?;

            // Inactivity auto-lock — not gated to desktop; the cached
            // passphrase and warm key cache exist on every target.
            spawn_inactivity_autolock(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// System tray: Open zcrypt / Sync now / Quit.
///
/// The `app.trayIcon` config in tauri.conf.json creates the tray icon itself
/// (id "main"); we attach the menu to it, falling back to building one if the
/// config-created tray is unavailable. Desktop-only — the tray/menu APIs don't
/// exist in mobile Tauri.
#[cfg(desktop)]
fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let open = MenuItemBuilder::with_id("open", "Open zcrypt").build(app)?;
    let sync_now = MenuItemBuilder::with_id("sync-now", "Sync now").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app)
        .item(&open)
        .item(&sync_now)
        .separator()
        .item(&quit)
        .build()?;

    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(menu))?;
    } else {
        let mut builder = TrayIconBuilder::with_id("main")
            .menu(&menu)
            .tooltip("zcrypt");
        if let Some(icon) = app.default_window_icon() {
            builder = builder.icon(icon.clone());
        }
        builder.build(app)?;
    }

    // Menu events are app-global in Tauri v2; this also receives tray menu clicks.
    app.on_menu_event(|app, event| match event.id().as_ref() {
        "open" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "sync-now" => {
            let _ = app.emit("zcrypt://sync-now", ());
        }
        "quit" => app.exit(0),
        _ => {}
    });

    Ok(())
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
    let query = url.split_once('?').map_or("", |(_, q)| q);

    if let Some(webview) = app.get_webview_window("main") {
        let nav_url = format!("/oauth/callback#{}", query);
        let _ = webview.eval(format!("window.location.replace('{}')", nav_url));
    }
}
