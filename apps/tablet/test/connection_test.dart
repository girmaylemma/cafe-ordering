import 'dart:async';

import 'package:cafe_tablet/sync/connection.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  late List<Duration> waits;
  Connection connection(FakeServer server, [db]) {
    waits = [];
    final c = Connection(
      connect: server.connect,
      db: db ?? memoryDb(),
      delay: (d) async => waits.add(d),
      ackTimeout: const Duration(seconds: 5),
    );
    addTearDown(c.stop);
    return c;
  }

  test('on connect it goes online and asks for everything after the last seen seq', () async {
    final db = memoryDb();
    await db.setLastSeq(17);
    final socket = FakeSocket();
    final c = connection(FakeServer([socket]), db);

    c.start();
    await settle();

    expect(c.state, LinkState.online);
    expect(socket.sent.first, {'type': 'sync', 'since': 17});
  });

  test('an answer is matched to its command by key, even when pushes arrive first', () async {
    final socket = FakeSocket();
    final c = connection(FakeServer([socket]));
    c.start();
    await settle();

    final answer = c.send({'type': 'item.command', 'idempotencyKey': 'k1', 'itemId': 'i1', 'command': {'type': 'accept'}});
    socket.receive({'type': 'table.state', 'tableId': 't7', 'state': 'ordered', 'sessionId': 's', 'waiterId': 'hana'});
    socket.receive({'type': 'ack', 'idempotencyKey': 'other', 'result': {'ok': true}});
    socket.receive({'type': 'ack', 'idempotencyKey': 'k1', 'result': {'ok': true, 'seq': 3}});

    expect(await answer, {'ok': true, 'seq': 3});
  });

  test('events and catch-up results advance the stored seq and are passed on', () async {
    final db = memoryDb();
    final socket = FakeSocket();
    final c = connection(FakeServer([socket]), db);
    final pushes = <Map<String, dynamic>>[];
    c.pushes.listen(pushes.add);
    c.start();
    await settle();

    socket.receive({'type': 'sync.result', 'reloadRequired': false, 'events': [{'seq': 4, 'type': 'item.sent'}, {'seq': 5, 'type': 'item.accepted'}]});
    socket.receive({'type': 'event', 'event': {'seq': 6, 'type': 'item.ready'}});
    await settle();

    expect(await db.lastSeq(), 6);
    expect(pushes.map((p) => p['event']?['type'] ?? p['type']), ['item.sent', 'item.accepted', 'item.ready']);
  });

  test('a catch-up that is too long asks the app to reload everything', () async {
    final socket = FakeSocket();
    final c = connection(FakeServer([socket]));
    final pushes = <Map<String, dynamic>>[];
    c.pushes.listen(pushes.add);
    c.start();
    await settle();

    socket.receive({'type': 'sync.result', 'reloadRequired': true, 'events': []});
    await settle();

    expect(pushes.single['type'], 'reload');
  });

  test('after a drop: waiting commands fail, it reconnects with a growing wait, and syncs again', () async {
    final first = FakeSocket();
    final second = FakeSocket();
    final server = FakeServer([first, second]);
    server.failNextWith = null;
    final c = connection(server);
    c.start();
    await settle();

    final answer = c.send({'type': 'session.close', 'idempotencyKey': 'k1', 'sessionId': 's'});
    await first.drop();
    await expectLater(answer, throwsA(isA<ConnectionLost>()));
    await settle();

    expect(c.state, LinkState.online);
    expect(server.connects, 2);
    expect(waits, [const Duration(seconds: 1)]);
    expect(second.sent.first['type'], 'sync');
  });

  test('failed connection attempts wait 1, 2, 4 ... seconds, at most 30', () async {
    waits = [];
    var failures = 0;
    final done = Completer<void>();
    // Every attempt fails until 7 tries were made.
    Future<Socket> failing() async {
      failures++;
      if (failures >= 7) {
        if (!done.isCompleted) done.complete();
        return Completer<Socket>().future;
      }
      throw const SocketFailure('no route');
    }

    final c = Connection(connect: failing, db: memoryDb(), delay: (d) async => waits.add(d));
    addTearDown(c.stop);
    c.start();
    await done.future;

    expect(waits, const [Duration(seconds: 1), Duration(seconds: 2), Duration(seconds: 4), Duration(seconds: 8), Duration(seconds: 16), Duration(seconds: 30)]);
  });

  test('a close with code 4001 (access revoked) means signed out: no reconnect', () async {
    final socket = FakeSocket();
    final server = FakeServer([socket, FakeSocket()]);
    final c = connection(server);
    c.start();
    await settle();

    await socket.drop(4001);
    await settle();

    expect(c.state, LinkState.signedOut);
    expect(server.connects, 1);
  });

  test('SESSION_ENDED from the server also means signed out', () async {
    final socket = FakeSocket();
    final c = connection(FakeServer([socket]));
    c.start();
    await settle();

    socket.receive({'type': 'error', 'error': 'SESSION_ENDED'});
    await settle();

    expect(c.state, LinkState.signedOut);
  });

  test('sending while offline fails at once with NotConnected', () async {
    final c = connection(FakeServer([]));
    expect(() => c.send({'type': 'session.close', 'idempotencyKey': 'k', 'sessionId': 's'}), throwsA(isA<NotConnected>()));
  });
}
