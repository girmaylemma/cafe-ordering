/// Keeps the screen on while the kitchen screen is shown (K-07, F3d). Behind an interface so tests
/// need no plugin; the real one is `wakelock_plus` (Android's keep-screen-on window flag: no
/// permission, and it ends by itself if the app is closed).
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

abstract class ScreenAwake {
  Future<void> keepOn();
  Future<void> allowSleep();
}

class WakelockScreenAwake implements ScreenAwake {
  // Best effort, like the waiter's alerts: a plugin problem must never break the kitchen screen.
  @override
  Future<void> keepOn() => WakelockPlus.enable().catchError((Object _) {});

  @override
  Future<void> allowSleep() => WakelockPlus.disable().catchError((Object _) {});
}

/// Replaced by a fake in tests.
final screenAwakeProvider = Provider<ScreenAwake>((ref) => WakelockScreenAwake());
