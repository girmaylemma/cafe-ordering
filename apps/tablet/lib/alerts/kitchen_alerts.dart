/// When the kitchen or bar tablet rings and flashes (K-02, F3b). Pure rules, like WaiterAlerts:
/// the sound is behind [AlertOutput] and the clock is injected, so every rule is tested.
///
/// Rules:
/// - A new ticket rings loud and flashes. The items of one round arrive one by one: the same
///   kind of alert rings at most once every few seconds.
/// - A void rings and flashes red: the cook may already be making it.
/// - The kitchen's own taps (accept, ready, undo) and the waiter's delivered never ring.
/// - After an outage, new tickets that arrived in the catch-up ring ONCE, when the catch-up is
///   complete (`synced`), and only if their round is still open: finished rounds are history.
library;

import 'dart:async';

import '../data/database.dart';
import 'waiter_alerts.dart' show AlertOutput, AlertSound;

enum KitchenFlash { newTicket, voided }

class KitchenAlerts {
  KitchenAlerts({required this._db, required this._output, DateTime Function()? now}) : _now = now ?? DateTime.now;

  static const quietGap = Duration(seconds: 3);

  final AppDatabase _db;
  final AlertOutput _output;
  final DateTime Function() _now;

  final _flashes = StreamController<KitchenFlash>.broadcast();
  final _lastAlert = <KitchenFlash, DateTime>{};

  /// New tickets seen in the catch-up that is arriving now.
  final _caughtUp = <String>{};

  /// The screen flashes for each of these.
  Stream<KitchenFlash> get flashes => _flashes.stream;

  /// Call AFTER the push was applied to the database (the catch-up rule reads the tickets).
  Future<void> onPush(Map<String, dynamic> push) async {
    switch (push['type']) {
      case 'event':
        final e = (push['event'] as Map).cast<String, dynamic>();
        if (push['replay'] == true) {
          if (e['type'] == 'item.sent') _caughtUp.add(e['itemId'] as String);
          return;
        }
        if (e['type'] == 'item.sent') _alert(KitchenFlash.newTicket);
        if (e['type'] == 'item.voided') _alert(KitchenFlash.voided);
      case 'synced':
        if (_caughtUp.isEmpty) return;
        final ids = {..._caughtUp};
        _caughtUp.clear();
        if (await _db.anyTicket(ids)) _alert(KitchenFlash.newTicket);
    }
  }

  /// After a too-long outage the tickets are downloaded instead of replayed: ring once if the
  /// download brought rounds this tablet had not shown yet.
  void newTicketsDownloaded() => _alert(KitchenFlash.newTicket);

  void _alert(KitchenFlash kind) {
    final now = _now();
    final last = _lastAlert[kind];
    if (last != null && now.difference(last) < quietGap) return;
    _lastAlert[kind] = now;
    _output.ring(AlertSound.loud);
    _flashes.add(kind);
  }

  void dispose() => unawaited(_flashes.close());
}
