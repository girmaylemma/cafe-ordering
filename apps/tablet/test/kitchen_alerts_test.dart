// When the kitchen tablet rings and flashes (F3b, K-02), and the server clock (K-04).
import 'package:cafe_tablet/alerts/kitchen_alerts.dart';
import 'package:cafe_tablet/alerts/waiter_alerts.dart';
import 'package:cafe_tablet/data/database.dart';
import 'package:cafe_tablet/sync/server_clock.dart';
import 'package:flutter_test/flutter_test.dart';

import 'alerts_test.dart' show FakeOutput;
import 'fakes.dart';
import 'tickets_db_test.dart' show sent;

void main() {
  late AppDatabase db;
  late FakeOutput output;
  late KitchenAlerts alerts;
  late List<KitchenFlash> flashes;
  var now = DateTime(2026, 11, 17, 12);

  setUp(() {
    db = memoryDb();
    output = FakeOutput();
    now = DateTime(2026, 11, 17, 12);
    alerts = KitchenAlerts(db: db, output: output, now: () => now);
    flashes = [];
    alerts.flashes.listen(flashes.add);
  });
  tearDown(() async {
    alerts.dispose();
    await db.close();
  });

  /// As WorkSession does it: the database first, then the rules.
  Future<void> push(Map<String, dynamic> event, {bool replay = false}) async {
    await db.applyTicketEvent(event);
    await alerts.onPush({'type': 'event', 'event': event, if (replay) 'replay': true});
    await settle();
  }

  Map<String, dynamic> moved(String itemId, String type, String to, {String orderId = 'o1'}) =>
      {'itemId': itemId, 'orderId': orderId, 'type': type, 'to': to, 'at': 2000};

  test('a new ticket rings loud and flashes, once for all the items of one round', () async {
    await push(sent('i1'));
    await push(sent('i2'));
    await push(sent('i3'));

    expect(output.rings, [AlertSound.loud]);
    expect(flashes, [KitchenFlash.newTicket]);
  });

  test('a new round more than 3 s later rings again', () async {
    await push(sent('i1'));
    now = now.add(const Duration(seconds: 4));
    await push(sent('i2', orderId: 'o2'));

    expect(output.rings, hasLength(2));
  });

  test('a void rings and flashes red (the cook may be making it)', () async {
    await push(sent('i1'));
    await push(sent('i2'));
    now = now.add(const Duration(seconds: 4));
    await push(moved('i1', 'item.voided', 'voided'));

    expect(output.rings, [AlertSound.loud, AlertSound.loud]);
    expect(flashes, [KitchenFlash.newTicket, KitchenFlash.voided]);
  });

  test("the kitchen's own taps and the waiter's delivered never ring", () async {
    await push(sent('i1'));
    now = now.add(const Duration(seconds: 4));
    await push(moved('i1', 'item.accepted', 'accepted'));
    await push(moved('i1', 'item.ready', 'ready'));
    await push(moved('i1', 'item.delivered', 'delivered'));

    expect(output.rings, hasLength(1)); // only the new ticket
  });

  test('after an outage: new tickets in the catch-up ring ONCE, when the catch-up is complete', () async {
    await push(sent('i1'), replay: true);
    await push(sent('i2', orderId: 'o2'), replay: true);
    expect(output.rings, isEmpty); // not yet: the catch-up is still arriving

    await alerts.onPush({'type': 'synced', 'serverNow': 1});
    await settle(); // a broadcast stream delivers on the next turn

    expect(output.rings, [AlertSound.loud]);
    expect(flashes, [KitchenFlash.newTicket]);
  });

  test('a catch-up of rounds already finished meanwhile stays silent (history)', () async {
    await push(sent('i1'), replay: true);
    await push(moved('i1', 'item.delivered', 'delivered'), replay: true);

    await alerts.onPush({'type': 'synced', 'serverNow': 1});

    expect(output.rings, isEmpty);
  });

  test('a catch-up with no new tickets stays silent, and the next one does not remember old ones', () async {
    await push(sent('i1'), replay: true);
    await alerts.onPush({'type': 'synced', 'serverNow': 1});
    now = now.add(const Duration(seconds: 10));

    await alerts.onPush({'type': 'synced', 'serverNow': 2}); // a reconnect with nothing new

    expect(output.rings, hasLength(1));
  });

  group('server clock', () {
    test('ticket ages use the server clock, even when the tablet clock is 6 minutes slow', () {
      var tablet = DateTime.fromMillisecondsSinceEpoch(1000000);
      final clock = ServerClock(now: () => tablet);
      clock.learn(1000000 + 6 * 60000); // the server is 6 minutes ahead of this tablet

      tablet = tablet.add(const Duration(seconds: 30));

      expect(clock.nowMs(), 1000000 + 6 * 60000 + 30000);
    });

    test('before it learns anything, it trusts the tablet clock; null from an old server changes nothing', () {
      final clock = ServerClock(now: () => DateTime.fromMillisecondsSinceEpoch(5000));
      clock.learn(null);
      expect(clock.nowMs(), 5000);
    });
  });
}
