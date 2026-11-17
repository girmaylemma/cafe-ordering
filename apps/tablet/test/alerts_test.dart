import 'package:cafe_tablet/alerts/waiter_alerts.dart';
import 'package:cafe_tablet/data/database.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

class FakeOutput implements AlertOutput {
  final rings = <AlertSound>[];
  @override
  void ring(AlertSound sound) => rings.add(sound);
}

/// Timers that run only when the test says so.
class ManualTimers {
  final _jobs = <({Duration after, void Function() run, List<bool> cancelled})>[];

  void Function() schedule(Duration after, void Function() run) {
    final cancelled = [false];
    _jobs.add((after: after, run: run, cancelled: cancelled));
    return () => cancelled[0] = true;
  }

  List<Duration> get waiting => [for (final j in _jobs) if (!j.cancelled[0]) j.after];

  /// Run every job that is still waiting (as if their time has come).
  Future<void> fireAll() async {
    final due = [for (final j in _jobs) if (!j.cancelled[0]) j];
    _jobs.clear();
    for (final j in due) {
      j.run();
    }
    await settle();
  }
}

Map<String, dynamic> event(String itemId, String type, String from, String to, {int seq = 1}) =>
    {'type': 'event', 'event': {'seq': seq, 'orderId': 'o1', 'itemId': itemId, 'stationId': 'kitchen', 'type': type, 'from': from, 'to': to, 'actor': {}, 'at': 1}};

