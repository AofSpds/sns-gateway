import Foundation
import UIKit
import Photos
import CryptoKit

final class LocalSources {
  private static func file() throws -> URL { try LocalManagedFiles.support().appendingPathComponent("source.json") }
  private static func hash(_ s: String) -> String { SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined() }
  private static func stored() throws -> [String: String]? {
    let url = try file()
    if !FileManager.default.fileExists(atPath: url.path) { return nil }
    return try JSONDecoder().decode([String: String].self, from: Data(contentsOf: url))
  }
  private static func entries(_ locator: String) throws -> [(String, PHAsset)] {
    // Limited-library membership is not a complete album snapshot. Use the explicit inbox in that case.
    guard PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized,
      let album = PHAssetCollection.fetchAssetCollections(withLocalIdentifiers: [locator], options: nil).firstObject else { throw NSError(domain: "SourcePermission", code: 1) }
    let options = PHFetchOptions(); options.predicate = NSPredicate(format: "mediaType = %d", PHAssetMediaType.image.rawValue)
    let assets = PHAsset.fetchAssets(in: album, options: options)
    guard assets.count <= 2000 else { throw NSError(domain: "SourceTooLarge", code: 1) }
    var result = [(String, PHAsset)]()
    assets.enumerateObjects { asset, _, _ in
      let revision = asset.localIdentifier + ":" + String(asset.modificationDate?.timeIntervalSince1970 ?? 0)
      result.append((hash(revision), asset))
    }
    return result
  }
  private static func snapshot(_ record: [String: String]) throws -> [String: Any] {
    guard let locator = record["locator"], let id = record["id"] else { throw NSError(domain: "SourceStore", code: 1) }
    return ["sourceId": id, "kind": "ios_album", "label": record["label"] ?? "선택 앨범", "items": try entries(locator).map { $0.0 }]
  }
  static func scan() throws -> [String: Any]? {
    guard let record = try stored() else { return nil }; return try snapshot(record)
  }
  static func disconnect() throws {
    let url = try file(); if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
  }
  static func choose(presenter: UIViewController, done: @escaping ([String: Any]?, Error?) -> Void) {
    PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
      DispatchQueue.main.async {
        guard status == .authorized else { done(nil, NSError(domain: "FullAlbumPermissionRequired", code: 1)); return }
        let result = PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: nil)
        guard result.count > 0, result.count <= 100 else { done(nil, NSError(domain: "AlbumListUnavailable", code: 1)); return }
        let sheet = UIAlertController(title: "연결할 사진 앨범", message: "기존 사진은 기준 목록만 저장합니다. 새 사진의 실제 앨범 추가시각은 알 수 없으므로 날짜 확인 후보로 가져옵니다.", preferredStyle: .actionSheet)
        result.enumerateObjects { album, _, _ in
          sheet.addAction(UIAlertAction(title: album.localizedTitle ?? "앨범", style: .default) { _ in
            DispatchQueue.global(qos: .userInitiated).async {
              do {
                let record = ["locator": album.localIdentifier, "label": String((album.localizedTitle ?? "앨범").prefix(300)), "id": hash(UUID().uuidString + album.localIdentifier)]
                let snapshot = try self.snapshot(record)
                try JSONEncoder().encode(record).write(to: file(), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                DispatchQueue.main.async { done(snapshot, nil) }
              } catch { DispatchQueue.main.async { done(nil, error) } }
            }
          })
        }
        sheet.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in done(nil, nil) })
        if let popover = sheet.popoverPresentationController { popover.sourceView = presenter.view; popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1); popover.permittedArrowDirections = [] }
        presenter.present(sheet, animated: true)
      }
    }
  }
  static func importSelected(_ sourceId: String, _ keys: [String]) throws -> [String: Any] {
    guard (1...10).contains(keys.count), Set(keys).count == keys.count,
      let record = try stored(), record["id"] == sourceId, let locator = record["locator"] else { throw NSError(domain: "SourceChanged", code: 1) }
    let available = Dictionary(uniqueKeysWithValues: try entries(locator))
    var records = [[String: Any]](); var skipped = 0
    for key in keys {
      autoreleasepool {
        do {
          guard let asset = available[key] else { throw NSError(domain: "SourceGone", code: 1) }
          records.append(["entryKey": key, "photo": try LocalPhotoPicker.importAsset(asset)])
        } catch { skipped += 1 }
      }
    }
    return ["records": records, "skipped": skipped]
  }
}
