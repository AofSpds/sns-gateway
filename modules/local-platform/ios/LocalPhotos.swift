import UIKit
import Photos
import PhotosUI
import CryptoKit
import ImageIO

final class LocalPhotoPicker: NSObject, PHPickerViewControllerDelegate {
  private let finish: ([[String: Any]], Int) -> Void
  init(finish: @escaping ([[String: Any]], Int) -> Void) { self.finish = finish }
  static func root() throws -> URL {
    var root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      .appendingPathComponent("sns-gateway/inbox", isDirectory: true)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    var values = URLResourceValues(); values.isExcludedFromBackup = true
    try root.setResourceValues(values)
    return root.standardizedFileURL.resolvingSymlinksInPath()
  }
  static func record(_ url: URL) throws -> [String: Any] {
    let bytes = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    guard bytes > 2, bytes <= 10_485_760,
      let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      (CGImageSourceGetType(source) as String?) == "public.jpeg",
      let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let w = props[kCGImagePropertyPixelWidth] as? Int, let h = props[kCGImagePropertyPixelHeight] as? Int,
      (1...2048).contains(w), (1...2048).contains(h) else { throw NSError(domain: "LocalPhoto", code: 1) }
    return ["id": url.deletingPathExtension().lastPathComponent, "uri": url.absoluteString, "bytes": bytes, "width": w, "height": h]
  }
  static func inventory() throws -> [[String: Any]] {
    try FileManager.default.contentsOfDirectory(at: root(), includingPropertiesForKeys: nil)
      .filter { $0.lastPathComponent.range(of: "^[a-f0-9]{64}\\.jpg$", options: .regularExpression) != nil }
      .compactMap { try? record($0) }
  }
  static func stage(_ paths: [String]) throws -> [String] {
    guard (1...10).contains(paths.count), Set(paths).count == paths.count else { throw NSError(domain: "LocalPhoto", code: 2) }
    let base = try root()
    let files = try paths.map { raw -> URL in
      guard let url = URL(string: raw), url.isFileURL, url.host == nil || url.host == "", url.query == nil, url.fragment == nil else { throw NSError(domain: "LocalPhoto", code: 3) }
      let file = url.standardizedFileURL.resolvingSymlinksInPath()
      guard file.deletingLastPathComponent() == base else { throw NSError(domain: "LocalPhoto", code: 4) }
      _ = try record(file)
      let hash = SHA256.hash(data: try Data(contentsOf: file)).map { String(format: "%02x", $0) }.joined()
      guard file.lastPathComponent == hash + ".jpg" else { throw NSError(domain: "LocalPhoto", code: 5) }
      return file
    }
    let cache = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    let folder = cache.appendingPathComponent("sns-gateway/share/" + UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    return try files.enumerated().map { i, file in
      let copy = folder.appendingPathComponent("\(i).jpg")
      try FileManager.default.copyItem(at: file, to: copy)
      return copy.absoluteString
    }
  }
  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)
    guard results.count <= 10 else { finish([], results.count); return }
    DispatchQueue.global(qos: .userInitiated).async {
      var imported = [[String: Any]](); var skipped = 0
      for result in results {
        autoreleasepool {
          do {
            // Do not load itemProvider data: it can cause a hidden iCloud download.
            guard let identifier = result.assetIdentifier,
              let asset = PHAsset.fetchAssets(withLocalIdentifiers: [identifier], options: nil).firstObject,
              asset.mediaType == .image, asset.pixelWidth > 0, asset.pixelHeight > 0,
              Int64(asset.pixelWidth) * Int64(asset.pixelHeight) <= 80_000_000 else { throw NSError(domain: "LocalPhoto", code: 6) }
            let options = PHImageRequestOptions()
            options.isSynchronous = true
            options.isNetworkAccessAllowed = false
            options.deliveryMode = .highQualityFormat
            options.resizeMode = .exact
            var local: UIImage?
            PHImageManager.default().requestImage(for: asset, targetSize: CGSize(width: 2048, height: 2048), contentMode: .aspectFit, options: options) { image, info in
              if info?[PHImageErrorKey] == nil, (info?[PHImageResultIsDegradedKey] as? Bool) != true { local = image }
            }
            guard let image = local else { throw NSError(domain: "LocalPhoto", code: 7) }
            let ratio = max(1, max(image.size.width, image.size.height) / 2048)
            let size = CGSize(width: max(1, floor(image.size.width / ratio)), height: max(1, floor(image.size.height / ratio)))
            let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
            // Render a new bitmap: normalize orientation and do not carry source EXIF/GPS.
            let normalized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
              UIColor.white.setFill(); UIRectFill(CGRect(origin: .zero, size: size))
              image.draw(in: CGRect(origin: .zero, size: size))
            }
            guard let data = normalized.jpegData(compressionQuality: 0.9), data.count <= 10_485_760 else { throw NSError(domain: "LocalPhoto", code: 8) }
            let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
            let file = try Self.root().appendingPathComponent(hash + ".jpg")
            if !FileManager.default.fileExists(atPath: file.path) {
              let files = try FileManager.default.contentsOfDirectory(at: Self.root(), includingPropertiesForKeys: [.fileSizeKey])
              let used = files.reduce(0) { $0 + ((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
              guard used + data.count <= 524_288_000 else { throw NSError(domain: "LocalPhoto", code: 9) }
              try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            }
            imported.append(try Self.record(file))
          } catch { skipped += 1 }
        }
      }
      DispatchQueue.main.async { self.finish(imported, skipped) }
    }
  }
}
