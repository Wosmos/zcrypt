// Copied over the Tauri CLI's generated MainActivity by device.yml, after
// `cargo tauri android init`. It is NOT compiled from this path — gen/android
// is generated and gitignored, so this lives here to stay reviewable instead
// of being a heredoc buried in a workflow file.
//
// Two jobs:
//
// 1. enableEdgeToEdge() — kept from the CLI's own template. Draws the WebView
//    under the status and navigation bars, which is what makes the safe-area
//    CSS in globals.css mean anything on Android 14 and below. (On Android 15+
//    the OS enforces it anyway, because targetSdk is 36.)
//
// 2. Publishing the window insets as --android-safe-* CSS variables. Drawing
//    edge-to-edge is necessary but not sufficient: the WebView also has to
//    forward those insets into env(safe-area-inset-*), and that support is
//    gated on the Android System WebView's OWN version — partial in M136,
//    unconditional only from M144. WebView updates through Play independently
//    of the OS, so a phone on a stale or sideloaded WebView reports 0px for all
//    four insets and renders the UI under the notch. That is precisely the bug
//    the safe-area work was meant to fix, on precisely the devices least likely
//    to be up to date. globals.css max()es these against env(), so whichever
//    source reports a real inset wins and the two never fight.
//
// The package must equal tauri.conf.json's `identifier`; device.yml asserts it.
package app.zcrypt.desktop

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
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
