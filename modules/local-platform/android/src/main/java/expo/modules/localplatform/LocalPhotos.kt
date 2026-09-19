package expo.modules.localplatform

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.URI
import java.security.MessageDigest
import java.util.UUID
import kotlin.math.max

/** No uploader: only selected local document providers and app-private files. */
internal class LocalPhotos(private val context: Context) {
  private fun root() = File(context.noBackupFilesDir, "sns-gateway/inbox").apply { check(mkdirs() || isDirectory) }.canonicalFile
  private fun hash(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
  private fun record(file: File): Map<String, Any> {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, bounds)
    require(bounds.outWidth in 1..2048 && bounds.outHeight in 1..2048 && file.length() in 3..10485760) { "INVALID_IMAGE" }
    return mapOf("id" to file.nameWithoutExtension, "uri" to file.toURI().toString(), "bytes" to file.length(), "width" to bounds.outWidth, "height" to bounds.outHeight)
  }
  fun inventory(): List<Map<String, Any>> = root().listFiles().orEmpty()
    .filter { it.isFile && it.name.matches(Regex("[a-f0-9]{64}\\.jpg")) }
    .mapNotNull { try { record(it) } catch (_: Exception) { null } }

  fun importPhotos(uris: List<Uri>): Map<String, Any> {
    require(uris.size in 1..10)
    val photos = mutableListOf<Map<String, Any>>()
    var skipped = 0
    for (uri in uris.distinct()) {
      try {
        // Reject cloud document providers instead of downloading their originals.
        require(uri.scheme == "content" && uri.authority in setOf("com.android.externalstorage.documents", "com.android.providers.media.documents", "media")) { "LOCAL_PROVIDER_REQUIRED" }
        require(android.os.Build.VERSION.SDK_INT >= 28) { "ANDROID_9_REQUIRED" }
        val bitmap = ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
          val w = info.size.width; val h = info.size.height
          require(w > 0 && h > 0 && w.toLong() * h <= 80_000_000) { "IMAGE_TOO_LARGE" }
          val ratio = max(1.0, max(w, h).toDouble() / 2048.0)
          decoder.setTargetSize(max(1, (w / ratio).toInt()), max(1, (h / ratio).toInt()))
          decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
        val bytes = try { ByteArrayOutputStream().use { out -> check(bitmap.compress(Bitmap.CompressFormat.JPEG, 90, out)); out.toByteArray() } } finally { bitmap.recycle() }
        require(bytes.size in 3..10485760)
        val file = File(root(), hash(bytes) + ".jpg")
        if (!file.exists()) {
          val used = root().listFiles().orEmpty().sumOf { it.length() }
          require(used + bytes.size <= 524_288_000) { "INBOX_FULL" }
          val temporary = File(root(), UUID.randomUUID().toString() + ".tmp")
          try { temporary.writeBytes(bytes); check(temporary.renameTo(file)) } finally { temporary.delete() }
        }
        photos.add(record(file))
      } catch (_: Exception) { skipped++ }
    }
    return mapOf("photos" to photos, "skipped" to skipped)
  }

  fun stage(paths: List<String>): List<String> {
    require(paths.size in 1..10 && paths.distinct().size == paths.size)
    val files = paths.map { raw ->
      val uri = URI(raw)
      require(uri.scheme == "file" && uri.authority.isNullOrEmpty() && uri.query == null && uri.fragment == null)
      val file = File(uri).canonicalFile
      require(file.parentFile == root() && file.isFile && file.name.matches(Regex("[a-f0-9]{64}\\.jpg")))
      record(file)
      require(hash(file.readBytes()) == file.nameWithoutExtension)
      file
    }
    val destination = File(context.cacheDir, "sns-gateway/share/" + UUID.randomUUID()).apply { check(mkdirs()) }
    // All selected files are validated before any share intent is opened.
    return files.mapIndexed { i, file -> file.copyTo(File(destination, "$i.jpg")).toURI().toString() }
  }
}
