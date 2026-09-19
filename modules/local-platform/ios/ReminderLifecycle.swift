import ExpoModulesCore
import UIKit
import UserNotifications

/** Capture notification taps before the JS runtime starts; OS completion is never a share action. */
public class ReminderLifecycle: ExpoAppDelegateSubscriber {
  private static let handler = ReminderDelegate()
  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    Self.handler.install(); return true
  }
  public func applicationDidBecomeActive(_ application: UIApplication) { Self.handler.install() }
}
final class ReminderDelegate: NSObject, UNUserNotificationCenterDelegate {
  private var previous: UNUserNotificationCenterDelegate?
  func install() {
    let center = UNUserNotificationCenter.current()
    if center.delegate !== self { previous = center.delegate; center.delegate = self }
  }
  static func file() throws -> URL { try LocalManagedFiles.support().appendingPathComponent("reminder-open.json") }
  static func pending() throws -> [String: String]? {
    let url = try file(); if !FileManager.default.fileExists(atPath: url.path) { return nil }
    return try JSONDecoder().decode([String: String].self, from: Data(contentsOf: url))
  }
  static func acknowledge(_ token: String) throws {
    guard let value = try pending(), value["token"] == token else { return }
    try FileManager.default.removeItem(at: file())
  }
  func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
    if response.notification.request.identifier.hasPrefix("sns-gateway.") {
      defer { completionHandler() }
      if response.actionIdentifier == UNNotificationDefaultActionIdentifier {
        let format = DateFormatter(); format.locale = Locale(identifier: "en_US_POSIX"); format.timeZone = TimeZone(identifier: "Asia/Seoul"); format.dateFormat = "yyyy-MM-dd"
        // Repeating calendar notifications expose a delivery date, not a unique scheduled date.
        // The UI must ask for date confirmation; do not substitute the app-open date.
        let context = ["token": UUID().uuidString, "serviceDate": format.string(from: response.notification.date), "basis": "DELIVERY_DATE"]
        try? JSONEncoder().encode(context).write(to: Self.file(), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
      }
    } else if let previous, previous.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:))) {
      previous.userNotificationCenter?(center, didReceive: response, withCompletionHandler: completionHandler)
    } else { completionHandler() }
  }
  func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    if notification.request.identifier.hasPrefix("sns-gateway.") { completionHandler([.banner, .sound]) }
    else if let previous, previous.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:willPresent:withCompletionHandler:))) {
      previous.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: completionHandler)
    } else { completionHandler([]) }
  }
}
