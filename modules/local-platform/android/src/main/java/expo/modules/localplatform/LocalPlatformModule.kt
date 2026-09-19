package expo.modules.localplatform

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.Build
import android.os.PersistableBundle
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.URI
import java.util.UUID

class LocalPlatformModule : Module() {
  private var pickerPromise: Promise? = null
  private val pickerCode = 59311
  private val folderCode = 59312
  private fun context(): Context = requireNotNull(appContext.reactContext) { "CONTEXT_UNAVAILABLE" }
  private fun root(): File = File(context().cacheDir, "sns-gateway/share").apply { mkdirs() }.canonicalFile

  private fun allowedFile(raw: String): File {
    val uri = URI(raw)
    require(uri.scheme == "file" && uri.authority.isNullOrEmpty() && uri.query == null && uri.fragment == null) { "LOCAL_FILE_REQUIRED" }
    val file = File(uri).canonicalFile
    require(file.path.startsWith(root().path + File.separator) && file.isFile && file.length() in 3..10485760) { "FILE_NOT_ALLOWED" }
    require(file.extension.lowercase() == "jpg") { "JPEG_ONLY" }
    file.inputStream().use { require(it.read() == 255 && it.read() == 216) { "JPEG_ONLY" } }
    return file
  }

  override fun definition() = ModuleDefinition {
    Name("LocalPlatform")

    AsyncFunction("pickPhotos") { promise: Promise ->
      try {
        check(pickerPromise == null) { "PICKER_BUSY" }
        val activity = requireNotNull(appContext.currentActivity)
        pickerPromise = promise
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          type = "image/*"; addCategory(Intent.CATEGORY_OPENABLE)
          putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true); putExtra(Intent.EXTRA_LOCAL_ONLY, true)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        activity.startActivityForResult(intent, pickerCode)
      } catch (_: Exception) { pickerPromise = null; promise.reject("PICKER_FAILED", "Open the app and select local photos.", null) }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("connectSource") { promise: Promise ->
      try {
        check(pickerPromise == null) { "PICKER_BUSY" }
        val activity = requireNotNull(appContext.currentActivity)
        pickerPromise = promise
        activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
          putExtra(Intent.EXTRA_LOCAL_ONLY, true)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }, folderCode)
      } catch (_: Exception) { pickerPromise = null; promise.reject("SOURCE_PICKER_FAILED", "Select a local folder.", null) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("scanSource") { LocalSources(context()).scan() }
    AsyncFunction("importSource") { id: String, keys: List<String> -> LocalSources(context()).importSelected(id, keys) }
    AsyncFunction("disconnectSource") { LocalSources(context()).disconnect() }
    AsyncFunction("managedFiles") { LocalManagedFiles.inventory(context()) }
    AsyncFunction("deleteManagedFiles") { uris: List<String> -> LocalManagedFiles.delete(context(), uris) }
    AsyncFunction("pendingReminder") { LocalReminders.pendingOpen(context(), appContext.currentActivity?.intent) }
    AsyncFunction("acknowledgeReminder") { token: String -> LocalReminders.acknowledge(context(), token) }
    OnNewIntent { intent -> LocalReminders.captureOpen(context(), intent) }

    OnActivityResult { _, payload ->
      if (payload.requestCode == folderCode) {
        val promise = pickerPromise; pickerPromise = null
        if (promise != null) {
          if (payload.resultCode != android.app.Activity.RESULT_OK || payload.data == null) promise.resolve(null)
          else {
            val ctx = context(); val data = payload.data!!
            Thread {
              try { promise.resolve(LocalSources(ctx).connect(data)) }
              catch (_: Exception) { promise.reject("SOURCE_UNAVAILABLE", "Select a readable local folder with at most 2000 entries.", null) }
            }.start()
          }
        }
      }
      if (payload.requestCode == pickerCode) {
        val promise = pickerPromise
        pickerPromise = null
        if (promise != null) {
          if (payload.resultCode != android.app.Activity.RESULT_OK) promise.resolve(mapOf("photos" to emptyList<Any>(), "skipped" to 0))
          else {
            val data = payload.data
            val uris = data?.clipData?.let { clip -> (0 until clip.itemCount).map { clip.getItemAt(it).uri } } ?: listOfNotNull(data?.data)
            val ctx = context()
            Thread {
              try { promise.resolve(LocalPhotos(ctx).importPhotos(uris)) }
              catch (_: Exception) { promise.reject("IMPORT_FAILED", "Choose 1 to 10 local images.", null) }
            }.start()
          }
        }
      }
    }
    OnDestroy { pickerPromise?.reject("PICKER_INTERRUPTED", "Open the app again.", null); pickerPromise = null }
    AsyncFunction("inventoryPhotos") { LocalPhotos(context()).inventory() }
    AsyncFunction("stagePhotos") { paths: List<String> -> LocalPhotos(context()).stage(paths) }
    AsyncFunction("reminderStatus") { LocalReminders.status(context()) }
    AsyncFunction("setReminder") { enabled: Boolean, hour: Int, minute: Int -> LocalReminders.set(context(), enabled, hour, minute) }
    AsyncFunction("testReminder") { LocalReminders.test(context()) }
    OnActivityEntersForeground { try { LocalReminders.refresh(context()) } catch (_: Exception) { } }


    AsyncFunction("storageDirectory") {
      val directory = File(context().noBackupFilesDir, "sns-gateway/db")
      check(directory.mkdirs() || directory.isDirectory) { "LOCAL_STORAGE_UNAVAILABLE" }
      directory.absolutePath
    }

    AsyncFunction("makeFixtures") { count: Int ->
      require(count == 1 || count == 3) { "FIXTURE_COUNT_INVALID" }
      LocalManagedFiles.requireSpace(context(), count * 1_048_576L)
      val directory = File(root(), UUID.randomUUID().toString()).apply { check(mkdirs()) }
      (1..count).map { index ->
        val bitmap = Bitmap.createBitmap(1080, 1080, Bitmap.Config.ARGB_8888)
        try {
          val canvas = Canvas(bitmap)
          canvas.drawColor(Color.rgb(235 - index * 8, 244 - index * 5, 245))
          val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(25, 40, 60); textSize = 54f }
          canvas.drawText("SNS Gateway", 70f, 140f, paint)
          paint.textSize = 190f
          canvas.drawText(index.toString(), 70f, 500f, paint)
          paint.textSize = 32f
          canvas.drawText("Synthetic fixture - no personal photo", 70f, 920f, paint)
          val file = File(directory, "fixture-$index.jpg")
          file.outputStream().use { check(bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it)) }
          mapOf("uri" to file.toURI().toString(), "label" to "Fixture $index")
        } finally { bitmap.recycle() }
      }
    }

    AsyncFunction("copyCaption") { caption: String ->
      require(caption.length <= 2200 && !caption.contains('\u0000')) { "INVALID_CAPTION" }
      val clipboard = context().getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      val clip = ClipData.newPlainText("SNS Gateway", caption)
      if (Build.VERSION.SDK_INT >= 33) {
        clip.description.extras = PersistableBundle().apply { putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true) }
      }
      clipboard.setPrimaryClip(clip)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("shareFiles") { rawPaths: List<String>, caption: String, promise: Promise ->
      try {
        require(rawPaths.size in 1..10 && rawPaths.distinct().size == rawPaths.size) { "INVALID_PHOTO_SELECTION" }
        require(caption.length <= 2200 && !caption.contains('\u0000')) { "INVALID_CAPTION" }
        val activity = requireNotNull(appContext.currentActivity) { "FOREGROUND_REQUIRED" }
        check(!activity.isFinishing && !activity.isDestroyed) { "FOREGROUND_REQUIRED" }
        val uris = ArrayList(rawPaths.map { FileProvider.getUriForFile(context(), context().packageName + ".snsgateway.files", allowedFile(it)) })
        val intent = Intent(if (uris.size == 1) Intent.ACTION_SEND else Intent.ACTION_SEND_MULTIPLE).apply {
          type = "image/jpeg"
          if (uris.size == 1) putExtra(Intent.EXTRA_STREAM, uris[0]) else putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
          if (caption.isNotEmpty()) putExtra(Intent.EXTRA_TEXT, caption)
          clipData = ClipData.newUri(context().contentResolver, "SNS Gateway fixture", uris[0]).also { clip ->
            uris.drop(1).forEach { clip.addItem(ClipData.Item(it)) }
          }
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        activity.startActivity(Intent.createChooser(intent, "SNS 앱을 선택하고 최종 게시를 확인하세요"))
        // Android chooser presentation is not a publication receipt or a cancel signal.
        promise.resolve(mapOf("outcome" to "HANDOFF_UNCONFIRMED", "observedTarget" to null))
      } catch (_: Exception) {
        promise.reject("SHARE_FAILED", "Local share could not be confirmed.", null)
      }
    }.runOnQueue(Queues.MAIN)
  }
}
