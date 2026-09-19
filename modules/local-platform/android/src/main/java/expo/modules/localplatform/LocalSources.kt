package expo.modules.localplatform

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import java.security.MessageDigest
import java.util.UUID

/** One user-selected local folder. Never recursively enumerates or opens cloud providers. */
internal class LocalSources(private val context: Context) {
  private val prefs = context.getSharedPreferences("snsg-source", Context.MODE_PRIVATE)
  private fun hash(s: String) = MessageDigest.getInstance("SHA-256").digest(s.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
  private data class Entry(val key: String, val uri: Uri)
  private fun entries(tree: Uri): List<Entry> {
    require(tree.scheme == "content" && tree.authority == "com.android.externalstorage.documents" && DocumentsContract.isTreeUri(tree)) { "LOCAL_FOLDER_REQUIRED" }
    check(context.contentResolver.persistedUriPermissions.any { it.uri == tree && it.isReadPermission }) { "SOURCE_PERMISSION_REQUIRED" }
    val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
    val projection = arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_MIME_TYPE,
      DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_LAST_MODIFIED, DocumentsContract.Document.COLUMN_SIZE)
    val result = mutableListOf<Entry>()
    val cursor = context.contentResolver.query(children, projection, null, null, null) ?: error("SOURCE_UNAVAILABLE")
    cursor.use {
      var count = 0
      while (it.moveToNext()) {
        check(++count <= 2000) { "SOURCE_TOO_LARGE" } // Fail the entire snapshot; never commit a partial baseline.
        val id = it.getString(0); val mime = it.getString(1) ?: ""; val name = it.getString(2) ?: ""
        if (!mime.startsWith("image/") || name.startsWith(".") || name.endsWith(".tmp", true)) continue
        val revision = id + ":" + (if (it.isNull(3)) "unknown" else it.getLong(3).toString()) + ":" + (if (it.isNull(4)) "unknown" else it.getLong(4).toString())
        result.add(Entry(hash(revision), DocumentsContract.buildDocumentUriUsingTree(tree, id)))
      }
    }
    check(result.map { it.key }.distinct().size == result.size) { "SOURCE_CHANGED" }
    return result
  }
  private fun snapshot(tree: Uri, id: String, label: String): Map<String, Any> = mapOf(
    "sourceId" to id, "kind" to "android_folder", "label" to label, "items" to entries(tree).map { it.key })
  fun connect(data: Intent): Map<String, Any> {
    val tree = requireNotNull(data.data) { "NO_FOLDER" }
    require(tree.authority == "com.android.externalstorage.documents" && DocumentsContract.isTreeUri(tree)) { "LOCAL_FOLDER_REQUIRED" }
    val old = prefs.getString("uri", null)
    val take = data.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION
    require(take != 0)
    context.contentResolver.takePersistableUriPermission(tree, take)
    try {
      val doc = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
      val label = context.contentResolver.query(doc, arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null)?.use {
        if (it.moveToFirst()) it.getString(0) else null
      }?.take(300) ?: "선택 폴더"
      val id = hash(UUID.randomUUID().toString() + tree.toString())
      val result = snapshot(tree, id, label)
      check(prefs.edit().putString("uri", tree.toString()).putString("id", id).putString("label", label).commit()) { "SOURCE_STORE_FAILED" }
      if (old != null && old != tree.toString()) try { context.contentResolver.releasePersistableUriPermission(Uri.parse(old), Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: Exception) { }
      return result
    } catch (error: Exception) {
      if (old != tree.toString()) try { context.contentResolver.releasePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: Exception) { }
      throw error
    }
  }
  fun scan(): Map<String, Any>? {
    val raw = prefs.getString("uri", null) ?: return null
    return snapshot(Uri.parse(raw), requireNotNull(prefs.getString("id", null)), prefs.getString("label", "선택 폴더")!!)
  }
  fun importSelected(sourceId: String, keys: List<String>): Map<String, Any> {
    require(keys.size in 1..10 && keys.distinct().size == keys.size && keys.all { it.matches(Regex("[a-f0-9]{64}")) })
    check(sourceId == prefs.getString("id", null)) { "SOURCE_CHANGED" }
    val available = entries(Uri.parse(requireNotNull(prefs.getString("uri", null)))).associateBy { it.key }
    val records = mutableListOf<Map<String, Any>>()
    var skipped = 0
    for (key in keys) {
      val entry = available[key]
      if (entry == null) { skipped++; continue }
      val response = LocalPhotos(context).importPhotos(listOf(entry.uri))
      @Suppress("UNCHECKED_CAST") val photos = response["photos"] as List<Map<String, Any>>
      if (photos.isEmpty()) skipped++ else records.add(mapOf("entryKey" to key, "photo" to photos[0]))
    }
    return mapOf("records" to records, "skipped" to skipped)
  }
  fun disconnect() {
    val old = prefs.getString("uri", null)
    check(prefs.edit().clear().commit()) { "SOURCE_STORE_FAILED" }
    if (old != null) try { context.contentResolver.releasePersistableUriPermission(Uri.parse(old), Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: Exception) { }
  }
}
