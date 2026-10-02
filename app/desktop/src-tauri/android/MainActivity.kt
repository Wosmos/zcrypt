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
//    vault collects them through `ZcryptAndroid.takeSharedFiles()`.
//
// The package must equal tauri.conf.json's `identifier`; device.yml asserts it.
package app.zcrypt.desktop

import android.content.ContentResolver
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.content.IntentCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File
import java.util.UUID
import org.json.JSONArray

class MainActivity : TauriActivity() {
  private var webView: WebView? = null
  private val pendingShares = mutableListOf<String>()

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    applyScreenSecurity()
    super.onCreate(savedInstanceState)
    if (savedInstanceState == null) {
      pruneShares()
      handleShare(intent)
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handleShare(intent)
  }

  private fun prefs() = getSharedPreferences(PREFS, MODE_PRIVATE)

  private fun applyScreenSecurity() {
    if (prefs().getBoolean(KEY_ALLOW_CAPTURE, false)) {
      window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    } else {
      window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
    }
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
    return try {
      val dir = File(File(cacheDir, SHARE_DIR), UUID.randomUUID().toString())
      if (!dir.mkdirs()) return null
      val out = File(dir, displayName(uri))
      val input = contentResolver.openInputStream(uri) ?: return null
      input.use { src -> out.outputStream().use { src.copyTo(it) } }
      out.absolutePath
    } catch (e: Exception) {
      null
    }
  }

  private fun displayName(uri: Uri): String {
    val queried = try {
      contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
        if (it.moveToFirst()) it.getString(0) else null
      }
    } catch (e: Exception) {
      null
    }
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
  }

  companion object {
    private const val PREFS = "zcrypt"
    private const val KEY_ALLOW_CAPTURE = "allow_screen_capture"
    private const val SHARE_DIR = "shared"
    private const val SHARED_EVENT = "zcrypt:shared-files"
    private const val SHARE_TTL_MS = 24L * 60 * 60 * 1000
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
