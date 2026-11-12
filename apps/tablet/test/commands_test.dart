import 'package:cafe_tablet/data/database.dart';
import 'package:cafe_tablet/sync/commands.dart';
import 'package:cafe_tablet/sync/connection.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  late AppDatabase db;
  late Connection connection;
  late TableCommands commands;

  /// Online with [socket], or offline when it is null.
  Future<void> setUp_(FakeSocket? socket) async {
    db = memoryDb();
    connection = Connection(connect: FakeServer([?socket]).connect, db: db, delay: (_) async {}, ackTimeout: const Duration(seconds: 5));
    commands = TableCommands(connection);
    addTearDown(() async {
      await connection.stop();
      await db.close();
    });
    connection.start();
    await settle();
  }

  /// Run [action], answer it with [result], and return what the screen gets.
  Future<(ActionResult, Map<String, dynamic>)> answered(FakeSocket socket, Future<ActionResult> Function() action, Map<String, dynamic> result) async {
    final pending = action();
    await settle();
    final sent = socket.sent.last;
    socket.ackLast(result);
    return (await pending, sent);
  }

  group('item commands', () {
    test('Delivered sends item.command with a fresh idempotency key and no approval', () async {
      final socket = FakeSocket();
      await setUp_(socket);

      final (result, sent) = await answered(socket, () => commands.delivered('i1'), {'ok': true});

      expect(result.ok, isTrue);
      expect(sent['type'], 'item.command');
      expect(sent['itemId'], 'i1');
      expect(sent['command'], {'type': 'delivered'});
      expect(sent['idempotencyKey'], isA<String>());
    });

    test('two taps are two commands: each gets its own key', () async {
      final socket = FakeSocket();
      await setUp_(socket);

      await answered(socket, () => commands.cancel('i1'), {'ok': true});
      await answered(socket, () => commands.cancel('i2'), {'ok': true});

      final keys = socket.sent.where((m) => m['type'] == 'item.command').map((m) => m['idempotencyKey']).toSet();
      expect(keys, hasLength(2));
    });

    test('Cancel sends the cancel command', () async {
      final socket = FakeSocket();
      await setUp_(socket);

      final (_, sent) = await answered(socket, () => commands.cancel('i1'), {'ok': true});

      expect(sent['command'], {'type': 'cancel'});
    });

    test('a void with a typed manager PIN carries managerId and managerPin inside the command', () async {
      final socket = FakeSocket();
      await setUp_(socket);

      final (_, sent) = await answered(
        socket,
        () => commands.voidItem('i1', reason: 'Spilled', approval: const ManagerApproval(managerId: 'm1', managerPin: '123456')),
        {'ok': true},
      );

      expect(sent['command'], {'type': 'void', 'reason': 'Spilled', 'managerId': 'm1', 'managerPin': '123456'});
    });

    test('a void by a signed-in manager sends no PIN (the server checks the role, D-57)', () async {
      final socket = FakeSocket();
      await setUp_(socket);

      final (_, sent) = await answered(socket, () => commands.voidItem('i1', reason: 'Spilled'), {'ok': true});

      expect(sent['command'], {'type': 'void', 'reason': 'Spilled'});
    });

    test('a refusal returns the server error code', () async {
      final socket = FakeSocket();
      await setUp_(socket);

      final (result, _) = await answered(socket, () => commands.cancel('i1'), {'ok': false, 'error': 'NEEDS_MANAGER_VOID'});

      expect(result.ok, isFalse);
      expect(result.error, 'NEEDS_MANAGER_VOID');
    });

    test('a locked manager PIN tells how long to wait', () async {
      final socket = FakeSocket();
      await setUp_(socket);

      final (result, _) = await answered(
        socket,
        () => commands.voidItem('i1', reason: 'x', approval: const ManagerApproval(managerId: 'm1', managerPin: '000000')),
        {'ok': false, 'error': 'MANAGER_LOCKED', 'retryAfterMs': 180000},
      );

      expect(result.error, 'MANAGER_LOCKED');
      expect(result.retryAfter, const Duration(minutes: 3));
    });
  });

  group('table actions', () {
    test('close, move, merge and hand over send their fields', () async {
      final socket = FakeSocket();
      await setUp_(socket);

      final (_, close) = await answered(socket, () => commands.close('s1'), {'ok': true});
      final (_, move) = await answered(socket, () => commands.move('s1', toTableId: 't9'), {'ok': true});
      final (_, merge) = await answered(socket, () => commands.merge('s1', intoSessionId: 's2'), {'ok': true});
      final (_, handOver) = await answered(socket, () => commands.handOver('s1', toWaiterId: 'abebe'), {'ok': true});

      expect([close['type'], close['sessionId']], ['session.close', 's1']);
      expect([move['type'], move['sessionId'], move['toTableId']], ['session.move', 's1', 't9']);
      expect([merge['type'], merge['sessionId'], merge['intoSessionId']], ['session.merge', 's1', 's2']);
      expect([handOver['type'], handOver['sessionId'], handOver['toWaiterId']], ['session.transfer', 's1', 'abebe']);
    });

    test('closing a table with unfinished items is refused with ITEMS_NOT_FINISHED', () async {
      final socket = FakeSocket();
      await setUp_(socket);

      final (result, _) = await answered(socket, () => commands.close('s1'), {'ok': false, 'error': 'ITEMS_NOT_FINISHED'});

      expect(result.error, 'ITEMS_NOT_FINISHED');
    });
  });

  group('without a connection (D-18)', () {
    test('offline: nothing is sent and NOTHING is queued; the answer is NEEDS_CONNECTION', () async {
      await setUp_(null);

      final result = await commands.cancel('i1');

      expect(result.error, 'NEEDS_CONNECTION');
      expect(await db.pendingMessages(), isEmpty);
    });

    test('the connection drops before the answer: NO_ANSWER (it may have happened)', () async {
      final socket = FakeSocket();
      await setUp_(socket);

      final pending = commands.close('s1');
      await settle();
      await socket.drop();

      expect((await pending).error, 'NO_ANSWER');
      expect(await db.pendingMessages(), isEmpty);
    });
  });
}
