import 'dart:convert';

import 'package:cafe_tablet/alerts/keep_alive.dart';
import 'package:cafe_tablet/alerts/waiter_alerts.dart';
import 'package:cafe_tablet/api/api_client.dart';
import 'package:cafe_tablet/data/database.dart';
import 'package:cafe_tablet/session/work_session.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'alerts_test.dart' show FakeOutput;
import 'fakes.dart';

const waiter = DeviceInfo(id: 'd1', name: 'Tab 1', kind: DeviceKind.waiter, stationId: null);

Map<String, dynamic> menuJson(String itemName) => {
      'categories': [
        {'id': 'c1', 'nameEn': 'Food', 'nameAm': null, 'sortOrder': 0},
      ],
      'items': [
        {'id': 'shiro', 'categoryId': 'c1', 'nameEn': itemName, 'nameAm': null, 'priceSantim': 18000, 'stationId': 'kitchen', 'fasting': false, 'soldOut': false, 'sortOrder': 0, 'optionGroupIds': <String>[]},
      ],
      'optionGroups': <Object>[],
    };

Map<String, dynamic> tablesJson(String state) => {
      'tables': [
        {'id': 't7', 'name': 'Table 7', 'area': 'Inside', 'seats': 4, 'sortOrder': 0, 'state': state, 'sessionId': null, 'waiterId': null},
      ],
    };

class _Server {
  String itemName = 'Shiro';
  String tableState = 'free';
  bool offline = false;
  int menuDownloads = 0;
  int tableDownloads = 0;
  bool revoked = false;

  ApiClient api() => ApiClient(
        MockClient((r) async {
          if (offline) throw http.ClientException('no route');
          if (revoked) return http.Response('{"error":"UNAUTHORIZED_DEVICE"}', 401);
          switch (r.url.path) {
            case '/menu':
              menuDownloads++;
              return http.Response(jsonEncode(menuJson(itemName)), 200);
            case '/tables':
              tableDownloads++;
              return http.Response(jsonEncode(tablesJson(tableState)), 200);
            case '/staff':
              return http.Response(jsonEncode({'staff': [{'id': 'hana', 'name': 'Hana', 'role': 'waiter'}]}), 200);
          }
          return http.Response('{}', 404);
        }),
        Uri.parse('http://server'),
      );
}

