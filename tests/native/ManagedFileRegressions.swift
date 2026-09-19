import Foundation
#if canImport(Darwin)
import Darwin
#else
import Glibc
#endif

@main
struct ManagedFileRegressions {
  static func main() throws {
    precondition(getuid() != 0, "Permission fixtures require an unprivileged process")
    let fm = FileManager.default
    let inbox = try LocalManagedFiles.support().appendingPathComponent("inbox", isDirectory: true)
    try fm.createDirectory(at: inbox, withIntermediateDirectories: true)
    // Refuse to touch permissions in any directory containing non-fixture content.
    let initial = try fm.contentsOfDirectory(atPath: inbox.path);precondition(initial.isEmpty)
    let file = inbox.appendingPathComponent(String(repeating: "a", count: 64) + ".jpg")
    let link = inbox.appendingPathComponent(String(repeating: "b", count: 64) + ".jpg")
    let outside = fm.temporaryDirectory.appendingPathComponent("snsg-original-" + UUID().uuidString)
    let folder = try LocalManagedFiles.shareRoot().appendingPathComponent(UUID().uuidString, isDirectory: true)
    let staged = folder.appendingPathComponent("0.jpg")
    var count=0
    func rejects(_ action:() throws -> Void) {var refused=false;do{try action()}catch{refused=true};precondition(refused);count += 1}
    func permissions(_ url:URL,_ mode:mode_t){precondition(chmod(url.path,mode)==0)}
    defer {
      permissions(inbox,0o700)
      if fm.fileExists(atPath: folder.path){permissions(folder,0o700)}
      for url in [file,link,staged,folder,outside]{try? fm.removeItem(at:url)}
    }
    let fresh = try LocalManagedFiles.inventory();precondition(fresh.isEmpty);try LocalManagedFiles.requireSpace(524_288_000);count += 1
    try Data([1,2,3]).write(to:file);try Data([42]).write(to:outside)
    let inventory = try LocalManagedFiles.inventory();precondition(inventory.count==1 && (inventory[0]["bytes"] as? NSNumber)?.intValue==3);count += 1
    rejects{try LocalManagedFiles.requireSpace(524_288_000)}
    permissions(inbox,0o111);rejects{_ = try LocalManagedFiles.inventory()};rejects{try LocalManagedFiles.requireSpace(524_288_000)};permissions(inbox,0o700)
    permissions(inbox,0o444);rejects{_ = try LocalManagedFiles.inventory()};permissions(inbox,0o700)
    permissions(inbox,0o000);rejects{_ = try LocalManagedFiles.delete([file.absoluteString])};permissions(inbox,0o700)
    precondition(fm.fileExists(atPath:file.path));count += 1
    permissions(inbox,0o500);rejects{_ = try LocalManagedFiles.delete([file.absoluteString])};permissions(inbox,0o700)
    try fm.createDirectory(at:folder,withIntermediateDirectories:true);try Data([1,2,3]).write(to:staged)
    permissions(folder,0o111);rejects{_ = try LocalManagedFiles.inventory()};permissions(folder,0o700)
    rejects{_ = try LocalManagedFiles.delete([file.absoluteString,outside.absoluteString])};precondition(fm.fileExists(atPath:file.path))
    try fm.createSymbolicLink(at:link,withDestinationURL:outside)
    rejects{_ = try LocalManagedFiles.delete([link.absoluteString])};rejects{_ = try LocalManagedFiles.inventory()};try fm.removeItem(at:link)
    let deleted=try LocalManagedFiles.delete([file.absoluteString]);precondition(deleted==[file.absoluteString]);count += 1
    let repeated=try LocalManagedFiles.delete([file.absoluteString]);precondition(repeated==[file.absoluteString]);count += 1
    precondition(fm.fileExists(atPath:outside.path));count += 1
    print("SWIFT_IVA002_FILE_CASES_PASS=\(count) (Foundation/filesystem fixture; not iPhone acceptance)")
  }
}
