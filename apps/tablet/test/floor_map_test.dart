import 'dart:convert';

import 'package:cafe_tablet/api/api_client.dart';
import 'package:cafe_tablet/data/database.dart';
import 'package:cafe_tablet/providers.dart';
import 'package:cafe_tablet/session/providers.dart';
import 'package:cafe_tablet/session/work_session.dart';
import 'package:cafe_tablet/ui/floor_map_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fakes.dart';

const hana = StaffMember(id: 'hana', name: 'Hana', role: 'waiter');
const waiterDevice = DeviceInfo(id: 'd1', name: 'Tab 1', kind: DeviceKind.waiter, stationId: null);

Map<String, dynamic> table(String id, String name, String? area, String state, {String? waiterId, String? sessionId}) =>
    {'id': id, 'name': name, 'area': area, 'seats': 4, 'sortOrder': 0, 'state': state, 'sessionId': sessionId, 'waiterId': waiterId};

final tables = [
  table('t1', 'Table 1', 'Inside', 'free'),
  table('t2', 'Table 2', 'Inside', 'ready', waiterId: 'hana', sessionId: 's2'),
  table('t3', 'Table 3', 'Terrace', 'ordered', waiterId: 'meron', sessionId: 's3'),
];

ApiClient api() => ApiClient(
      MockClient((r) async => switch (r.url.path) {
            '/menu' => http.Response(jsonEncode({'categories': [], 'items': [], 'optionGroups': []}), 200),
            '/tables' => http.Response(jsonEncode({'tables': tables}), 200),
            '/staff' => http.Response(
                jsonEncode({'staff': [{'id': 'hana', 'name': 'Hana', 'role': 'waiter'}, {'id': 'meron', 'name': 'Meron', 'role': 'waiter'}]}), 200),
            _ => http.Response('{}', 404),
          }),
      Uri.parse('http://server'),
    );

/// The floor map with a work session that is online ([socket] given) or offline (none).
Future<(AppDatabase, FakeSocket?)> pumpFloor(WidgetTester tester, {required bool online}) async {
  final db = memoryDb();
  final socket = online ? FakeSocket() : null;
  final session = WorkSession(
    api: api(),
    db: db,
    device: waiterDevice,
    deviceToken: 't',
    connect: FakeServer([?socket]).connect,
    delay: (_) async {},
  );
  await tester.runAsync(() async {
    await session.start();
    await settle();
    if (!online) await db.replaceTables(tables); // offline: data from an earlier download
  });
  addTearDown(() async {
    await session.stop();
    await db.close();
  });

  await tester.pumpWidget(ProviderScope(
    overrides: [
      databaseProvider.overrideWithValue(db),
      workSessionProvider.overrideWith((ref) async => session),
    ],
    child: const MaterialApp(home: FloorMapScreen(user: hana)),
  ));
  await tester.runAsync(settle);
  await tester.pumpAndSettle();
  return (db, socket);
}

void main() {
  testWidgets('tables are grouped by area with their state; mine are marked; READY stands out', (tester) async {
    await pumpFloor(tester, online: true);

    expect(find.text('Inside'), findsOneWidget);
    expect(find.text('Terrace'), findsOneWidget);
    final t2 = find.byKey(const Key('table-t2'));
    expect(find.descendant(of: t2, matching: find.text('READY')), findsOneWidget);
    expect(find.descendant(of: t2, matching: find.text('Mine')), findsOneWidget);
    final t3 = find.byKey(const Key('table-t3'));
    expect(find.descendant(of: t3, matching: find.text('Meron')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('table-t1')), matching: find.text('Free')), findsOneWidget);

    await unmountAndFlush(tester);
  });

  testWidgets("the 'Mine' filter shows only my tables", (tester) async {
    await pumpFloor(tester, online: true);

    await tester.tap(find.byKey(const Key('filter-mine')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('table-t2')), findsOneWidget);
    expect(find.byKey(const Key('table-t1')), findsNothing);
    expect(find.byKey(const Key('table-t3')), findsNothing);

    await unmountAndFlush(tester);
  });

  testWidgets('opening a free table sends session.open with a new session id and the guests', (tester) async {
    final (_, socket) = await pumpFloor(tester, online: true);

    await tester.tap(find.byKey(const Key('table-t1')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('3'));
    await tester.tap(find.text('Open table'));
    await tester.runAsync(settle);
    await tester.pump();

    final open = socket!.sent.firstWhere((m) => m['type'] == 'session.open');
    expect(open['tableId'], 't1');
    expect(open['guests'], 3);
    expect(open['sessionId'], isA<String>());

    // Answer it, so no timeout timer is left running when the test ends.
    socket.receive({'type': 'ack', 'idempotencyKey': open['idempotencyKey'], 'result': {'ok': true, 'alreadyDone': false, 'sessionId': open['sessionId']}});
    await tester.runAsync(settle);
    await tester.pump();

    await unmountAndFlush(tester);
  });

  testWidgets('offline: opening a table is queued and the table shows as seated at once', (tester) async {
    final (db, _) = await pumpFloor(tester, online: false);
    expect(find.textContaining('Waiting for internet'), findsOneWidget);

    await tester.tap(find.byKey(const Key('table-t1')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open table'));
    await tester.runAsync(settle);
    await tester.pumpAndSettle();

    expect(find.descendant(of: find.byKey(const Key('table-t1')), matching: find.text('Seated')), findsOneWidget);
    final queued = await tester.runAsync(() => db.pendingMessages());
    expect(jsonDecode(queued!.single.message)['type'], 'session.open');

    await unmountAndFlush(tester);
  });

  testWidgets("another waiter's table can't be opened from here", (tester) async {
    await pumpFloor(tester, online: true);

    await tester.tap(find.byKey(const Key('table-t3')));
    await tester.pumpAndSettle();

    expect(find.text('Open table'), findsNothing);
    expect(find.textContaining('Meron'), findsWidgets);

    await unmountAndFlush(tester);
  });
}
