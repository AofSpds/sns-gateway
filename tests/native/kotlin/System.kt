package android.system

// JVM fixture shim, not an implementation shipped in the APK. Actual filesystem exceptions are retained as errno.
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.LinkOption.NOFOLLOW_LINKS
import java.nio.file.attribute.BasicFileAttributes
import java.nio.file.NoSuchFileException
import java.nio.file.AccessDeniedException
import java.io.IOException

class ErrnoException(val functionName: String, val errno: Int, cause: Throwable? = null): Exception(functionName, cause)
class StructStat(val st_mode: Int, val st_size: Long, val st_mtime: Long)
object OsConstants {
  const val ENOENT=2; const val EACCES=13; const val EIO=5
  fun S_ISDIR(mode:Int) = mode == 0x4000
  fun S_ISREG(mode:Int) = mode == 0x8000
}
object Os {
  private fun <T> io(name:String, block:()->T):T = try { block() }
    catch(e:NoSuchFileException){throw ErrnoException(name,OsConstants.ENOENT,e)}
    catch(e:AccessDeniedException){throw ErrnoException(name,OsConstants.EACCES,e)}
    catch(e:IOException){throw ErrnoException(name,OsConstants.EIO,e)}
  fun lstat(path:String):StructStat=io("lstat") {
    val a=Files.readAttributes(Path.of(path),BasicFileAttributes::class.java,NOFOLLOW_LINKS)
    StructStat(when {a.isSymbolicLink->0xa000; a.isDirectory->0x4000; a.isRegularFile->0x8000; else->0},a.size(),a.lastModifiedTime().toMillis()/1000)
  }
  fun remove(path:String):Unit=io("remove"){Files.delete(Path.of(path))}
  fun rename(from:String,to:String):Unit=io("rename"){Files.move(Path.of(from),Path.of(to));Unit}
}