void main() {
  late AppDatabase db;
  late FakeOutput output;
  late ManualTimers timers;
  late WaiterAlerts alerts;
  late List<Alert> shown;
  var clock = DateTime(2026, 11, 12, 12);

  setUp(() async {
    db = memoryDb();
    output = FakeOutput();
    timers = ManualTimers();
    shown = [];
    clock = DateTime(2026, 11, 12, 12);
    alerts = WaiterAlerts(
      db: db,
      myUserId: 'hana',
      output: output,
      staffName: (id) => {'abebe': 'Abebe'}[id],
      schedule: timers.schedule,
      now: () => clock,
    );
    alerts.alerts.listen(shown.add);
    await db.replaceTables([
      {'id': 't7', 'name': 'Table 7', 'area': null, 'seats': 4, 'sortOrder': 0, 'state': 'ordered', 'sessionId': 's1', 'waiterId': 'hana'},
      {'id': 't8', 'name': 'Table 8', 'area': null, 'seats': 4, 'sortOrder': 1, 'state': 'ordered', 'sessionId': 's2', 'waiterId': 'abebe'},
    ]);
    for (final (id, table, name) in [('a', 't7', 'Shiro'), ('b', 't7', 'Tibs'), ('c', 't7', 'Kitfo'), ('x', 't8', 'Firfir')]) {
      await db.addLocalLines([
        OrderLinesCompanion.insert(id: id, orderId: 'o1', tableId: table, menuItemId: 'm', nameEn: name, qty: 2, priceSantim: 0, state: 'sent', sync: 'sent', createdAt: 1),
      ]);
    }
    addTearDown(() async {
      alerts.dispose();
      await db.close();
    });
  });

  /// What WorkSession does: the database first, then the alert rules.
  Future<void> push(Map<String, dynamic> message) async {
    if (message['type'] == 'event') await db.applyItemEvent((message['event'] as Map).cast<String, dynamic>());
    await alerts.onPush(message);
    await settle();
  }

  group('ready (W-07)', () {
    test('an item ready on MY table rings loud and says which table and item', () async {
      await push(event('a', 'item.ready', 'accepted', 'ready'));

      expect(output.rings, [AlertSound.loud]);
      expect(shown.single.text, 'Table 7 — ready: 2× Shiro');
      expect(shown.single.sound, AlertSound.loud);
    });

    test("another waiter's table: no sound, nothing shown", () async {
      await push(event('x', 'item.ready', 'accepted', 'ready'));

      expect(output.rings, isEmpty);
      expect(shown, isEmpty);
    });

    test('an item this tablet does not know: nothing', () async {
      await push(event('unknown', 'item.ready', 'accepted', 'ready'));
      expect(output.rings, isEmpty);
    });

    test('events caught up after a reconnect are history: no sound and no reminder', () async {
      await push({...event('a', 'item.ready', 'accepted', 'ready'), 'replay': true});

      expect(output.rings, isEmpty);
      expect(timers.waiting, isEmpty);
    });

    test('still ready after 2 minutes: rings again, once', () async {
      await push(event('a', 'item.ready', 'accepted', 'ready'));
      expect(timers.waiting, [const Duration(minutes: 2)]);

      clock = clock.add(const Duration(minutes: 2));
      await timers.fireAll();

      expect(output.rings, [AlertSound.loud, AlertSound.loud]);
      expect(shown.last.text, 'Table 7 — still waiting: 2× Shiro');
      expect(timers.waiting, isEmpty); // only one reminder
    });

    test('delivered before 2 minutes: no reminder', () async {
      await push(event('a', 'item.ready', 'accepted', 'ready'));
      await push(event('a', 'item.delivered', 'ready', 'delivered', seq: 2));

      expect(timers.waiting, isEmpty);
      await timers.fireAll();
      expect(output.rings, [AlertSound.loud]);
    });

    test('delivered while offline (arrives in catch-up): the reminder is cancelled too', () async {
      await push(event('a', 'item.ready', 'accepted', 'ready'));
      await push({...event('a', 'item.delivered', 'ready', 'delivered', seq: 2), 'replay': true});

      expect(timers.waiting, isEmpty); // history doesn't ring, but it still ends the reminder
      await timers.fireAll();
      expect(output.rings, [AlertSound.loud]);
    });

    test('handed to another waiter before 2 minutes: the reminder does not ring here', () async {
      await push(event('a', 'item.ready', 'accepted', 'ready'));
      await db.setTableState('t7', 'ready', 's1', 'abebe');

      clock = clock.add(const Duration(minutes: 2));
      await timers.fireAll();

      expect(output.rings, [AlertSound.loud]);
    });

    test('three items of a round ready together ring once, not three times', () async {
      await push(event('a', 'item.ready', 'accepted', 'ready', seq: 1));
      await push(event('b', 'item.ready', 'accepted', 'ready', seq: 2));
      await push(event('c', 'item.ready', 'accepted', 'ready', seq: 3));

      expect(output.rings, [AlertSound.loud]);
      expect(shown, hasLength(3)); // each item is still shown

      clock = clock.add(const Duration(seconds: 10));
      await push(event('a', 'item.ready', 'accepted', 'ready', seq: 4));
      expect(output.rings, [AlertSound.loud, AlertSound.loud]); // later: rings again
    });
  });

  group('kitchen accepted', () {
    test('rings soft, once for a whole round accepted item by item', () async {
      await push(event('a', 'item.accepted', 'sent', 'accepted', seq: 1));
      await push(event('b', 'item.accepted', 'sent', 'accepted', seq: 2));

      expect(output.rings, [AlertSound.soft]);
      expect(shown.first.text, 'Table 7 — kitchen accepted: 2× Shiro');
    });
  });

  group('kitchen undo (K-06): a correction', () {
    test('undo of Ready: "not ready yet", quietly, and the reminder is cancelled', () async {
      await push(event('a', 'item.ready', 'accepted', 'ready'));
      await push(event('a', 'item.undone', 'ready', 'accepted', seq: 2));

      expect(shown.last.text, 'Table 7 — not ready yet: 2× Shiro');
      expect(shown.last.sound, AlertSound.info);
      expect(timers.waiting, isEmpty);
    });

    test('undo of Accept: "not accepted yet"', () async {
      await push(event('a', 'item.accepted', 'sent', 'accepted'));
      await push(event('a', 'item.undone', 'accepted', 'sent', seq: 2));

      expect(shown.last.text, 'Table 7 — not accepted yet: 2× Shiro');
    });
  });

  test('a table handed to me says so, with who it came from', () async {
    await push({'type': 'table.transferred', 'tableId': 't7', 'sessionId': 's1', 'fromWaiterId': 'abebe'});

    expect(output.rings, [AlertSound.info]);
    expect(shown.single.text, 'Table 7 is now yours (from Abebe)');
  });
}
