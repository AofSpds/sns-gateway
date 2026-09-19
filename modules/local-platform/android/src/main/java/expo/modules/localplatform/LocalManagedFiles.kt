package expo.modules.localplatform

import android.content.Context
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import android.system.StructStat
import java.io.File
import java.io.IOException
import java.net.URI
import java.util.UUID

/** Own files only. Only ENOENT is absence; permission and all other I/O errors fail closed. */
internal object LocalManagedFiles {
  private val hashName = Regex("[a-f0-9]{64}\\.jpg")
  private val uuid = "[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}"
  private val tempName = Regex("$uuid\\.tmp")
  private val stageName = Regex("(?:fixture-)?[0-9]+\\.jpg")
  private val activeImports = mutableSetOf<File>()
  // android.system.Os is available from API21; do not raise the existing minSdk to use NIO.
  private fun attributes(file: File): StructStat? = try { Os.lstat(file.path) }
    catch (error: ErrnoException) { if (error.errno == OsConstants.ENOENT) null else throw error }
  private fun regular(entry: StructStat) = OsConstants.S_ISREG(entry.st_mode)
  private fun directory(base: File, vararg components: String): File {
    var path = base.canonicalFile
    val root = attributes(path) ?: throw IOException("APP_ROOT_UNAVAILABLE")
    check(OsConstants.S_ISDIR(root.st_mode)) { "UNSAFE_DIRECTORY" }
    for (part in components) {
      path = File(path, part)
      val entry = attributes(path)
      check(entry == null || OsConstants.S_ISDIR(entry.st_mode)) { "UNSAFE_DIRECTORY" }
    }
    return path
  }
  private fun inbox(c: Context) = directory(c.noBackupFilesDir, "sns-gateway", "inbox")
  private fun staging(c: Context) = directory(c.cacheDir, "sns-gateway", "share")
  private data class Managed(val path: File, val kind: String)
  private fun under(file: File, root: File) = file.path.startsWith(root.path + File.separator)
  private fun normalize(c: Context, raw: File): File {
    // Resolve only trusted Context roots (e.g. /data/data aliases), never a managed child symlink.
    for (base in listOf(c.noBackupFilesDir, c.cacheDir)) {
      val logical = base.absoluteFile.normalize(); val actual = base.canonicalFile
      if (under(raw, logical)) return File(actual, raw.relativeTo(logical).path)
      if (under(raw, actual)) return raw
    }
    throw IllegalArgumentException("UNMANAGED_FILE")
  }
  private fun permitted(c: Context, raw: String): Managed {
    val uri = URI(raw)
    require(uri.scheme == "file" && uri.authority.isNullOrEmpty() && uri.query == null && uri.fragment == null)
    val path = normalize(c, File(uri).absoluteFile.normalize())
    val parent = path.parentFile
    val kind = when {
      parent == inbox(c) && hashName.matches(path.name) -> "INBOX"
      parent == inbox(c) && tempName.matches(path.name) -> "IMPORT_TEMP"
      parent?.parentFile == staging(c) && Regex(uuid).matches(parent.name) && stageName.matches(path.name) -> {
        directory(c.cacheDir, "sns-gateway", "share", parent.name); "STAGING"
      }
      else -> throw IllegalArgumentException("UNMANAGED_FILE")
    }
    val entry = attributes(path)
    require(entry == null || regular(entry)) { "NOT_A_REGULAR_FILE" }
    return Managed(path, kind)
  }
  private fun children(path: File): List<File> {
    val entry = attributes(path) ?: return emptyList() // Confirmed missing/new-install directory only.
    check(OsConstants.S_ISDIR(entry.st_mode)) { "UNSAFE_DIRECTORY" }
    return path.listFiles()?.toList() ?: throw IOException("INVENTORY_UNAVAILABLE")
  }
  @Synchronized fun inventory(c: Context): List<Map<String, Any>> {
    val files = children(inbox(c)).toMutableList()
    for (folder in children(staging(c))) {
      require(Regex(uuid).matches(folder.name)) { "UNMANAGED_DIRECTORY" }
      if (attributes(folder) == null) throw IOException("INVENTORY_CHANGED")
      files += children(folder)
    }
    return files.map { candidate ->
      val file = permitted(c, candidate.toURI().toString())
      val entry = attributes(file.path) ?: throw IOException("INVENTORY_CHANGED")
      check(regular(entry) && entry.st_size >= 0) { "INVALID_FILE_METADATA" }
      mapOf("uri" to file.path.toURI().toString(), "kind" to file.kind,
        "bytes" to entry.st_size, "modifiedAt" to entry.st_mtime * 1000L, "active" to activeImports.contains(file.path))
    }
  }
  @Synchronized fun requireSpace(c: Context, extra: Long) {
    require(extra in 0..524_288_000) { "LOCAL_STORAGE_FULL" }
    val used = inventory(c).sumOf { (it["bytes"] as Number).toLong() }
    require(used >= 0 && used <= 524_288_000 - extra) { "LOCAL_STORAGE_FULL" }
  }
  private fun removeConfirmed(file: File) {
    val entry = attributes(file)
    require(entry == null || regular(entry)) { "NOT_A_REGULAR_FILE" }
    try { Os.remove(file.path) }
    catch (error: ErrnoException) { if (error.errno != OsConstants.ENOENT) throw error }
    if (attributes(file) != null) throw IOException("DELETE_NOT_CONFIRMED")
  }
  /** One in-process lock covers writing, rename, inventory and deletion. A killed process leaves an identifiable temp. */
  @Synchronized fun <T> withImportFile(c: Context, extra: Long, write: (File) -> T): T {
    requireSpace(c, extra)
    val root = inbox(c)
    if (attributes(root) == null && !root.mkdirs()) throw IOException("INBOX_CREATE_FAILED")
    directory(c.noBackupFilesDir, "sns-gateway", "inbox")
    val temporary = File(root, UUID.randomUUID().toString() + ".tmp")
    activeImports.add(temporary)
    try {
      if (!temporary.createNewFile()) throw IOException("TEMP_ALREADY_EXISTS")
      return write(temporary)
    } finally {
      try { removeConfirmed(temporary) } finally { activeImports.remove(temporary) }
    }
  }
  @Synchronized fun storePhoto(c: Context, hash: String, bytes: ByteArray): File {
    require(hash.matches(Regex("[a-f0-9]{64}")) && bytes.size in 3..10_485_760) { "INVALID_IMAGE" }
    val target = permitted(c, File(inbox(c), "$hash.jpg").toURI().toString()).path
    if (attributes(target) == null) withImportFile(c, bytes.size.toLong()) { temporary ->
      temporary.outputStream().use { it.write(bytes); it.fd.sync() }
      Os.rename(temporary.path, target.path)
    }
    return target
  }
  @Synchronized fun delete(c: Context, uris: List<String>): List<String> {
    require(uris.size <= 100 && uris.distinct().size == uris.size)
    val files = uris.map { permitted(c, it) } // Validate every path and metadata before any mutation.
    require(files.none { activeImports.contains(it.path) }) { "IMPORT_IN_PROGRESS" }
    files.forEach { removeConfirmed(it.path) }
    // Never recursively remove parent folders. An empty directory has no photo content.
    return uris.toList()
  }
}
