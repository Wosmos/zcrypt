// Copied next to MainActivity.kt by device.yml, after `cargo tauri android
// init` (gen/android is generated and gitignored).
//
// Photo and video backup reads Android's MediaStore, the same index the
// Gallery and Google Photos use, instead of walking folders. That finds media
// other apps keep under Android/media (WhatsApp, Telegram), groups it by
// album (bucket), and returns only what the person allowed when Android 14
// "selected photos" access is on. Items are opened through the content
// resolver and handed to Rust as a detached file descriptor: no file paths.
//
// Rust calls listMedia() and openFd() on an instance of MediaStoreSource over
// JNI (src/photo_backup.rs); the settings page calls MediaAlbums through the
// ZcryptAndroid bridge in MainActivity.kt.
package app.zcrypt.desktop

import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.database.Cursor
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
import android.util.Size
import androidx.annotation.Keep
import java.io.ByteArrayOutputStream
import org.json.JSONArray
import org.json.JSONObject

private const val LEGACY_VOLUME = "external"

private fun volumes(context: Context): List<String> =
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
    MediaStore.getExternalVolumeNames(context).toList()
  } else {
    listOf(LEGACY_VOLUME)
  }

private fun contentUri(volume: String, video: Boolean): Uri =
  if (video) MediaStore.Video.Media.getContentUri(volume) else MediaStore.Images.Media.getContentUri(volume)

/** One row of an images or video table, before it is shaped as JSON. */
private class Row(
  val volume: String,
  val video: Boolean,
  val id: Long,
  val bucketId: String,
  val bucket: String,
  val relativePath: String,
  val name: String,
  val size: Long,
  val modifiedSeconds: Long,
  val takenMillis: Long,
  val mime: String,
  val generation: Long,
) {
  val uri: Uri get() = ContentUris.withAppendedId(contentUri(volume, video), id)
}

@Suppress("DEPRECATION")
private fun projection(): Array<String> {
  val base = mutableListOf(
    MediaStore.MediaColumns._ID,
    MediaStore.MediaColumns.BUCKET_ID,
    MediaStore.MediaColumns.BUCKET_DISPLAY_NAME,
    MediaStore.MediaColumns.DISPLAY_NAME,
    MediaStore.MediaColumns.SIZE,
    MediaStore.MediaColumns.DATE_ADDED,
    MediaStore.MediaColumns.DATE_MODIFIED,
    MediaStore.MediaColumns.MIME_TYPE,
    MediaStore.MediaColumns.DATE_TAKEN,
  )
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
    base += MediaStore.MediaColumns.RELATIVE_PATH
  } else {
    base += MediaStore.MediaColumns.DATA
  }
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
    base += MediaStore.MediaColumns.GENERATION_ADDED
    base += MediaStore.MediaColumns.GENERATION_MODIFIED
  }
  return base.toTypedArray()
}

/** "DCIM/Camera/" from a pre-Android-10 absolute path, the way RELATIVE_PATH reports it. */
private fun relativeFromData(data: String?, name: String): String {
  if (data.isNullOrEmpty()) return ""
  val marker = "/storage/emulated/0/"
  val rel = if (data.startsWith(marker)) data.removePrefix(marker) else data.trimStart('/')
  return rel.removeSuffix(name)
}

@Suppress("DEPRECATION")
private fun readRow(c: Cursor, volume: String, video: Boolean): Row {
  fun str(col: String): String = c.getColumnIndex(col).let { if (it < 0 || c.isNull(it)) "" else c.getString(it) }
  fun num(col: String): Long = c.getColumnIndex(col).let { if (it < 0 || c.isNull(it)) 0L else c.getLong(it) }
  val name = str(MediaStore.MediaColumns.DISPLAY_NAME)
  val relative = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
    str(MediaStore.MediaColumns.RELATIVE_PATH)
  } else {
    relativeFromData(str(MediaStore.MediaColumns.DATA), name)
  }
  val modified = num(MediaStore.MediaColumns.DATE_MODIFIED).takeIf { it > 0 }
    ?: num(MediaStore.MediaColumns.DATE_ADDED)
  val generation = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
    maxOf(num(MediaStore.MediaColumns.GENERATION_ADDED), num(MediaStore.MediaColumns.GENERATION_MODIFIED))
  } else {
    0L
  }
  return Row(
    volume = volume,
    video = video,
    id = num(MediaStore.MediaColumns._ID),
    bucketId = str(MediaStore.MediaColumns.BUCKET_ID),
    bucket = str(MediaStore.MediaColumns.BUCKET_DISPLAY_NAME),
    relativePath = relative,
    name = name,
    size = num(MediaStore.MediaColumns.SIZE),
    modifiedSeconds = modified,
    takenMillis = num(MediaStore.MediaColumns.DATE_TAKEN).takeIf { it > 0 } ?: (modified * 1000),
    mime = str(MediaStore.MediaColumns.MIME_TYPE),
    generation = generation,
  )
}

/**
 * Walks the images and video tables of every external volume. `buckets` empty
 * means every album; `since` maps a volume to the generation already seen, so
 * only newer or changed rows come back (Android 11+, ignored before).
 */
