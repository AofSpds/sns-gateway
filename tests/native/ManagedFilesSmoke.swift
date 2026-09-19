import Foundation

@main
struct ManagedFilesSmoke {
  static func main() throws {
    let fm = FileManager.default
    let salt = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    let inbox = try LocalManagedFiles.support().appendingPathComponent("inbox", isDirectory: true)
    try fm.createDirectory(at: inbox, withIntermediateDirectories: true)
    let good = inbox.appendingPathComponent(salt + salt + ".jpg")
    let linked = inbox.appendingPathComponent(String(salt.reversed()) + salt + ".jpg")
    let outside = fm.temporaryDirectory.appendingPathComponent("snsg-fixture-" + salt + ".jpg")
    guard !fm.fileExists(atPath: good.path), !fm.fileExists(atPath: linked.path), !fm.fileExists(atPath: outside.path) else { fatalError("Fixture already exists") }
    defer { for url in [good, linked, outside] { try? fm.removeItem(at: url) } }
    try Data([255, 216, 217]).write(to: good)
    try Data([255, 216, 217]).write(to: outside)
    var refused = false
    do { _ = try LocalManagedFiles.delete([good.absoluteString, outside.absoluteString]) } catch { refused = true }
    precondition(refused && fm.fileExists(atPath: good.path) && fm.fileExists(atPath: outside.path))
    try fm.createSymbolicLink(at: linked, withDestinationURL: outside)
    refused = false
    do { _ = try LocalManagedFiles.delete([linked.absoluteString]) } catch { refused = true }
    precondition(refused && fm.fileExists(atPath: outside.path))
    refused = false
    do { _ = try LocalManagedFiles.delete([good.absoluteString, good.absoluteString]) } catch { refused = true }
    precondition(refused && fm.fileExists(atPath: good.path))
    let deleted = try LocalManagedFiles.delete([good.absoluteString])
    precondition(deleted == [good.absoluteString] && !fm.fileExists(atPath: good.path))
    let repeated = try LocalManagedFiles.delete([good.absoluteString])
    precondition(repeated == [good.absoluteString])
    refused = false
    do { try LocalManagedFiles.requireSpace(524_288_001) } catch { refused = true }
    precondition(refused)
    print("MANAGED_FILES_GUARDS_PASS=6 (Foundation fixture; not iPhone acceptance)")
  }
}
