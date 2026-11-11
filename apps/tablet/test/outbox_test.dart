import 'dart:convert';

import 'package:cafe_tablet/data/database.dart';
import 'package:cafe_tablet/sync/connection.dart';
import 'package:cafe_tablet/sync/outbox.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

Map<String, dynamic> round(String orderId) => {
      'type': 'order.send',
      'orderId': orderId,
      'sessionId': 's1',
      'tableId': 't7',
      'createdAt': 1,
      'queuedOffline': false,
      'items': [
        {'id': '$orderId-i', 'menuItemId': 'shiro', 'qty': 1, 'note': null, 'options': <String>[]},
      ],
    };

void main() {
  late AppDatabase db;
  late Connection connection;
  late Outbox outbox;
  var clock = DateTime(2026, 11, 11, 12);

  Future<void> setUp_(List<FakeSocket> sockets) async {
    db = memoryDb();
    connection = Connection(connect: FakeServer(sockets).connect, db: db, delay: (_) async {}, ackTimeout: const Duration(seconds: 5));
    outbox = Outbox(db, connection, now: () => clock = clock.add(const Duration(microseconds: 1)));
    addTearDown(() async {
      await outbox.stop();
      await connection.stop();
      await db.close();
    });
  }

  test('offline: a round is queued with queuedOffline true; nothing is sent', () async {
    await setUp_([]);

    final result = await outbox.submit(round('o1'));

    expect(result, isA<Queued>());
    final stored = jsonDecode((await db.pendingMessages()).single.message) as Map<String, dynamic>;
    expect(stored['queuedOffline'], isTrue);
  });

  test('online: a round is sent live and its answer returned', () async {
    final socket = FakeSocket();
    await setUp_([socket]);
    connection.start();
    await settle();

    final pending = outbox.submit(round('o1'));
    await settle();
    expect(socket.sent.last['queuedOffline'], isFalse);
    socket.ackLast({'ok': true, 'round': 1});

    expect(await pending, isA<Sent>().having((s) => s.result['round'], 'round', 1));
    expect(await db.pendingMessages(), isEmpty);
  });

  test('a live round whose answer is lost is queued UNCHANGED (a retry must be identical)', () async {
    final socket = FakeSocket();
    await setUp_([socket]);
    connection.start();
    await settle();

    final pending = outbox.submit(round('o1'));
    await settle();
    final firstAttempt = socket.sent.last;
    await socket.drop();

    expect(await pending, isA<Queued>());
    expect(jsonDecode((await db.pendingMessages()).single.message), firstAttempt);
  });

  test('when the connection returns, queued rounds are sent in the order they were taken', () async {
    final socket = FakeSocket();
    await setUp_([socket]);
    await outbox.submit({'type': 'session.open', 'idempotencyKey': 'open-1', 'sessionId': 's1', 'tableId': 't7', 'guests': 2});
    await outbox.submit(round('o1'));
    await outbox.submit(round('o2'));
    outbox.start();

    connection.start();
    await settle();
    for (var i = 0; i < 3; i++) {
      socket.ackLast({'ok': true});
      await settle();
      await settle();
    }

    final sentKeys = socket.sent.where((m) => m['type'] != 'sync').map((m) => m['idempotencyKey'] ?? m['orderId']);
    expect(sentKeys, ['open-1', 'o1', 'o2']);
    expect(await db.pendingMessages(), isEmpty);
  });

  test('a refused queued round is kept as "needs attention" and the next one still goes', () async {
    final socket = FakeSocket();
    await setUp_([socket]);
    await outbox.submit(round('o1'));
    await outbox.submit(round('o2'));
    outbox.start();
    connection.start();
    await settle();

    socket.ackLast({'ok': false, 'error': 'TABLE_NOT_FOUND'});
    await settle();
    await settle();
    socket.ackLast({'ok': true});
    await settle();
    await settle();

    expect(await db.pendingMessages(), isEmpty);
    final all = await db.select(db.outboxEntries).get();
    expect(all.single.key, 'o1');
    expect([all.single.status, all.single.error], ['needs_attention', 'TABLE_NOT_FOUND']);
  });

  test('a server error (INTERNAL_ERROR) keeps the round queued and stops for a later retry', () async {
    final socket = FakeSocket();
    await setUp_([socket]);
    await outbox.submit(round('o1'));
    await outbox.submit(round('o2'));
    outbox.start();
    connection.start();
    await settle();

    socket.ackLast({'ok': false, 'error': 'INTERNAL_ERROR'});
    await settle();
    await settle();

    expect((await db.pendingMessages()).map((m) => m.key), ['o1', 'o2']);
    expect(socket.sent.where((m) => m['type'] == 'order.send'), hasLength(1)); // o2 was not tried yet
  });

  test('closing, moving and other table actions are refused while offline (D-18)', () async {
    await setUp_([]);
    for (final type in ['session.close', 'session.move', 'item.command']) {
      expect(() => outbox.submit({'type': type, 'idempotencyKey': 'k-$type'}), throwsA(isA<OfflineNotAllowed>()));
    }
    expect(await db.pendingMessages(), isEmpty);
  });
}
