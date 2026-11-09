// Copied over the Tauri CLI's generated MainActivity by device.yml, after
// `cargo tauri android init`. It is NOT compiled from this path, gen/android
// is generated and gitignored, so this lives here to stay reviewable instead
// of being a heredoc buried in a workflow file.
//
// Two jobs:
//
// 1. enableEdgeToEdge(): kept from the CLI's own template. Draws the WebView
//    under the status and navigation bars, which is what makes the safe-area
//    CSS in globals.css mean anything on Android 14 and below. (On Android 15+
//    the OS enforces it anyway, because targetSdk is 36.)
//
// 2. Publishing the window insets as --android-safe-* CSS variables. Drawing
//    edge-to-edge is necessary but not sufficient: the WebView also has to
//    forward those insets into env(safe-area-inset-*), and that support is
//    gated on the Android System WebView's OWN version, partial in M136,
//    unconditional only from M144. WebView updates through Play independently
//    of the OS, so a phone on a stale or sideloaded WebView reports 0px for all
//    four insets and renders the UI under the notch. That is precisely the bug
//    the safe-area work was meant to fix, on precisely the devices least likely
//    to be up to date. globals.css max()es these against env(), so whichever
//    source reports a real inset wins and the two never fight.
//
// 3. FLAG_SECURE by default, so decrypted previews never reach screenshots,
//    screen recordings or the recents thumbnail. The user can relax it from
//    Settings through the `ZcryptAndroid` bridge; the choice is persisted so it
//    applies before the first frame on the next launch.
//
// 4. "Share to zcrypt": ACTION_SEND / SEND_MULTIPLE (the intent filters are
//    patched into the generated manifest by device.yml). Shared content:// URIs
//    are copied into the app cache, because the core reads plain paths, and the
//    vault collects them through `ZcryptAndroid.takeSharedFiles()` and hands
//    each back through `releaseSharedFile()` once it is uploaded. A share is
//    handled once: a relaunch from recents replays the task's SEND base intent,
//    so those are skipped.
//
// 5. Picture-in-picture for video. The page reports through the bridge when a
//    video is playing and its shape; leaving the app then shrinks it into a
//    floating window (automatically on Android 12+, on Home before that), and
//    the page is told so it shows only that video while it floats. Paused or
//    closed media turns it off, so leaving the app never floats the vault.
//    The manifest's supportsPictureInPicture is patched in by device.yml.
//
// 6. Photo backup (PhotoBackupWorker.kt). The page asks for photo access and
//    hands over the schedule and network through the bridge; the worker then
//    runs on its own, with the app closed. On Android 14+ a person can allow
//    only some photos; the page is told so it can offer access to all.
//
// The package must equal tauri.conf.json's `identifier`; device.yml asserts it.
package app.zcrypt.desktop

