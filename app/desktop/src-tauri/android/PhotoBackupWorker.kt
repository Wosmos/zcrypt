// Copied next to MainActivity.kt by device.yml, after `cargo tauri android
// init` (gen/android is generated and gitignored).
//
// Photo and video backup that runs with the app closed. Android's WorkManager
// starts PhotoBackupWorker on the person's schedule and network, even after a
// reboot, and the worker calls into the Rust shell (NativeBackup.runPass) to
// back up the albums the person chose from Android's media library
// (MediaStoreSource.kt), sealed to the account public key
// (src/photo_backup.rs). The settings live in the app's SharedPreferences so
// the worker can read them without the app running.
//
// Two triggers keep it current. A work request that waits on a MediaStore
// content change starts a run soon after a new photo lands, and enqueues the
// next one when it finishes; Android drops such triggers when the app is
// force-stopped, so a periodic request every six hours catches up after that.
// "Wi-Fi only" is WorkManager's UNMETERED network constraint and is checked
// again on the live connection (a metered Wi-Fi hotspot counts as mobile
// data); "while charging" is the charging constraint.
package app.zcrypt.desktop

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.provider.MediaStore
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit
import org.json.JSONObject

object NativeBackup {
  init {
    System.loadLibrary("zcrypt_desktop")
  }

  /** One backup run. 0 done, 1 try again later, 2 stop (signed out or turned off). */
  @JvmStatic external fun runPass(dataDir: String, source: MediaStoreSource): Int

  /** Stops the run in flight; called when WorkManager stops the worker. */
  @JvmStatic external fun cancel()

  /** The result notice the last run left as "title\nbody", or null when there is none. */
  @JvmStatic external fun takeSummary(): String?
}

object PhotoBackup {
  private const val PREFS = "zcrypt"
  private const val KEY_SETTINGS = "photo_backup"
  private const val WORK_PERIODIC = "photo-backup"
  private const val WORK_TRIGGER = "photo-backup-trigger"
  private const val WORK_NOW = "photo-backup-now"
  const val INPUT_TRIGGER = "trigger"
  private const val PERIODIC_HOURS = 6L
  private const val TRIGGER_DELAY_SECONDS = 30L
  private const val TRIGGER_MAX_DELAY_MINUTES = 10L

  data class Settings(val enabled: Boolean, val wifiOnly: Boolean, val chargingOnly: Boolean) {
    fun toJson(): JSONObject = JSONObject()
      .put("enabled", enabled)
      .put("wifi_only", wifiOnly)
      .put("charging_only", chargingOnly)
  }

  private val DEFAULT = Settings(false, true, false)

