package expo.modules.localplatform

import android.content.Context
import java.io.File
import java.net.URI

internal object LocalManagedFiles {
  private fun inbox(c: Context) = File(c.noBackupFilesDir, "sns-gateway/inbox").canonicalFile
  private fun staging(c: Context) = File(c.cacheDir, "sns-gateway/share").canonicalFile
  private fun permitted(c: Context, raw: String): File {
    val uri = URI(raw)
    require(uri.scheme == "file" && uri.authority.isNullOrEmpty() && uri.query == null && uri.fragment == null)
    val file = File(uri).canonicalFile
    val inInbox = file.parentFile == inbox(c) && file.name.matches(Regex("[a-f0-9]{64}\\.jpg"))
    val inStage = file.parentFile?.parentFile == staging(c) && file.parentFile!!.name.matches(Regex("[A-Fa-f0-9-]{36}")) && file.name.matches(Regex("(?:fixture-)?[0-9]+\\.jpg"))
    require(inInbox || inStage) { "UNMANAGED_FILE" }
    require(!file.exists() || file.isFile) { "NOT_A_FILE" }
    return file
  }
  fun inventory(c: Context): List<Map<String, Any>> {
    val files = inbox(c).listFiles().orEmpty().toList() + staging(c).listFiles().orEmpty().filter { it.isDirectory }.flatMap { it.listFiles().orEmpty().toList() }
    return files.mapNotNull { candidate ->
      try {
        val file = permitted(c, candidate.toURI().toString())
        if (!file.isFile) null else mapOf("uri" to file.toURI().toString(), "kind" to if (file.parentFile == inbox(c)) "INBOX" else "STAGING", "bytes" to file.length(), "modifiedAt" to file.lastModified())
      } catch (_: Exception) { null }
    }
  }
  fun requireSpace(c: Context, extra: Long) {
    require(extra >= 0 && inventory(c).sumOf { (it["bytes"] as Number).toLong() } + extra <= 524_288_000) { "LOCAL_STORAGE_FULL" }
  }
  fun delete(c: Context, uris: List<String>): List<String> {
    require(uris.size <= 100 && uris.distinct().size == uris.size)
    val files = uris.map { permitted(c, it) } // Validate all paths before deleting any file.
    return uris.zip(files).mapNotNull { (uri, file) ->
      if (!file.exists() || file.delete()) {
        val parent = file.parentFile
        if (parent?.parentFile == staging(c) && parent.listFiles()?.isEmpty() == true) parent.delete()
        uri
      } else null
    }
  }
}