import android.Manifest
import android.app.PictureInPictureParams
import android.content.ContentResolver
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import android.provider.Settings
import android.util.Rational
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : TauriActivity() {
  private var webView: WebView? = null
  private val pendingShares = mutableListOf<String>()
  private var pipReady = false
  private var pipAspect = Rational(16, 9)

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    applyScreenSecurity()
    super.onCreate(savedInstanceState)
    if (savedInstanceState == null) {
      pruneShares()
      if ((intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0) handleShare(intent)
      consumeShare(intent)
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handleShare(intent)
    consumeShare(intent)
  }

  private fun consumeShare(intent: Intent?) {
    if (intent?.action == Intent.ACTION_SEND || intent?.action == Intent.ACTION_SEND_MULTIPLE) {
      setIntent(Intent(intent).setAction(null))
    }
  }

  private fun prefs() = getSharedPreferences(PREFS, MODE_PRIVATE)

  private fun applyScreenSecurity() {
    if (prefs().getBoolean(KEY_ALLOW_CAPTURE, false)) {
      window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    } else {
      window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
    }
  }

  private fun pipSupported(): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

  private fun pipParams(): PictureInPictureParams {
    val builder = PictureInPictureParams.Builder().setAspectRatio(pipAspect)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) builder.setAutoEnterEnabled(pipReady)
    return builder.build()
  }

  private fun updatePip() {
    if (pipSupported()) setPictureInPictureParams(pipParams())
  }

  private fun enterPip() {
    if (pipSupported() && pipReady && !isInPictureInPictureMode) {
      try {
        enterPictureInPictureMode(pipParams())
      } catch (e: IllegalStateException) {
        // The activity is not in a state that can float (e.g. finishing).
      }
    }
  }

  // Android's allowed range is 1:2.39 to 2.39:1; anything outside it throws.
  private fun clampAspect(width: Int, height: Int): Rational {
    val ratio = (width.toFloat() / height).coerceIn(1f / 2.39f, 2.39f)
    return Rational((ratio * 1000).toInt(), 1000)
  }

  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) enterPip()
  }

  override fun onPictureInPictureModeChanged(inPip: Boolean, newConfig: Configuration) {
    super.onPictureInPictureModeChanged(inPip, newConfig)
    webView?.evaluateJavascript(
      "window.dispatchEvent(new CustomEvent('$PIP_EVENT',{detail:$inPip}))",
      null,
    )
  }

  private fun granted(permission: String): Boolean =
    ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

  /** "all", "partial" (only photos the person picked, Android 14+) or "none". */
  private fun photoAccess(): String = when {
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && granted(Manifest.permission.READ_MEDIA_IMAGES) -> "all"
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
      granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) -> "partial"
    Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU && granted(Manifest.permission.READ_EXTERNAL_STORAGE) -> "all"
    else -> "none"
  }

  private fun photoPermissions(): Array<String> = when {
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE -> arrayOf(
      Manifest.permission.READ_MEDIA_IMAGES,
      Manifest.permission.READ_MEDIA_VIDEO,
      Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED,
      Manifest.permission.POST_NOTIFICATIONS,
    )
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> arrayOf(
      Manifest.permission.READ_MEDIA_IMAGES,
      Manifest.permission.READ_MEDIA_VIDEO,
      Manifest.permission.POST_NOTIFICATIONS,
    )
    else -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
  }

  @Deprecated("Activity result API needs registration before onCreate; this request is page-driven.")
  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode != PHOTO_REQUEST) return
    webView?.evaluateJavascript(
      "window.dispatchEvent(new CustomEvent('$PHOTO_EVENT',{detail:'${photoAccess()}'}))",
      null,
    )
  }

  private fun handleShare(intent: Intent?) {
    if (intent == null) return
    val uris = when (intent.action) {
      Intent.ACTION_SEND ->
        listOfNotNull(IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java))
      Intent.ACTION_SEND_MULTIPLE ->
        IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java).orEmpty()
      else -> return
    }.ifEmpty { clipUris(intent) }.filter { it.scheme == ContentResolver.SCHEME_CONTENT }
    if (uris.isEmpty()) return
    Thread {
      val paths = uris.mapNotNull { copyToCache(it) }
      if (paths.isEmpty()) return@Thread
      synchronized(pendingShares) { pendingShares.addAll(paths) }
      runOnUiThread {
        webView?.evaluateJavascript("window.dispatchEvent(new Event('$SHARED_EVENT'))", null)
      }
    }.start()
  }

  private fun clipUris(intent: Intent): List<Uri> {
    val clip = intent.clipData ?: return emptyList()
    return (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).uri }
  }

  private fun copyToCache(uri: Uri): String? {
    val (queriedName, size) = describe(uri)
    val root = File(cacheDir, SHARE_DIR)
    if (!root.isDirectory && !root.mkdirs()) return null
    if (size != null && size + SPACE_MARGIN > root.usableSpace) return null
    val dir = File(root, UUID.randomUUID().toString())
    return try {
      if (!dir.mkdirs()) return null
      val out = File(dir, displayName(uri, queriedName))
      val input = contentResolver.openInputStream(uri) ?: throw java.io.IOException("unreadable")
      input.use { src -> out.outputStream().use { src.copyTo(it) } }
      out.absolutePath
    } catch (e: Exception) {
      dir.deleteRecursively()
      null
    }
  }

  private fun describe(uri: Uri): Pair<String?, Long?> = try {
    contentResolver.query(
      uri,
      arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE),
      null,
      null,
      null,
    )?.use {
      if (!it.moveToFirst()) return@use Pair(null, null)
      val name = if (it.isNull(0)) null else it.getString(0)
      val size = if (it.isNull(1)) null else it.getLong(1)
      Pair(name, size)
    } ?: Pair(null, null)
  } catch (e: Exception) {
    Pair(null, null)
  }

  private fun releaseShare(path: String) {
    val root = File(cacheDir, SHARE_DIR).canonicalFile
    val dir = File(path).canonicalFile.parentFile ?: return
    if (dir.parentFile == root) dir.deleteRecursively()
  }

  private fun displayName(uri: Uri, queried: String?): String {
    val name = (queried ?: uri.lastPathSegment ?: "")
      .substringAfterLast('/')
      .substringAfterLast('\\')
      .replace("\u0000", "")
      .trim()
    return if (name.isEmpty() || name == "." || name == "..") "shared-file" else name
  }

  private fun pruneShares() {
    val cutoff = System.currentTimeMillis() - SHARE_TTL_MS
    File(cacheDir, SHARE_DIR).listFiles()?.forEach {
      if (it.lastModified() < cutoff) it.deleteRecursively()
    }
  }

  private inner class Bridge {
    @JavascriptInterface
    fun isScreenCaptureAllowed(): Boolean = prefs().getBoolean(KEY_ALLOW_CAPTURE, false)

    @JavascriptInterface
    fun setScreenCaptureAllowed(allowed: Boolean) {
      prefs().edit().putBoolean(KEY_ALLOW_CAPTURE, allowed).apply()
      runOnUiThread { applyScreenSecurity() }
    }

    @JavascriptInterface
    fun takeSharedFiles(): String = synchronized(pendingShares) {
      val out = JSONArray(pendingShares)
      pendingShares.clear()
      out.toString()
    }

    @JavascriptInterface
    fun releaseSharedFile(path: String) = releaseShare(path)

    @JavascriptInterface
    fun supportsPictureInPicture(): Boolean = pipSupported()

    @JavascriptInterface
    fun setPictureInPictureReady(ready: Boolean, width: Int, height: Int) {
      runOnUiThread {
        pipReady = ready
        if (width > 0 && height > 0) pipAspect = clampAspect(width, height)
        updatePip()
      }
    }

    @JavascriptInterface
    fun enterPictureInPicture() {
      runOnUiThread { enterPip() }
    }

    @JavascriptInterface
    fun photoBackupState(): String =
      PhotoBackup.settings(this@MainActivity).toJson().put("access", photoAccess()).toString()

    @JavascriptInterface
    fun requestPhotoAccess() {
      runOnUiThread { requestPermissions(photoPermissions(), PHOTO_REQUEST) }
    }

    @JavascriptInterface
    fun setPhotoBackup(json: String) {
      val o = try {
        JSONObject(json)
      } catch (e: Exception) {
        return
      }
      PhotoBackup.apply(
        this@MainActivity,
        PhotoBackup.Settings(
          o.optBoolean("enabled", false),
          o.optString("mode"),
          o.optString("time"),
          o.optString("network"),
        ),
      )
    }

    @JavascriptInterface
    fun runPhotoBackupNow() = PhotoBackup.runNow(this@MainActivity)

    @JavascriptInterface
    fun openAppSettings() {
      runOnUiThread {
        startActivity(
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)),
        )
      }
    }
  }

  companion object {
    private const val PREFS = "zcrypt"
    private const val KEY_ALLOW_CAPTURE = "allow_screen_capture"
    private const val SHARE_DIR = "shared"
    private const val SHARED_EVENT = "zcrypt:shared-files"
    private const val PIP_EVENT = "zcrypt:pip"
    private const val PHOTO_EVENT = "zcrypt:photo-access"
    private const val PHOTO_REQUEST = 7301
    private const val SHARE_TTL_MS = 24L * 60 * 60 * 1000
    private const val SPACE_MARGIN = 64L * 1024 * 1024
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(Bridge(), "ZcryptAndroid")
    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, windowInsets ->
      val bars = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      // Insets arrive in physical pixels; CSS wants density-independent ones.
      val d = webView.resources.displayMetrics.density
      val js = "(function(){var s=document.documentElement.style;" +
        "s.setProperty('--android-safe-top','" + (bars.top / d) + "px');" +
        "s.setProperty('--android-safe-right','" + (bars.right / d) + "px');" +
        "s.setProperty('--android-safe-bottom','" + (bars.bottom / d) + "px');" +
        "s.setProperty('--android-safe-left','" + (bars.left / d) + "px');})();"
      webView.evaluateJavascript(js, null)
      // Returned unmodified, deliberately NOT WindowInsetsCompat.CONSUMED:
      // consuming here would switch off the WebView's own native safe-area
      // forwarding on the versions that do support it. Returning the original
      // object is also what Android's docs prescribe to defeat WebView's
      // overlap-zeroing heuristic.
      windowInsets
    }
  }
}