  fun settings(context: Context): Settings {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SETTINGS, null)
      ?: return DEFAULT
    return try {
      val o = JSONObject(raw)
      Settings(
        o.optBoolean("enabled", false),
        // Earlier versions saved a network choice: only "wifi" meant Wi-Fi only.
        if (o.has("wifi_only")) o.optBoolean("wifi_only", true) else o.optString("network", "wifi") == "wifi",
        o.optBoolean("charging_only", false),
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

  /** Starts the change trigger and the periodic fallback, or cancels both when turned off. */
  fun schedule(context: Context) {
    val wm = WorkManager.getInstance(context)
    val s = settings(context)
    if (!s.enabled) {
      wm.cancelUniqueWork(WORK_PERIODIC)
      wm.cancelUniqueWork(WORK_TRIGGER)
      wm.cancelUniqueWork(WORK_NOW)
      return
    }
    val periodic = PeriodicWorkRequestBuilder<PhotoBackupWorker>(PERIODIC_HOURS, TimeUnit.HOURS)
      .setConstraints(constraints(s))
      .build()
    wm.enqueueUniquePeriodicWork(WORK_PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, periodic)
    enqueueTrigger(context, s, ExistingWorkPolicy.REPLACE)
  }

  /**
   * Waits for a change to the photo or video library. The worker calls this
   * with APPEND_OR_REPLACE when it finishes, so the next change starts the next run.
   */
  fun enqueueTrigger(context: Context, s: Settings, policy: ExistingWorkPolicy) {
    val request = OneTimeWorkRequestBuilder<PhotoBackupWorker>()
      .setConstraints(
        constraintsBuilder(s)
          .addContentUriTrigger(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true)
          .addContentUriTrigger(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, true)
          .setTriggerContentUpdateDelay(TRIGGER_DELAY_SECONDS, TimeUnit.SECONDS)
          .setTriggerContentMaxDelay(TRIGGER_MAX_DELAY_MINUTES, TimeUnit.MINUTES)
          .build(),
      )
      .setInputData(Data.Builder().putBoolean(INPUT_TRIGGER, true).build())
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork(WORK_TRIGGER, policy, request)
  }

  /** Backs up as soon as the chosen network and power are there, without waiting for a change. */
  fun runNow(context: Context) {
    val s = settings(context)
    if (!s.enabled) return
    val request = OneTimeWorkRequestBuilder<PhotoBackupWorker>().setConstraints(constraints(s)).build()
    WorkManager.getInstance(context).enqueueUniqueWork(WORK_NOW, ExistingWorkPolicy.REPLACE, request)
  }

  private fun constraintsBuilder(s: Settings): Constraints.Builder = Constraints.Builder()
    .setRequiredNetworkType(if (s.wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED)
    .setRequiresCharging(s.chargingOnly)
    .setRequiresBatteryNotLow(true)

  private fun constraints(s: Settings): Constraints = constraintsBuilder(s).build()

  /** True when the live connection is one the person allowed. */
  fun networkAllowed(context: Context, wifiOnly: Boolean): Boolean {
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
    if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return false
    if (!wifiOnly) return true
    return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) &&
      (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET))
  }
}

class PhotoBackupWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val s = PhotoBackup.settings(applicationContext)
    if (!s.enabled) return Result.success()
    if (!PhotoBackup.networkAllowed(applicationContext, s.wifiOnly)) return Result.retry()
    try {
      setForegroundAsync(foregroundInfo()).get()
    } catch (e: Exception) {
      // Android refused a foreground notice (started from the background on
      // 12+): run anyway within the normal time limit; the next run resumes.
    }
    if (isStopped) return Result.retry()
    val outcome = try {
      NativeBackup.runPass(applicationContext.dataDir.absolutePath, MediaStoreSource(applicationContext))
    } catch (e: Throwable) {
      1
    }
    try {
      NativeBackup.takeSummary()?.let { postResult(it) }
    } catch (e: Throwable) {
      // No notice is better than a failed run.
    }
    return when (outcome) {
      0 -> {
        if (inputData.getBoolean(PhotoBackup.INPUT_TRIGGER, false)) {
          PhotoBackup.enqueueTrigger(applicationContext, s, ExistingWorkPolicy.APPEND_OR_REPLACE)
        }
        Result.success()
      }
      2 -> {
        PhotoBackup.turnOff(applicationContext)
        Result.success()
      }
      else -> Result.retry()
    }
  }

  override fun onStopped() {
    try {
      NativeBackup.cancel()
    } catch (e: Throwable) {
      // The native library never loaded, so there is no run to stop.
    }
  }

  private fun postResult(summary: String) {
    val (title, body) = summary.split("\n", limit = 2).let { Pair(it[0], it.getOrElse(1) { "" }) }
    val nm = NotificationManagerCompat.from(applicationContext)
    if (!nm.areNotificationsEnabled()) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(
        NotificationChannel(RESULT_CHANNEL, "Backup results", NotificationManager.IMPORTANCE_DEFAULT),
      )
    }
    val launch = applicationContext.packageManager.getLaunchIntentForPackage(applicationContext.packageName)
    val tap = launch?.let {
      PendingIntent.getActivity(applicationContext, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val notification = NotificationCompat.Builder(applicationContext, RESULT_CHANNEL)
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(android.R.drawable.stat_sys_upload_done)
      .setContentIntent(tap)
      .setAutoCancel(true)
      .build()
    nm.notify(RESULT_NOTIFICATION_ID, notification)
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
    private const val RESULT_CHANNEL = "backup-results"
    private const val RESULT_NOTIFICATION_ID = 7303
  }
}
