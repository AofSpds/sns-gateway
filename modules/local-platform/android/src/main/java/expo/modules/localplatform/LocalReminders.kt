package expo.modules.localplatform

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.util.Calendar
import java.util.TimeZone

internal object LocalReminders {
  private const val CHANNEL = "snsg-daily"
  private const val DAILY = "com.aofspds.snsgateway.DAILY"
  private const val TEST = "com.aofspds.snsgateway.TEST"
  private fun prefs(c: Context) = c.getSharedPreferences("snsg-reminder", Context.MODE_PRIVATE)
  private fun manager(c: Context) = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
  private fun pending(c: Context, test: Boolean) = PendingIntent.getBroadcast(c, if (test) 92 else 91,
    Intent(c, ReminderReceiver::class.java).setAction(if (test) TEST else DAILY), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  private fun permitted(c: Context): Boolean {
    val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.createNotificationChannel(NotificationChannel(CHANNEL, "사진 공유 알림", NotificationManager.IMPORTANCE_DEFAULT))
    return NotificationManagerCompat.from(c).areNotificationsEnabled() && nm.getNotificationChannel(CHANNEL).importance != NotificationManager.IMPORTANCE_NONE
  }
  private fun next(hour: Int, minute: Int): Long {
    val calendar = Calendar.getInstance(TimeZone.getTimeZone("Asia/Seoul"))
    calendar.set(Calendar.HOUR_OF_DAY, hour); calendar.set(Calendar.MINUTE, minute)
    calendar.set(Calendar.SECOND, 0); calendar.set(Calendar.MILLISECOND, 0)
    if (calendar.timeInMillis <= System.currentTimeMillis()) calendar.add(Calendar.DAY_OF_YEAR, 1)
    return calendar.timeInMillis
  }
  private fun schedule(c: Context, whenAt: Long, test: Boolean) {
    // Inexact by design: no restricted exact-alarm permission and no background activity launch.
    manager(c).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, whenAt, pending(c, test))
  }
  fun status(c: Context): Map<String, Any?> {
    val p = prefs(c); val enabled = p.getBoolean("enabled", false)
    return mapOf("enabled" to enabled, "permitted" to permitted(c), "hour" to p.getInt("hour", 9), "minute" to p.getInt("minute", 0),
      "nextAt" to if (enabled && permitted(c)) p.getLong("next", 0).takeIf { it > System.currentTimeMillis() } else null, "precision" to "INEXACT_REQUEST_RECORDED")
  }
  fun set(c: Context, enabled: Boolean, hour: Int, minute: Int): Map<String, Any?> {
    require(hour in 0..23 && minute in 0..59)
    manager(c).cancel(pending(c, false))
    manager(c).cancel(pending(c, true))
    val actual = enabled && permitted(c)
    val at = if (actual) next(hour, minute) else 0
    // Record intent first; scheduling errors are returned and never shown as ready.
    check(prefs(c).edit().putBoolean("enabled", false).putInt("hour", hour).putInt("minute", minute).putLong("next", 0).commit())
    if (actual) {
      schedule(c, at, false)
      if (!prefs(c).edit().putBoolean("enabled", true).putLong("next", at).commit()) { manager(c).cancel(pending(c, false)); error("REMINDER_STORE_FAILED") }
    }
    return status(c)
  }
  fun test(c: Context) { check(permitted(c)) { "NOTIFICATIONS_DISABLED" }; schedule(c, System.currentTimeMillis() + 10_000, true) }
  fun refresh(c: Context) {
    val p = prefs(c)
    if (p.getBoolean("enabled", false)) {
      val at = next(p.getInt("hour", 9), p.getInt("minute", 0))
      schedule(c, at, false); p.edit().putLong("next", at).apply()
    }
  }
  fun receive(c: Context, intent: Intent) {
    when (intent.action) {
      DAILY, TEST -> {
        if (intent.action == DAILY && !prefs(c).getBoolean("enabled", false)) return
        if (intent.action == DAILY) refresh(c)
        if (!permitted(c)) return
        val launch = c.packageManager.getLaunchIntentForPackage(c.packageName) ?: return
        launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val open = PendingIntent.getActivity(c, 93, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(c, CHANNEL).setSmallIcon(android.R.drawable.ic_menu_gallery)
          .setContentTitle("SNS Gateway").setContentText("오늘 사진을 확인하고 공유하세요.")
          .setContentIntent(open).setAutoCancel(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).build()
        try { NotificationManagerCompat.from(c).notify(91, notification) } catch (_: SecurityException) { /* User revoked notifications. */ }
      }
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_MY_PACKAGE_REPLACED -> refresh(c)
    }
  }
}
class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) { try { LocalReminders.receive(context, intent) } catch (_: Exception) { /* Next foreground can repair; no raw private log. */ } }
}
