// Copied next to MainActivity.kt by device.yml, after `cargo tauri android
// init` (gen/android is generated and gitignored).
//
// Photo and video backup that runs with the app closed. Android's WorkManager
// starts PhotoBackupWorker on the person's schedule and network, even after a
// reboot, and the worker calls into the Rust shell (NativeBackup.runPass) to
// back up DCIM, Pictures and Movies, sealed to the account public key
// (src/photo_backup.rs). The settings live in the app's SharedPreferences so
// the worker can read them without the app running.
//
// Network is strict: "wifi" runs only on Wi-Fi or Ethernet, "mobile" only on
// mobile data, "any" on either. WorkManager's own constraint narrows the
// wait, and the worker checks the live connection before it uploads, because
// Android treats a metered Wi-Fi hotspot like mobile data.
package app.zcrypt.desktop

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.Calendar
import java.util.concurrent.TimeUnit
import org.json.JSONObject

object NativeBackup {
  init {
    System.loadLibrary("zcrypt_desktop")
  }

  /** One backup run. 0 done, 1 try again later, 2 stop (signed out or turned off). */
  @JvmStatic external fun runPass(dataDir: String): Int
}

object PhotoBackup {
  private const val PREFS = "zcrypt"
  private const val KEY_SETTINGS = "photo_backup"
  private const val WORK = "photo-backup"
  private const val WORK_NOW = "photo-backup-now"

  data class Settings(val enabled: Boolean, val mode: String, val time: String, val network: String) {
    fun toJson(): JSONObject = JSONObject()
      .put("enabled", enabled)
      .put("mode", mode)
      .put("time", time)
      .put("network", network)
  }

  private val DEFAULT = Settings(false, "instant", "02:00", "wifi")

  fun settings(context: Context): Settings {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SETTINGS, null)
      ?: return DEFAULT
    return try {
      val o = JSONObject(raw)
      Settings(
        o.optBoolean("enabled", false),
        if (o.optString("mode") == "nightly") "nightly" else "instant",
        o.optString("time").takeIf { parseTime(it) != null } ?: DEFAULT.time,
        when (o.optString("network")) {
          "mobile" -> "mobile"
          "any" -> "any"
          else -> "wifi"
        },
      )
    } catch (e: Exception) {
      DEFAULT
    }
  }

  /** Saves the settings and (re)schedules, or cancels when turned off. */
  fun apply(context: Context, s: Settings) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit().putString(KEY_SETTINGS, s.toJson().toString()).apply()
    schedule(context)
  }

  fun turnOff(context: Context) {
    apply(context, settings(context).copy(enabled = false))
  }

  fun schedule(context: Context) {
    val wm = WorkManager.getInstance(context)
    val s = settings(context)
    if (!s.enabled) {
      wm.cancelUniqueWork(WORK)
      wm.cancelUniqueWork(WORK_NOW)
      return
    }
    if (s.mode == "nightly") {
      val request = OneTimeWorkRequestBuilder<PhotoBackupWorker>()
        .setConstraints(constraints(s))
        .setInitialDelay(millisUntil(s.time), TimeUnit.MILLISECONDS)
        .build()
      wm.enqueueUniqueWork(WORK, ExistingWorkPolicy.REPLACE, request)
    } else {
      val request = PeriodicWorkRequestBuilder<PhotoBackupWorker>(15, TimeUnit.MINUTES)
        .setConstraints(constraints(s))
        .build()
      wm.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, request)
    }
  }

  /** Backs up as soon as the chosen network is there, without waiting for the schedule. */
  fun runNow(context: Context) {
    val s = settings(context)
    if (!s.enabled) return
    val request = OneTimeWorkRequestBuilder<PhotoBackupWorker>().setConstraints(constraints(s)).build()
    WorkManager.getInstance(context).enqueueUniqueWork(WORK_NOW, ExistingWorkPolicy.REPLACE, request)
  }

  private fun constraints(s: Settings): Constraints = Constraints.Builder()
    .setRequiredNetworkType(
      when (s.network) {
        "mobile" -> NetworkType.METERED
        "any" -> NetworkType.CONNECTED
        else -> NetworkType.UNMETERED
      },
    )
    .setRequiresBatteryNotLow(true)
    .build()

  /** True when the live connection is one the person allowed. */
  fun networkAllowed(context: Context, network: String): Boolean {
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
    if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return false
    val wifi = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
      caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    val mobile = caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
    return when (network) {
      "mobile" -> mobile
      "any" -> wifi || mobile
      else -> wifi
    }
  }

  private fun parseTime(value: String): Pair<Int, Int>? {
    val parts = value.split(":")
    if (parts.size != 2) return null
    val h = parts[0].toIntOrNull() ?: return null
    val m = parts[1].toIntOrNull() ?: return null
    return if (h in 0..23 && m in 0..59) Pair(h, m) else null
  }

  /** Milliseconds from now until the next `HH:MM`, local time. */
  fun millisUntil(time: String, now: Calendar = Calendar.getInstance()): Long {
    val (h, m) = parseTime(time) ?: Pair(2, 0)
    val next = (now.clone() as Calendar).apply {
      set(Calendar.HOUR_OF_DAY, h)
      set(Calendar.MINUTE, m)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
      if (!after(now)) add(Calendar.DAY_OF_YEAR, 1)
    }
    return next.timeInMillis - now.timeInMillis
  }
}

class PhotoBackupWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val s = PhotoBackup.settings(applicationContext)
    if (!s.enabled) return Result.success()
    if (!PhotoBackup.networkAllowed(applicationContext, s.network)) return Result.retry()
    try {
      setForegroundAsync(foregroundInfo()).get()
    } catch (e: Exception) {
      // Android refused a foreground notice (started from the background on
      // 12+): run anyway within the normal time limit; the next run resumes.
    }
    val outcome = try {
      NativeBackup.runPass(applicationContext.dataDir.absolutePath)
    } catch (e: Throwable) {
      1
    }
    return when (outcome) {
      0 -> {
        if (s.mode == "nightly") PhotoBackup.schedule(applicationContext)
        Result.success()
      }
      2 -> {
        PhotoBackup.turnOff(applicationContext)
        Result.success()
      }
      else -> Result.retry()
    }
  }

  private fun foregroundInfo(): ForegroundInfo {
    val nm = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL, "Photo backup", NotificationManager.IMPORTANCE_LOW),
      )
    }
    val notification = NotificationCompat.Builder(applicationContext, CHANNEL)
      .setContentTitle("Backing up photos")
      .setContentText("Encrypted before it leaves your phone")
      .setSmallIcon(android.R.drawable.stat_sys_upload)
      .setOngoing(true)
      .setSilent(true)
      .build()
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ForegroundInfo(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      ForegroundInfo(NOTIFICATION_ID, notification)
    }
  }

  companion object {
    private const val CHANNEL = "photo-backup"
    private const val NOTIFICATION_ID = 7302
  }
}
