/// Keeps the app running while a waiter is signed in, so Ready alerts still ring with the screen
/// off or the phone in a pocket (F2d, D-83). An Android foreground service: the small "Café is
/// running" notification. It runs no code of its own; it only stops Android from pausing the app,
/// so the same connection and alert rules keep working.
library;

import 'package:flutter_foreground_task/flutter_foreground_task.dart';

abstract class KeepAlive {
  /// Ask for what it needs (once), then start. Call while the app is on screen (sign-in):
  /// Android 12+ refuses to start a foreground service from the background.
  Future<void> start();

  /// Put the latest alert in the notification, so it can be read on the lock screen.
  Future<void> show(String text);

  Future<void> stop();
}

class ForegroundKeepAlive implements KeepAlive {
  static const _title = 'Café: alerts are on';
  static const _idle = 'Keep the app open in the background. Do not swipe it away.';

  @override
  Future<void> start() async {
    // Android 13+: without this the notification is hidden (the service still runs).
    if (await FlutterForegroundTask.checkNotificationPermission() != NotificationPermission.granted) {
      await FlutterForegroundTask.requestNotificationPermission();
    }
    // Battery savers (Samsung, Tecno, Infinix ...) otherwise stop the app after a while.
    if (!await FlutterForegroundTask.isIgnoringBatteryOptimizations) {
      await FlutterForegroundTask.requestIgnoreBatteryOptimization();
    }

    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'cafe_alerts',
        channelName: 'Café alerts',
        channelDescription: 'Shows that Ready alerts are on, and the latest alert.',
        onlyAlertOnce: true, // the app plays its own sounds; the notification stays quiet
      ),
      iosNotificationOptions: const IOSNotificationOptions(showNotification: false, playSound: false),
      foregroundTaskOptions: ForegroundTaskOptions(
        eventAction: ForegroundTaskEventAction.nothing(), // no background code: the app itself keeps running
        allowWakeLock: true, // the CPU may not sleep through a message or the 2-minute reminder
        allowWifiLock: true, // nor may Wi-Fi
        // Killed by Android or swiped away: stop, so the notification never claims alerts work
        // when the app (and its connection) is gone.
        allowAutoRestart: false,
        stopWithTask: true,
      ),
    );
    if (await FlutterForegroundTask.isRunningService) return;
    await FlutterForegroundTask.startService(
      serviceId: 7,
      serviceTypes: [ForegroundServiceTypes.specialUse],
      notificationTitle: _title,
      notificationText: _idle,
    );
  }

  @override
  Future<void> show(String text) async {
    if (await FlutterForegroundTask.isRunningService) {
      await FlutterForegroundTask.updateService(notificationTitle: _title, notificationText: text);
    }
  }

  @override
  Future<void> stop() async {
    if (await FlutterForegroundTask.isRunningService) await FlutterForegroundTask.stopService();
  }
}
