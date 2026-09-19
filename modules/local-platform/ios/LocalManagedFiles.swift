import Foundation

final class LocalManagedFiles {
  static func support() throws -> URL {
    var url = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("sns-gateway", isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    var values = URLResourceValues(); values.isExcludedFromBackup = true
    try url.setResourceValues(values)
    return url.standardizedFileURL.resolvingSymlinksInPath()
  }
  static func shareRoot() throws -> URL {
    try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("sns-gateway/share", isDirectory: true).standardizedFileURL.resolvingSymlinksInPath()
  }
  private static func allowed(_ raw: String) throws -> URL {
    guard let uri = URL(string: raw), uri.isFileURL, uri.host == nil || uri.host == "", uri.query == nil, uri.fragment == nil else { throw NSError(domain: "UnmanagedFile", code: 1) }
    let file = uri.standardizedFileURL.resolvingSymlinksInPath()
    let inbox = try support().appendingPathComponent("inbox", isDirectory: true)
    let parent = file.deletingLastPathComponent()
    let inboxFile = parent == inbox && file.lastPathComponent.range(of: "^[a-f0-9]{64}\\.jpg$", options: .regularExpression) != nil
    let sharedRoot = try shareRoot()
    let staged = parent.deletingLastPathComponent() == sharedRoot && UUID(uuidString: parent.lastPathComponent) != nil
      && file.lastPathComponent.range(of: "^(fixture-)?[0-9]+\\.jpg$", options: .regularExpression) != nil
    guard inboxFile || staged else { throw NSError(domain: "UnmanagedFile", code: 2) }
    if FileManager.default.fileExists(atPath: file.path) {
      guard try file.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true else { throw NSError(domain: "UnmanagedFile", code: 3) }
    }
    return file
  }
  static func inventory() throws -> [[String: Any]] {
    let inbox = try support().appendingPathComponent("inbox", isDirectory: true)
    let share = try shareRoot()
    let original = (try? FileManager.default.contentsOfDirectory(at: inbox, includingPropertiesForKeys: nil)) ?? []
    let folders = (try? FileManager.default.contentsOfDirectory(at: share, includingPropertiesForKeys: nil)) ?? []
    let files = original + folders.flatMap { (try? FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil)) ?? [] }
    return files.compactMap { candidate in
      guard let file = try? allowed(candidate.absoluteString),
        let values = try? file.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey, .isRegularFileKey]), values.isRegularFile == true else { return nil }
      return ["uri": file.absoluteString, "kind": file.deletingLastPathComponent() == inbox ? "INBOX" : "STAGING",
        "bytes": values.fileSize ?? 0, "modifiedAt": Int64((values.contentModificationDate?.timeIntervalSince1970 ?? 0) * 1000)]
    }
  }
  static func requireSpace(_ extra: Int) throws {
    let used = try inventory().reduce(0) { $0 + ($1["bytes"] as? Int ?? 0) }
    guard extra >= 0 && used + extra <= 524_288_000 else { throw NSError(domain: "LocalStorageFull", code: 1) }
  }
  static func delete(_ uris: [String]) throws -> [String] {
    guard uris.count <= 100, Set(uris).count == uris.count else { throw NSError(domain: "DeleteLimit", code: 1) }
    let files = try uris.map { try allowed($0) } // Validate the entire request before any mutation.
    var removed = [String]()
    for (raw, file) in zip(uris, files) {
      do {
        if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
        removed.append(raw)
        let parent = file.deletingLastPathComponent()
        if parent.deletingLastPathComponent() == (try shareRoot()), (try? FileManager.default.contentsOfDirectory(atPath: parent.path).isEmpty) == true {
          try? FileManager.default.removeItem(at: parent)
        }
      } catch { /* Keep deletion journal pending; never delete originals or the database. */ }
    }
    return removed
  }
}