void main() {
  late AppDatabase db;
  late _Server server;
  var accessEnded = 0;

  Future<(WorkSession, List<FakeSocket>)> start(List<FakeSocket> sockets) async {
    db = memoryDb();
    accessEnded = 0;
    final fakeServer = FakeServer(sockets);
    final session = WorkSession(
      api: server.api(),
      db: db,
      device: waiter,
      deviceToken: 't',
      connect: fakeServer.connect,
      delay: (_) async {},
      onAccessEnded: () async => accessEnded++,
    );
    addTearDown(() async {
      await session.stop();
      await db.close();
    });
    await session.start();
    await settle();
    return (session, sockets);
  }

  setUp(() => server = _Server());

  test('on start it downloads the menu, tables and staff into the local database', () async {
    final (session, _) = await start([FakeSocket()]);

    expect((await db.select(db.menuItems).get()).single.nameEn, 'Shiro');
    expect((await db.select(db.cafeTables).get()).single.name, 'Table 7');
    expect(session.staffName('hana'), 'Hana');
  });

  test('table-state and sold-out pushes update the local database', () async {
    final socket = FakeSocket();
    await start([socket]);

    socket.receive({'type': 'table.state', 'tableId': 't7', 'state': 'ready', 'sessionId': 's1', 'waiterId': 'hana'});
    socket.receive({'type': 'menu.sold_out', 'menuItemId': 'shiro', 'soldOut': true});
    await settle();

    expect((await db.select(db.cafeTables).get()).single.state, 'ready');
    expect((await db.select(db.menuItems).get()).single.soldOut, isTrue);
  });

  test('a "reload" push downloads the menu and tables again', () async {
    final socket = FakeSocket();
    await start([socket]);
    server.itemName = 'Shiro wot';

    socket.receive({'type': 'sync.result', 'reloadRequired': true, 'events': <Object>[]});
    await settle();

    expect((await db.select(db.menuItems).get()).single.nameEn, 'Shiro wot');
  });

  test('every time the connection comes back, tables are downloaded again (states may have changed)', () async {
    final first = FakeSocket();
    await start([first, FakeSocket()]);
    final before = server.tableDownloads;
    server.tableState = 'ordered';

    await first.drop();
    await settle();

    expect(server.tableDownloads, greaterThan(before));
    expect((await db.select(db.cafeTables).get()).single.state, 'ordered');
  });

  test('offline at start: the last downloaded data stays and nothing crashes', () async {
    db = memoryDb();
    await db.replaceMenu(menuJson('Cached shiro'));
    server.offline = true;
    final session = WorkSession(api: server.api(), db: db, device: waiter, deviceToken: 't', connect: FakeServer([]).connect, delay: (_) async {});
    addTearDown(() async {
      await session.stop();
      await db.close();
    });

    await session.start();
    await settle();

    expect((await db.select(db.menuItems).get()).single.nameEn, 'Cached shiro');
  });

  test('access ended on the socket (4001) is reported once', () async {
    final socket = FakeSocket();
    await start([socket]);

    await socket.drop(4001);
    await settle();

    expect(accessEnded, 1);
  });

  test('item events, live and from catch-up, become the lines of the table screen', () async {
    final socket = FakeSocket();
    await start([socket]);
    Map<String, dynamic> sentEvent(int seq, String itemId) => {
          'seq': seq, 'orderId': 'o1', 'itemId': itemId, 'stationId': 'kitchen', 'type': 'item.sent', 'from': null, 'to': 'sent',
          'details': {'tableId': 't7', 'round': 1, 'name': 'Shiro', 'nameAm': null, 'qty': 1, 'note': null, 'options': <Object>[]},
        };

    socket.receive({'type': 'sync.result', 'reloadRequired': false, 'events': [sentEvent(1, 'i1')]});
    socket.receive({'type': 'event', 'event': sentEvent(2, 'i2')});
    socket.receive({'type': 'event', 'event': {'seq': 3, 'orderId': 'o1', 'itemId': 'i1', 'stationId': 'kitchen', 'type': 'item.ready', 'from': 'accepted', 'to': 'ready'}});
    await settle();

    final lines = await db.select(db.orderLines).get();
    expect({for (final l in lines) l.id: l.state}, {'i1': 'ready', 'i2': 'sent'});
  });

  test('a round that waited offline shows its final answer: refused -> "needs attention", accepted -> sent', () async {
    final socket = FakeSocket();
    server.tableState = 'ordered'; // the table is still open (a free table would end the visit and clear its lines)
    db = memoryDb();
    final session = WorkSession(api: server.api(), db: db, device: waiter, deviceToken: 't', connect: FakeServer([socket]).connect, delay: (_) async {});
    addTearDown(() async {
      await session.stop();
      await db.close();
    });
    // Two rounds were taken offline: their lines show "queued" and they wait in the outbox.
    for (final id in ['o1', 'o2']) {
      await db.addLocalLines([
        OrderLinesCompanion.insert(id: '$id-i', orderId: id, tableId: 't7', menuItemId: 'shiro', nameEn: 'Shiro', qty: 1, priceSantim: 18000, state: 'sent', sync: 'queued', createdAt: id.hashCode),
      ]);
      await db.enqueue(id, '{"type":"order.send","orderId":"$id","queuedOffline":true}', DateTime.now());
    }

    await session.start(); // the connection comes back and the outbox sends them, oldest first
    await settle();
    socket.ackLast({'ok': false, 'error': 'TABLE_NOT_FOUND'});
    await settle();
    socket.ackLast({'ok': true});
    await settle();

    final lines = {for (final l in await db.select(db.orderLines).get()) l.orderId: (l.sync, l.error)};
    expect(lines, {'o1': ('needs_attention', 'TABLE_NOT_FOUND'), 'o2': ('sent', null)});
  });

  test('pushes are applied one at a time, in order: sent, accepted, ready for one item end as ready', () async {
    final socket = FakeSocket();
    server.tableState = 'ordered';
    await start([socket]);
    Map<String, dynamic> e(int seq, String type, String? from, String to) => {
          'seq': seq, 'orderId': 'o1', 'itemId': 'i1', 'stationId': 'kitchen', 'type': type, 'from': from, 'to': to, 'at': 1,
          if (type == 'item.sent') 'details': {'tableId': 't7', 'round': 1, 'name': 'Shiro', 'nameAm': null, 'qty': 1, 'note': null, 'options': <Object>[]},
        };

    // One catch-up message: the insert (sent) must finish before the updates run.
    socket.receive({'type': 'sync.result', 'reloadRequired': false, 'events': [e(1, 'item.sent', null, 'sent'), e(2, 'item.accepted', 'sent', 'accepted'), e(3, 'item.ready', 'accepted', 'ready')]});
    await settle();

    expect((await db.select(db.orderLines).getSingle()).state, 'ready');
  });

  test('real wiring: a live Ready push on my table rings; the same from catch-up does not', () async {
    final socket = FakeSocket();
    final output = FakeOutput();
    db = memoryDb();
    final session = WorkSession(
      api: server.api(),
      db: db,
      device: waiter,
      deviceToken: 't',
      connect: FakeServer([socket]).connect,
      delay: (_) async {},
      userId: 'hana',
      alertOutput: output,
    );
    addTearDown(() async {
      await session.stop();
      await db.close();
    });
    await session.start();
    await settle();
    Map<String, dynamic> e(int seq, String itemId, String type, String? from, String to) => {
          'seq': seq, 'orderId': 'o1', 'itemId': itemId, 'stationId': 'kitchen', 'type': type, 'from': from, 'to': to, 'at': 1,
          if (type == 'item.sent') 'details': {'tableId': 't7', 'round': 1, 'name': 'Shiro', 'nameAm': null, 'qty': 1, 'note': null, 'options': <Object>[]},
        };
    socket.receive({'type': 'table.state', 'tableId': 't7', 'state': 'ordered', 'sessionId': 's1', 'waiterId': 'hana'});
    socket.receive({'type': 'sync.result', 'reloadRequired': false, 'events': [e(1, 'i1', 'item.sent', null, 'sent'), e(2, 'i1', 'item.ready', 'accepted', 'ready')]});
    await settle();
    expect(output.rings, isEmpty); // history

    socket.receive({'type': 'event', 'event': e(3, 'i2', 'item.sent', null, 'sent')});
    socket.receive({'type': 'event', 'event': e(4, 'i2', 'item.ready', 'accepted', 'ready')});
    await settle();

    expect(output.rings, [AlertSound.loud]);
  });

  group('keeping alerts alive with the screen off (F2d)', () {
    Future<(WorkSession, FakeSocket)> waiterSession(FakeKeepAlive keepAlive, {String? userId = 'hana'}) async {
      final socket = FakeSocket();
      db = memoryDb();
      final session = WorkSession(
        api: server.api(),
        db: db,
        device: waiter,
        deviceToken: 't',
        connect: FakeServer([socket]).connect,
        delay: (_) async {},
        userId: userId,
        alertOutput: userId == null ? null : FakeOutput(),
        keepAlive: keepAlive,
      );
      addTearDown(db.close);
      await session.start();
      await settle();
      return (session, socket);
    }

    test("a waiter's session keeps the app alive from start to stop", () async {
      final keepAlive = FakeKeepAlive();
      final (session, _) = await waiterSession(keepAlive);
      expect(keepAlive.running, isTrue);

      await session.stop(); // sign-out or access ended

      expect(keepAlive.running, isFalse);
    });

    test('each alert is also written in the notification (seen on the lock screen)', () async {
      final keepAlive = FakeKeepAlive();
      final (session, socket) = await waiterSession(keepAlive);
      addTearDown(session.stop);
      socket.receive({'type': 'table.state', 'tableId': 't7', 'state': 'ordered', 'sessionId': 's1', 'waiterId': 'hana'});
      socket.receive({'type': 'event', 'event': {
        'seq': 1, 'orderId': 'o1', 'itemId': 'i1', 'stationId': 'kitchen', 'type': 'item.sent', 'from': null, 'to': 'sent', 'at': 1,
        'details': {'tableId': 't7', 'round': 1, 'name': 'Shiro', 'nameAm': null, 'qty': 2, 'note': null, 'options': <Object>[]},
      }});
      socket.receive({'type': 'event', 'event': {'seq': 2, 'orderId': 'o1', 'itemId': 'i1', 'stationId': 'kitchen', 'type': 'item.ready', 'from': 'accepted', 'to': 'ready', 'at': 2}});
      await settle();

      expect(keepAlive.shown, ['Table 7 — ready: 2× Shiro']);
    });

    test('a kitchen tablet (no waiter signed in) never starts it', () async {
      final keepAlive = FakeKeepAlive();
      final (session, _) = await waiterSession(keepAlive, userId: null);
      addTearDown(session.stop);

      expect(keepAlive.starts, 0);
    });
  });
}

class FakeKeepAlive implements KeepAlive {
  bool running = false;
  int starts = 0;
  final shown = <String>[];
  @override
  Future<void> start() async {
    starts++;
    running = true;
  }

  @override
  Future<void> show(String text) async => shown.add(text);

  @override
  Future<void> stop() async => running = false;
}
