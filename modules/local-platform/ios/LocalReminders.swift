import Foundation
import UserNotifications

final class LocalReminders {
  private static let daily = "sns-gateway.daily"
  private static let test = "sns-gateway.test"
  private static let center = UNUserNotificationCenter.current()
  static func status(_ done: @escaping ([String: Any]) -> Void) {
    center.getNotificationSettings { settings in
      center.getPendingNotificationRequests { requests in
        let request = requests.first { $0.identifier == daily }
        let trigger = request?.trigger as? UNCalendarNotificationTrigger
        let permitted = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
        let next = trigger?.nextTriggerDate()
        done(["enabled": request != nil, "permitted": permitted,
          "hour": trigger?.dateComponents.hour ?? 9, "minute": trigger?.dateComponents.minute ?? 0,
          "nextAt": next.map { $0.timeIntervalSince1970 * 1000 } as Any? ?? NSNull(),
          "precision": settings.authorizationStatus == .provisional ? "QUIET_CALENDAR" : "OS_CALENDAR"])
      }
    }
  }
  static func configure(_ enabled: Bool, _ hour: Int, _ minute: Int, done: @escaping ([String: Any]?, Error?) -> Void) {
    guard (0...23).contains(hour), (0...59).contains(minute) else { done(nil, NSError(domain: "Reminder", code: 1)); return }
    if !enabled {
      center.removePendingNotificationRequests(withIdentifiers: [daily, test])
      status { done($0, nil) }; return
    }
    center.requestAuthorization(options: [.alert, .sound]) { granted, error in
      if let error = error { done(nil, error); return }
      guard granted else { status { done($0, nil) }; return }
      var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "Asia/Seoul")!
      var date = DateComponents(); date.calendar = calendar; date.timeZone = calendar.timeZone
      date.hour = hour; date.minute = minute; date.second = 0
      let content = UNMutableNotificationContent()
      content.title = "SNS Gateway"; content.body = "오늘 사진을 확인하고 공유하세요."; content.sound = .default
      let trigger = UNCalendarNotificationTrigger(dateMatching: date, repeats: true)
      // Reusing the identifier replaces only this application's daily request.
      center.add(UNNotificationRequest(identifier: daily, content: content, trigger: trigger)) { error in
        if let error = error { done(nil, error) } else { status { done($0, nil) } }
      }
    }
  }
  static func testOnce(_ done: @escaping (Error?) -> Void) {
    center.getNotificationSettings { settings in
      guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { done(NSError(domain: "Reminder", code: 2)); return }
      let content = UNMutableNotificationContent(); content.title = "SNS Gateway 시험 알림"
      content.body = "사진 공유 준비를 확인하세요."; content.sound = .default
      center.add(UNNotificationRequest(identifier: test, content: content, trigger: UNTimeIntervalNotificationTrigger(timeInterval: 10, repeats: false)), withCompletionHandler: done)
    }
  }
}
