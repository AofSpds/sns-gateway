import ExpoModulesCore
import UIKit
import ImageIO
import Photos
import PhotosUI

public class LocalPlatformModule: Module {
  private var sharing = false
  private var photoPicker: LocalPhotoPicker?

  private func root() throws -> URL {
    let cache = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    let directory = cache.appendingPathComponent("sns-gateway/share", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory.resolvingSymlinksInPath().standardizedFileURL
  }

  private func allowedFile(_ raw: String) throws -> URL {
    guard let url = URL(string: raw), url.isFileURL, url.host == nil || url.host == "", url.query == nil, url.fragment == nil else {
      throw NSError(domain: "LocalPlatform", code: 1)
    }
    let resolved = url.resolvingSymlinksInPath().standardizedFileURL
    let base = try root().path + "/"
    let values = try resolved.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
    guard resolved.path.hasPrefix(base), resolved.pathExtension.lowercased() == "jpg", values.isRegularFile == true,
      let size = values.fileSize, size > 2, size <= 10_485_760,
      let source = CGImageSourceCreateWithURL(resolved as CFURL, nil),
      (CGImageSourceGetType(source) as String?) == "public.jpeg" else {
      throw NSError(domain: "LocalPlatform", code: 2)
    }
    return resolved
  }

  private func presenter() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive }
    var top = scene?.windows.first { $0.isKeyWindow }?.rootViewController
    while let presented = top?.presentedViewController { top = presented }
    return top
  }

  public func definition() -> ModuleDefinition {
    Name("LocalPlatform")

    AsyncFunction("pickPhotos") { (promise: Promise) in
      guard self.photoPicker == nil, UIApplication.shared.applicationState == .active, let presenter = self.presenter() else {
        promise.reject("FOREGROUND_REQUIRED", "Open the app before choosing photos."); return
      }
      PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
        DispatchQueue.main.async {
          guard status == .authorized || status == .limited else { promise.reject("PHOTO_PERMISSION_REQUIRED", "Allow selected photos in Settings."); return }
          let helper = LocalPhotoPicker { photos, skipped in
            self.photoPicker = nil
            promise.resolve(["photos": photos, "skipped": skipped])
          }
          self.photoPicker = helper
          var config = PHPickerConfiguration(photoLibrary: .shared())
          config.selectionLimit = 10; config.filter = .images; config.preferredAssetRepresentationMode = .current
          let picker = PHPickerViewController(configuration: config); picker.delegate = helper
          presenter.present(picker, animated: true)
        }
      }
    }.runOnQueue(.main)
    AsyncFunction("inventoryPhotos") { () throws -> [[String: Any]] in try LocalPhotoPicker.inventory() }
    AsyncFunction("stagePhotos") { (paths: [String]) throws -> [String] in try LocalPhotoPicker.stage(paths) }
    AsyncFunction("reminderStatus") { (promise: Promise) in LocalReminders.status { promise.resolve($0) } }
    AsyncFunction("setReminder") { (enabled: Bool, hour: Int, minute: Int, promise: Promise) in
      LocalReminders.configure(enabled, hour, minute) { value, error in
        if error != nil { promise.reject("REMINDER_FAILED", "Check notification settings.") } else { promise.resolve(value) }
      }
    }
    AsyncFunction("testReminder") { (promise: Promise) in
      LocalReminders.testOnce { error in
        if error != nil { promise.reject("REMINDER_FAILED", "Allow notifications first.") } else { promise.resolve(nil) }
      }
    }


    AsyncFunction("storageDirectory") { () throws -> String in
      var folder = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        .appendingPathComponent("sns-gateway", isDirectory: true)
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      var resource = URLResourceValues()
      resource.isExcludedFromBackup = true
      try folder.setResourceValues(resource)
      let database = folder.appendingPathComponent("db", isDirectory: true)
      try FileManager.default.createDirectory(at: database, withIntermediateDirectories: true)
      return database.path
    }

    AsyncFunction("makeFixtures") { (count: Int) throws -> [[String: String]] in
      guard count == 1 || count == 3 else { throw NSError(domain: "LocalPlatform", code: 3) }
      let folder = try self.root().appendingPathComponent(UUID().uuidString, isDirectory: true)
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      return try (1...count).map { index in
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let image = UIGraphicsImageRenderer(size: CGSize(width: 1080, height: 1080), format: format).image { context in
          UIColor(red: 0.90, green: 0.95, blue: 0.96, alpha: 1).setFill()
          context.fill(CGRect(x: 0, y: 0, width: 1080, height: 1080))
          let text: [(String, CGFloat, CGFloat)] = [("SNS Gateway", 80, 54), (String(index), 310, 190), ("Synthetic fixture - no personal photo", 900, 32)]
          for (label, y, size) in text {
            (label as NSString).draw(at: CGPoint(x: 70, y: y), withAttributes: [.font: UIFont.systemFont(ofSize: size), .foregroundColor: UIColor.darkGray])
          }
        }
        guard let data = image.jpegData(compressionQuality: 0.9) else { throw NSError(domain: "LocalPlatform", code: 4) }
        let file = folder.appendingPathComponent("fixture-\(index).jpg")
        try data.write(to: file, options: .atomic)
        return ["uri": file.absoluteString, "label": "Fixture \(index)"]
      }
    }.runOnQueue(.main)

    AsyncFunction("copyCaption") { (caption: String) throws in
      guard caption.utf16.count <= 2200, !caption.contains("\0") else { throw NSError(domain: "LocalPlatform", code: 5) }
      UIPasteboard.general.setItems([["public.utf8-plain-text": caption]], options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(300)])
    }.runOnQueue(.main)

    AsyncFunction("shareFiles") { (rawPaths: [String], caption: String, promise: Promise) in
      guard !self.sharing, UIApplication.shared.applicationState == .active, let presenter = self.presenter() else {
        promise.reject("FOREGROUND_REQUIRED", "Open the app before sharing.")
        return
      }
      do {
        guard (1...10).contains(rawPaths.count), Set(rawPaths).count == rawPaths.count,
          caption.utf16.count <= 2200, !caption.contains("\0") else { throw NSError(domain: "LocalPlatform", code: 6) }
        var items: [Any] = try rawPaths.map { try self.allowedFile($0) }
        if !caption.isEmpty { items.append(caption) }
        let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
        if let popover = controller.popoverPresentationController {
          popover.sourceView = presenter.view
          popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
          popover.permittedArrowDirections = []
        }
        self.sharing = true
        controller.completionWithItemsHandler = { activity, completed, _, error in
          self.sharing = false
          if error != nil {
            promise.reject("SHARE_FAILED", "Local activity could not be confirmed.")
          } else {
            // completed is an OS activity result, not evidence of a remote post.
            promise.resolve(["outcome": completed ? "HANDOFF_UNCONFIRMED" : "CANCELLED_OBSERVED", "observedTarget": activity?.rawValue as Any? ?? NSNull()])
          }
        }
        presenter.present(controller, animated: true)
      } catch {
        self.sharing = false
        promise.reject("SHARE_FAILED", "Local file sharing could not be confirmed.")
      }
    }.runOnQueue(.main)
  }
}
