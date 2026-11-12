/// Which pushes ring the waiter's tablet (W-07, K-06, design §3 step 7). Pure rules: the sound
/// and vibration are behind [AlertOutput], and timers and the clock are injected, so every rule
/// is tested without audio plugins or real waiting.
///
/// Rules:
/// - Only the table's CURRENT waiter is alerted (after a hand-over, the new one).
/// - Only LIVE pushes ring. Events caught up after a reconnect are history (marked `replay`),
///   but they still end a reminder (an item delivered while this tablet was offline).
/// - Ready rings loud, and once more after 2 minutes if the item is still ready on my table.
/// - Kitchen accepted rings soft. A kitchen undo shows a quiet correction.
/// - Items of one round arrive one by one: the same sound for the same table rings at most once
///   every few seconds (each item is still shown).
library;

import 'dart:async';

import '../data/database.dart';

enum AlertSound { soft, loud, info }

class Alert {
  const Alert(this.sound, this.text, {this.tableId});
  final AlertSound sound;
  final String text;
  final String? tableId;
}

/// Plays a sound and vibrates. The real one is [DeviceAlertOutput]; tests use a fake.
abstract class AlertOutput {
  void ring(AlertSound sound);
}

/// Run [run] after [after]; returns a function that cancels it.
typedef Schedule = void Function() Function(Duration after, void Function() run);

void Function() _timerSchedule(Duration after, void Function() run) => Timer(after, run).cancel;

class WaiterAlerts {
  WaiterAlerts({
    required this._db,
    required this.myUserId,
    required this._output,
    required this._staffName,
    Schedule? schedule,
    DateTime Function()? now,
  })  : _schedule = schedule ?? _timerSchedule,
        _now = now ?? DateTime.now;

  static const reminderAfter = Duration(minutes: 2);
  static const quietGap = Duration(seconds: 3);

  final AppDatabase _db;
  final String myUserId;
  final AlertOutput _output;
  final String? Function(String id) _staffName;
  final Schedule _schedule;
  final DateTime Function() _now;

  final _alerts = StreamController<Alert>.broadcast();
  final _reminders = <String, void Function()>{}; // item id -> cancel
  final _lastRing = <(AlertSound, String), DateTime>{};

  /// What to show on screen (the app shows each as a banner).
  Stream<Alert> get alerts => _alerts.stream;

  /// Call AFTER the push was applied to the database (the rules read the item's current table).
  Future<void> onPush(Map<String, dynamic> push) async {
    final event = push['type'] == 'event' ? (push['event'] as Map).cast<String, dynamic>() : null;
    // Any item that is no longer ready ends its reminder, even when we learn it from catch-up
    // (delivered while this tablet was offline): history never rings, but it still counts.
    if (event != null && event['to'] != 'ready') _cancelReminder(event['itemId'] as String);
    if (push['replay'] == true) return;
    switch (push['type']) {
      case 'event':
        await _onEvent(event!);
      case 'table.transferred':
        final table = await _db.tableById(push['tableId'] as String);
        if (table == null) return;
        final from = _staffName(push['fromWaiterId'] as String? ?? '');
        _alert(AlertSound.info, '${table.name} is now yours${from == null ? '' : ' (from $from)'}', table.id);
    }
  }

  Future<void> _onEvent(Map<String, dynamic> e) async {
    final itemId = e['itemId'] as String;
    final to = e['to'] as String?;
    final mine = await _myItem(itemId);
    if (mine == null) return;
    final (line, table) = mine;
    final what = '${line.qty}× ${line.nameEn}';

    switch ((e['type'], e['from'], to)) {
      case ('item.ready', _, 'ready'):
        _alert(AlertSound.loud, '${table.name} — ready: $what', table.id);
        _cancelReminder(itemId);
        _reminders[itemId] = _schedule(reminderAfter, () => unawaited(_remind(itemId)));
      case ('item.accepted', _, 'accepted'):
        _alert(AlertSound.soft, '${table.name} — kitchen accepted: $what', table.id);
      case ('item.undone', 'ready', _):
        _alert(AlertSound.info, '${table.name} — not ready yet: $what', table.id);
      case ('item.undone', 'accepted', _):
        _alert(AlertSound.info, '${table.name} — not accepted yet: $what', table.id);
    }
  }

  Future<void> _remind(String itemId) async {
    _reminders.remove(itemId);
    final mine = await _myItem(itemId); // still mine? (it may have been handed over)
    if (mine == null || mine.$1.state != 'ready') return;
    final (line, table) = mine;
    _alert(AlertSound.loud, '${table.name} — still waiting: ${line.qty}× ${line.nameEn}', table.id);
  }

  /// The item and its table, if that table is mine right now.
  Future<(OrderLine, CafeTable)?> _myItem(String itemId) async {
    final line = await _db.lineById(itemId);
    if (line == null) return null;
    final table = await _db.tableById(line.tableId);
    if (table == null || table.waiterId != myUserId) return null;
    return (line, table);
  }

  void _alert(AlertSound sound, String text, String tableId) {
    final now = _now();
    final key = (sound, tableId);
    final last = _lastRing[key];
    if (last == null || now.difference(last) >= quietGap) {
      _lastRing[key] = now;
      _output.ring(sound);
    }
    _alerts.add(Alert(sound, text, tableId: tableId));
  }

  void _cancelReminder(String itemId) => _reminders.remove(itemId)?.call();

  void dispose() {
    for (final cancel in _reminders.values) {
      cancel();
    }
    _reminders.clear();
    unawaited(_alerts.close());
  }
}
