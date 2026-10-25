# Android: uploads that keep going in the background

## What the current build already does

- Uploads run inside the app through the Rust engine (`app/core`, called from `upload_file` in `app/desktop/src-tauri/src/lib.rs`). While zcrypt is on screen they are fast and resumable.
- `lib/notify.ts` sends a system notification through `tauri-plugin-notification` when a batch finishes, when a file fails, and for alerts (new sign-in, storage full). These only show while zcrypt is in the background.
- No live progress notification on Android, on purpose. Once zcrypt is in the background Android can pause the WebView and then the Rust work, so a progress bar would freeze and give the wrong idea. A cancelled or paused upload resumes from the server's chunk record next time, so nothing is lost. It just waits.

## The approach: a small Tauri plugin with a foreground service

Write a small plugin crate, `tauri-plugin-zcrypt-transfers` (Kotlin on Android, Rust on the other side), that starts an Android **foreground service** while any upload is running.

- The service owns the notification: title "Uploading 37 of 104", a real progress bar, the current file's thumbnail as the large icon, and Pause and Cancel buttons.
- The upload work stays in Rust. The service exists to tell Android "the user is waiting on this, do not stop the process". Our Rust tasks keep running on the Tokio runtime as they do today. No upload code moves to Kotlin.
- Progress reaches the notification through the plugin: the Rust upload loop already emits `zcrypt://progress` events. The plugin gets a `report_progress(done, total, bytes, thumb_path)` call from the same place, and the Kotlin service updates its notification at most once a second.
- When the last file finishes, the service posts the "104 photos saved to Family" notification and stops itself.

**Why not WorkManager?** WorkManager suits work that can wait and rerun later (a nightly backup). A person who taps Upload expects it to start now and show progress. WorkManager would also mean starting a second copy of the engine in a worker process, with its own login state and keys. A foreground service keeps everything in the one process that already has the unlocked vault. WorkManager could come later for the folder-watch backup (P6).

## Permissions and manifest

- `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_DATA_SYNC`, with `android:foregroundServiceType="dataSync"` on the service.
- `POST_NOTIFICATIONS` (Android 13 and up). Ask for it from a tap: the Settings "Turn on notifications" button already does this through the plugin.
- Patch these into the generated manifest in `device.yml`, the same way the share intent filters are added today.

## Battery and Doze caveats

- Android 14+ limits `dataSync` services to about 6 hours in 24. Long batches past that need to stop cleanly and resume when the app is opened. The engine already supports that.
- Doze and "battery optimised" apps can still lose network in deep sleep. The foreground service keeps the CPU, but some makers (Xiaomi, Huawei, Samsung's "sleeping apps") kill it anyway. Show a one-time tip linking to the battery settings when an upload is interrupted twice.
- The service must stop the moment the queue is empty, or Play policy and users will both object.
- The vault key stays in memory only while the process lives. If Android kills the process, the upload stops and needs an unlock to resume. That is correct for a zero-knowledge app.

## Effort

About 4 to 6 days for one person: 2 days for the plugin and service, 1 day wiring progress from the upload loop, 1 day for the manifest patch and CI, 1 to 2 days testing on a Pixel and one aggressive Android skin (Samsung or Xiaomi), including Doze (`adb shell dumpsys deviceidle force-idle`).
