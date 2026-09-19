package expo.modules.localplatform
import android.content.Context
import java.io.IOException
import java.nio.file.Files
import java.nio.file.attribute.PosixFilePermissions
import java.util.UUID

fun main() {
  check(System.getProperty("user.name") != "root") { "Permission fixtures must run unprivileged" }
  val base = Files.createTempDirectory("snsg-iva002-")
  val nb = Files.createDirectory(base.resolve("no-backup")); val cache = Files.createDirectory(base.resolve("cache"))
  val c = Context(nb.toFile(),cache.toFile()); val inbox=nb.resolve("sns-gateway/inbox");val share=cache.resolve("sns-gateway/share")
  val hash="a".repeat(64); val file=inbox.resolve("$hash.jpg");val temporary=inbox.resolve(UUID.randomUUID().toString()+".tmp")
  var count=0
  fun rejects(block:()->Unit) { var refused=false;try{block()}catch(_:Exception){refused=true};check(refused);count++ }
  fun permissions(path:java.nio.file.Path, mode:String)=Files.setPosixFilePermissions(path,PosixFilePermissions.fromString(mode))
  try {
    check(LocalManagedFiles.inventory(c).isEmpty());LocalManagedFiles.requireSpace(c,524_288_000);count++
    Files.createDirectories(inbox);Files.write(file,byteArrayOf(1,2,3));Files.write(temporary,byteArrayOf(4,5,6,7))
    val all=LocalManagedFiles.inventory(c);check(all.size==2&&all.sumOf{(it["bytes"] as Number).toLong()}==7L&&all.any{it["kind"]=="IMPORT_TEMP"});count++
    rejects{LocalManagedFiles.requireSpace(c,524_288_000)}
    val removed=LocalManagedFiles.delete(c,all.map{it["uri"] as String});check(removed.size==2&&LocalManagedFiles.inventory(c).isEmpty());count++
    // Empty and partially written temps are inventoried, but an active writer cannot be deleted.
    LocalManagedFiles.withImportFile(c,3){p->
      check(LocalManagedFiles.inventory(c).single()["active"]==true);count++
      Files.write(p.toPath(),byteArrayOf(1));check((LocalManagedFiles.inventory(c).single()["bytes"] as Number).toInt()==1);count++
      rejects{LocalManagedFiles.delete(c,listOf(p.toURI().toString()))}
    }
    check(LocalManagedFiles.inventory(c).isEmpty());count++
    rejects{LocalManagedFiles.withImportFile(c,3){p->Files.write(p.toPath(),byteArrayOf(1,2));throw IOException("fixture write failure")}}
    check(LocalManagedFiles.inventory(c).isEmpty());count++
    LocalManagedFiles.storePhoto(c,hash,byteArrayOf(1,2,3));LocalManagedFiles.storePhoto(c,hash,byteArrayOf(1,2,3))
    check(LocalManagedFiles.inventory(c).size==1&&LocalManagedFiles.inventory(c).all{it["kind"]=="INBOX"});count++
    // F004: directory enumeration error is not an empty inventory or spare capacity.
    permissions(inbox,"--x--x--x");try {rejects{LocalManagedFiles.inventory(c)};rejects{LocalManagedFiles.requireSpace(c,524_288_000)}}finally{permissions(inbox,"rwx------")}
    // Can enumerate names but cannot stat children.
    permissions(inbox,"r--r--r--");try{rejects{LocalManagedFiles.inventory(c)}}finally{permissions(inbox,"rwx------")}
    // EACCES on metadata lookup is not ENOENT, nor a successful delete receipt.
    permissions(inbox,"---------");try{rejects{LocalManagedFiles.delete(c,listOf(file.toFile().toURI().toString()))}}finally{permissions(inbox,"rwx------")}
    check(Files.exists(file));count++
    // Metadata readable, unlink itself fails.
    permissions(inbox,"r-x------");try{rejects{LocalManagedFiles.delete(c,listOf(file.toFile().toURI().toString()))}}finally{permissions(inbox,"rwx------")}
    val child=share.resolve(UUID.randomUUID().toString());Files.createDirectories(child);Files.write(child.resolve("0.jpg"),byteArrayOf(1,2,3))
    permissions(child,"--x------");try{rejects{LocalManagedFiles.inventory(c)}}finally{permissions(child,"rwx------")}
    val outside=base.resolve("original.jpg");Files.write(outside,byteArrayOf(42));
    rejects{LocalManagedFiles.delete(c,listOf(file.toFile().toURI().toString(),outside.toFile().toURI().toString()))};check(Files.exists(file)&&Files.exists(outside));
    val link=inbox.resolve("b".repeat(64)+".jpg");Files.createSymbolicLink(link,outside)
    rejects{LocalManagedFiles.delete(c,listOf(link.toFile().toURI().toString()))};rejects{LocalManagedFiles.inventory(c)};Files.delete(link)
    val unknown=inbox.resolve("not-an-app-temp.tmp");Files.write(unknown,byteArrayOf(5));rejects{LocalManagedFiles.delete(c,listOf(unknown.toUri().toString()))};Files.delete(unknown)
    LocalManagedFiles.delete(c,listOf(file.toFile().toURI().toString()));check(LocalManagedFiles.delete(c,listOf(file.toFile().toURI().toString())).size==1);count++
    println("KOTLIN_IVA002_FILE_CASES_PASS=$count (JVM/filesystem + Android Os shim; not Android device acceptance)")
  } finally {
    // Only this newly allocated fixture tree; no product/user directory is cleaned recursively.
    Files.walk(base).use{paths->paths.sorted(Comparator.reverseOrder()).forEach{Files.deleteIfExists(it)}}
  }
}
