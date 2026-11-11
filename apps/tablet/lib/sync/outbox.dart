/// Send now, or keep for later: no round taken by a waiter is ever lost (design goal 3).
///
/// Rules:
/// - Only `order.send` and `session.open` may wait offline (D-18); other actions need a connection.
/// - `queuedOffline` is decided ONCE, when the waiter taps Send. The server's duplicate check
///   compares the whole message, so a retry must be byte-identical to the first attempt.
/// - When the connection returns, waiting messages go one at a time, oldest first. A refusal is
///   kept as "needs attention" (never silently dropped); a server error stops and retries later.
library;

import 'dart:async';
import 'dart:convert';

import '../data/database.dart';
import 'connection.dart';

sealed class SubmitResult {
  const SubmitResult();
}

/// The server answered (the answer may still be a refusal: check result['ok']).
class Sent extends SubmitResult {
  const Sent(this.result);
  final Map<String, dynamic> result;
}

/// Kept on the tablet; it goes when the connection returns.
class Queued extends SubmitResult {
  const Queued();
}

/// This action needs a live connection (close, move, merge, hand over, item taps).
class OfflineNotAllowed implements Exception {
  const OfflineNotAllowed(this.type);
  final String type;
}

/// Errors after which the same message can simply be tried again later.
const _retryLater = {'INTERNAL_ERROR'};

class Outbox {
  Outbox(this._db, this._connection, {DateTime Function()? now}) : _now = now ?? DateTime.now;

  static const queueable = {'order.send', 'session.open'};

  final AppDatabase _db;
  final Connection _connection;
  final DateTime Function() _now;
  StreamSubscription<LinkState>? _states;
  bool _draining = false;
  bool _drainAgain = false;

  /// Start sending waiting messages whenever the connection comes online.
  void start() {
    _states ??= _connection.states.listen((s) {
      if (s == LinkState.online) unawaited(drain());
    });
    if (_connection.state == LinkState.online) unawaited(drain());
  }

  Future<void> stop() async {
    await _states?.cancel();
    _states = null;
  }

  Future<SubmitResult> submit(Map<String, dynamic> message) async {
    final type = message['type'] as String;
    if (_connection.state != LinkState.online) return _keepOffline(message, type);
    try {
      return Sent(await _connection.send(message));
    } on NotConnected {
      return _keepOffline(message, type); // nothing was sent
    } on Object catch (e) {
      if (e is! ConnectionLost && e is! TimeoutException) rethrow;
      // Sent, but the answer was lost: it may already be applied. Keep the SAME message.
      if (!queueable.contains(type)) rethrow;
      await _db.enqueue(_keyOf(message), jsonEncode(message), _now());
      return const Queued();
    }
  }

  Future<SubmitResult> _keepOffline(Map<String, dynamic> message, String type) async {
    if (!queueable.contains(type)) throw OfflineNotAllowed(type);
    final kept = type == 'order.send' ? {...message, 'queuedOffline': true} : message;
    await _db.enqueue(_keyOf(kept), jsonEncode(kept), _now());
    return const Queued();
  }

  /// Send waiting messages, oldest first. Safe to call any time; runs one drain at a time.
  Future<void> drain() async {
    if (_draining) {
      _drainAgain = true;
      return;
    }
    _draining = true;
    try {
      do {
        _drainAgain = false;
        for (final waiting in await _db.pendingMessages()) {
          final Map<String, dynamic> result;
          try {
            result = await _connection.send(jsonDecode(waiting.message) as Map<String, dynamic>);
          } on Object {
            return; // connection gone or no answer: try again when it is back
          }
          if (result['ok'] == true) {
            await _db.removeFromOutbox(waiting.key);
          } else if (_retryLater.contains(result['error'])) {
            return; // the server had a problem; keep the order and retry later
          } else {
            await _db.markNeedsAttention(waiting.key, '${result['error']}');
          }
        }
      } while (_drainAgain);
    } finally {
      _draining = false;
    }
  }

  static String _keyOf(Map<String, dynamic> message) => (message['idempotencyKey'] ?? message['orderId']) as String;
}
