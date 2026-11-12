/// The real sound and vibration (audioplayers + vibration). Kept tiny and free of rules:
/// everything that decides WHETHER to ring is in waiter_alerts.dart, where it is tested.
library;

import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:vibration/vibration.dart';

import 'waiter_alerts.dart';

class DeviceAlertOutput implements AlertOutput {
  final _player = AudioPlayer();

  /// Vibration patterns: wait, buzz, wait, buzz ... (milliseconds).
  static const _patterns = {
    AlertSound.loud: [0, 400, 150, 400, 150, 400],
    AlertSound.soft: [0, 120],
    AlertSound.info: [0, 200],
  };

  @override
  void ring(AlertSound sound) {
    // Never let a sound or vibration problem break the app: an alert is best effort,
    // and the item's state is on screen either way.
    unawaited(_play(sound).catchError((Object _) {}));
    unawaited(_vibrate(sound).catchError((Object _) {}));
  }

  Future<void> _play(AlertSound sound) async {
    await _player.stop(); // a new alert replaces one still playing
    await _player.play(AssetSource('sounds/${sound.name}.wav'), volume: 1.0);
  }

  Future<void> _vibrate(AlertSound sound) async {
    if (await Vibration.hasVibrator()) await Vibration.vibrate(pattern: _patterns[sound]!);
  }

  Future<void> dispose() => _player.dispose();
}
