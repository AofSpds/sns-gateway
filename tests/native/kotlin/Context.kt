// JVM-only fixture: Context roots and the Os shim use an isolated real filesystem.
package android.content
import java.io.File
open class Context(val noBackupFilesDir: File, val cacheDir: File)
