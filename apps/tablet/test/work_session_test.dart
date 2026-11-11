import 'dart:convert';

import 'package:cafe_tablet/api/api_client.dart';
import 'package:cafe_tablet/data/database.dart';
import 'package:cafe_tablet/session/work_session.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

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
}