private fun scan(
  context: Context,
  buckets: List<String>,
  images: Boolean,
  videos: Boolean,
  since: Map<String, Long>,
  onRow: (Row) -> Unit,
) {
  val resolver: ContentResolver = context.contentResolver
  for (volume in volumes(context)) {
    for (video in listOf(false, true)) {
      if (video && !videos || !video && !images) continue
      val clauses = mutableListOf<String>()
      val args = mutableListOf<String>()
      if (buckets.isNotEmpty()) {
        clauses += "${MediaStore.MediaColumns.BUCKET_ID} IN (${buckets.joinToString(",") { "?" }})"
        args += buckets
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        clauses += "${MediaStore.MediaColumns.IS_PENDING} = 0"
      }
      val seen = since[volume]
      if (seen != null && seen > 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        clauses += "(${MediaStore.MediaColumns.GENERATION_ADDED} > ? OR ${MediaStore.MediaColumns.GENERATION_MODIFIED} > ?)"
        args += seen.toString()
        args += seen.toString()
      }
      val cursor = resolver.query(
        contentUri(volume, video),
        projection(),
        clauses.joinToString(" AND ").ifEmpty { null },
        args.toTypedArray().ifEmpty { null },
        "${MediaStore.MediaColumns.DATE_ADDED} DESC",
      ) ?: continue
      cursor.use { while (it.moveToNext()) onRow(readRow(it, volume, video)) }
    }
  }
}

/** What Rust's `MediaSource` reads: the items to back up, and each one's bytes. */
@Keep
class MediaStoreSource(private val context: Context) {
  /**
   * `{"buckets":["id"],"kinds":"photos|videos|both","since":{"volume":gen}}` in,
   * `{"items":[...]}` or `{"error":"..."}` out. Only items the app may read
   * appear, so partial access just returns fewer.
   */
  @Keep
  fun listMedia(queryJson: String): String = try {
    val q = JSONObject(queryJson)
    val kinds = q.optString("kinds", "both")
    val buckets = q.optJSONArray("buckets")?.let { a -> List(a.length()) { a.getString(it) } } ?: emptyList()
    val since = q.optJSONObject("since")?.let { o -> o.keys().asSequence().associateWith { o.getLong(it) } } ?: emptyMap()
    val items = JSONArray()
    scan(context, buckets, kinds != "videos", kinds != "photos", since) { r ->
      items.put(
        JSONObject()
          .put("uri", r.uri.toString())
          .put("volume", r.volume)
          .put("id", r.id)
          .put("bucket_id", r.bucketId)
          .put("bucket", r.bucket)
          .put("rel", r.relativePath)
          .put("name", r.name)
          .put("size", r.size)
          .put("modified", r.modifiedSeconds)
          .put("taken", r.takenMillis)
          .put("mime", r.mime)
          .put("video", r.video)
          .put("gen", r.generation),
      )
    }
    JSONObject().put("items", items).toString()
  } catch (e: SecurityException) {
    JSONObject().put("error", "denied").toString()
  } catch (e: Exception) {
    JSONObject().put("error", e.message ?: e.javaClass.simpleName).toString()
  }

  /**
   * A detached file descriptor for the item, owned by the caller (Rust closes
   * it), or -1 when it can't be opened, for example it was just deleted.
   */
  @Keep
  fun openFd(uri: String): Int = try {
    context.contentResolver.openFileDescriptor(Uri.parse(uri), "r")?.detachFd() ?: -1
  } catch (e: Exception) {
    -1
  }
}

/** The album list for the settings page. */
object MediaAlbums {
  private class Album(val bucketId: String, var name: String, var relativePath: String, var cover: String) {
    var images = 0
    var videos = 0
    var coverAdded = Long.MIN_VALUE
  }

  /**
   * `[{bucket_id, name, count, cover_uri, kind, camera}]`, largest album first.
   * `kind` is "photos", "videos" or "mixed". An empty list when nothing is allowed.
   */
  fun list(context: Context): String = try {
    val albums = LinkedHashMap<String, Album>()
    scan(context, emptyList(), true, true, emptyMap()) { r ->
      if (r.bucketId.isEmpty()) return@scan
      val a = albums.getOrPut(r.bucketId) { Album(r.bucketId, r.bucket, r.relativePath, r.uri.toString()) }
      if (r.video) a.videos++ else a.images++
      if (r.modifiedSeconds > a.coverAdded) {
        a.coverAdded = r.modifiedSeconds
        a.cover = r.uri.toString()
      }
      if (a.name.isEmpty()) a.name = r.bucket
    }
    val out = JSONArray()
    albums.values.sortedByDescending { it.images + it.videos }.forEach { a ->
      out.put(
        JSONObject()
          .put("bucket_id", a.bucketId)
          .put("name", a.name.ifEmpty { a.relativePath.trimEnd('/').substringAfterLast('/') })
          .put("count", a.images + a.videos)
          .put("cover_uri", a.cover)
          .put("kind", if (a.videos == 0) "photos" else if (a.images == 0) "videos" else "mixed")
          .put("camera", a.relativePath.equals("DCIM/Camera/", true) || a.name.equals("Camera", true)),
      )
    }
    out.toString()
  } catch (e: Exception) {
    "[]"
  }

  /** A 160px JPEG of the item as base64, or "" when Android can't make one. */
  fun thumbnail(context: Context, uri: String): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return ""
    return try {
      val bmp = context.contentResolver.loadThumbnail(Uri.parse(uri), Size(160, 160), null)
      val out = ByteArrayOutputStream()
      bmp.compress(Bitmap.CompressFormat.JPEG, 70, out)
      Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    } catch (e: Exception) {
      ""
    }
  }
}
