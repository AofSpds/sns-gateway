import Foundation
#if canImport(Darwin)
import Darwin
#else
import Glibc
#endif

final class LocalManagedFiles {
  private static func isAbsent(_ error: NSError) -> Bool {
    // Underlying POSIX errors take precedence over a high-level Foundation category.
    if let cause = error.userInfo[NSUnderlyingErrorKey] as? NSError { return isAbsent(cause) }
    return (error.domain == NSPOSIXErrorDomain && error.code == Int(ENOENT))
      || (error.domain == NSCocoaErrorDomain && [NSFileNoSuchFileError, NSFileReadNoSuchFileError].contains(error.code))
  }
  private static func attributes(_ url: URL) throws -> [FileAttributeKey: Any]? {
    do { return try FileManager.default.attributesOfItem(atPath: url.path) }
    catch let error as NSError { if isAbsent(error) { return nil }; throw error }
  }
  @discardableResult private static func directory(_ url: URL, create: Bool = false) throws -> URL {
    if let entry = try attributes(url) {
      guard entry[.type] as? FileAttributeType == .typeDirectory else { throw NSError(domain: "UnsafeDirectory", code: 1) }
    } else if create {
      try FileManager.default.createDirectory(at: url, withIntermediateDirectories: false)
    }
    return url
  }
  static func support() throws -> URL {
    let base = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).standardizedFileURL.resolvingSymlinksInPath()
    var url = try directory(base.appendingPathComponent("sns-gateway", isDirectory: true), create: true)
    var values = URLResourceValues(); values.isExcludedFromBackup = true
    try url.setResourceValues(values)
    return url
  }
  static func shareRoot() throws -> URL {
    let base = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true).standardizedFileURL.resolvingSymlinksInPath()
    let app = try directory(base.appendingPathComponent("sns-gateway", isDirectory: true))
    return try directory(app.appendingPathComponent("share", isDirectory: true))
  }
  private static func inbox() throws -> URL { try directory(support().appendingPathComponent("inbox", isDirectory: true)) }
  private static func normalize(_ uri: URL) throws -> URL {
    // iOS can expose a trusted /var path whose physical root is /private/var.
    // Normalize that root only; symlinks inside inbox/staging are still rejected.
    for kind in [FileManager.SearchPathDirectory.applicationSupportDirectory, .cachesDirectory] {
      let logical = try FileManager.default.url(for: kind, in: .userDomainMask, appropriateFor: nil, create: true).standardizedFileURL
      let actual = logical.resolvingSymlinksInPath()
      for base in [logical, actual] where uri.path.hasPrefix(base.path + "/") {
        let suffix = String(uri.path.dropFirst(base.path.count + 1))
        return actual.appendingPathComponent(suffix).standardizedFileURL
      }
    }
    throw NSError(domain: "UnmanagedFile", code: 4)
  }
  private static func allowed(_ raw: String) throws -> URL {
    guard let uri = URL(string: raw), uri.isFileURL, uri.host == nil || uri.host == "", uri.query == nil, uri.fragment == nil else { throw NSError(domain: "UnmanagedFile", code: 1) }
    let file = try normalize(uri.standardizedFileURL)
    let parent = file.deletingLastPathComponent()
    let inboxFile = parent == (try inbox()) && file.lastPathComponent.range(of: "^[a-f0-9]{64}\\.jpg$", options: .regularExpression) != nil
    let sharedRoot = try shareRoot()
    let staged = parent.deletingLastPathComponent() == sharedRoot && UUID(uuidString: parent.lastPathComponent) != nil
      && file.lastPathComponent.range(of: "^(fixture-)?[0-9]+\\.jpg$", options: .regularExpression) != nil
    guard inboxFile || staged else { throw NSError(domain: "UnmanagedFile", code: 2) }
    try directory(parent)
    if let entry = try attributes(file) {
      guard entry[.type] as? FileAttributeType == .typeRegular else { throw NSError(domain: "UnmanagedFile", code: 3) }
    }
    return file
  }
  private static func children(_ url: URL) throws -> [URL] {
    guard try attributes(url) != nil else { return [] } // Confirmed missing directory, not I/O failure.
    try directory(url)
    return try FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: nil)
  }
  static func inventory() throws -> [[String: Any]] {
    let root = try inbox(); let share = try shareRoot()
    var files = try children(root)
    for folder in try children(share) {
      guard UUID(uuidString: folder.lastPathComponent) != nil, try attributes(folder) != nil else { throw NSError(domain: "InventoryIncomplete", code: 1) }
      files += try children(folder)
    }
    return try files.map { candidate in
      let file = try allowed(candidate.absoluteString)
      guard let entry = try attributes(file), entry[.type] as? FileAttributeType == .typeRegular,
        let bytes = entry[.size] as? NSNumber, let modified = entry[.modificationDate] as? Date else { throw NSError(domain: "InventoryIncomplete", code: 2) }
      return ["uri": file.absoluteString, "kind": file.deletingLastPathComponent() == root ? "INBOX" : "STAGING",
        "bytes": bytes.int64Value, "modifiedAt": Int64(modified.timeIntervalSince1970 * 1000), "active": false]
    }
  }
  static func requireSpace(_ extra: Int) throws {
    guard (0...524_288_000).contains(extra) else { throw NSError(domain: "LocalStorageFull", code: 1) }
    let used = try inventory().reduce(Int64(0)) { $0 + (($1["bytes"] as? NSNumber)?.int64Value ?? 0) }
    guard used >= 0, used <= Int64(524_288_000 - extra) else { throw NSError(domain: "LocalStorageFull", code: 1) }
  }
  static func delete(_ uris: [String]) throws -> [String] {
    guard uris.count <= 100, Set(uris).count == uris.count else { throw NSError(domain: "DeleteLimit", code: 1) }
    let files = try uris.map { try allowed($0) } // All metadata/path failures precede any deletion.
    for file in files {
      if unlink(file.path) != 0 {
        let code = errno
        guard code == ENOENT else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(code)) }
      }
      guard try attributes(file) == nil else { throw NSError(domain: "DeleteNotConfirmed", code: 1) }
    }
    // unlink never recursively removes a replaced directory. Keep empty parent folders.
    return uris
  }
}
