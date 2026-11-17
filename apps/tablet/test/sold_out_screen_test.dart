// The kitchen's sold-out list (F3c, K-05).
import 'dart:convert';

import 'package:cafe_tablet/api/api_client.dart';
import 'package:cafe_tablet/data/database.dart';
import 'package:cafe_tablet/providers.dart';
import 'package:cafe_tablet/session/providers.dart';
import 'package:cafe_tablet/session/work_session.dart';
import 'package:cafe_tablet/ui/kitchen_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fakes.dart';

const kitchen = DeviceInfo(id: 'k1', name: 'Kitchen tablet', kind: DeviceKind.station, stationId: 'kitchen');

Map<String, dynamic> item(String id, String station, {bool soldOut = false, int sort = 0}) => {
      'id': id, 'categoryId': 'food', 'nameEn': id, 'nameAm': null, 'priceSantim': 100, 'stationId': station,
      'fasting': false, 'soldOut': soldOut, 'sortOrder': sort, 'optionGroupIds': <String>[],
    };

final menu = {
  'categories': [
    {'id': 'food', 'nameEn': 'Food', 'nameAm': null, 'sortOrder': 0},
  ],
  'items': [item('Shiro', 'kitchen'), item('Tibs', 'kitchen', soldOut: true, sort: 1), item('Macchiato', 'bar')],
  'optionGroups': <Object>[],
};

ApiClient api() => ApiClient(
      MockClient((r) async => switch (r.url.path) {
            '/menu' => http.Response(jsonEncode(menu), 200),
            '/tables' => http.Response(jsonEncode({'tables': <Object>[]}), 200),
            '/staff' => http.Response(jsonEncode({'staff': <Object>[]}), 200),
            _ => http.Response('{}', 404),
          }),
      Uri.parse('http://server'),
    );

Future<void> settled(WidgetTester tester) async {
  await tester.runAsync(settle);
  await tester.pumpAndSettle();
}

/// The kitchen screen, then the sold-out list opened from its top bar.
Future<(AppDatabase, FakeSocket?)> openSoldOut(WidgetTester tester, {bool online = true}) async {
  final db = memoryDb();
  final socket = online ? FakeSocket() : null;
  final session = WorkSession(api: api(), db: db, device: kitchen, deviceToken: 't', connect: FakeServer([?socket]).connect, delay: (_) async {});
  await tester.runAsync(() async {
    await db.replaceMenu(menu);
    await session.start();
    await settle();
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
    child: localizedApp(home: const KitchenScreen(device: kitchen)),
  ));
  await settled(tester);
  await tester.tap(find.byKey(const Key('open-sold-out')));
  await settled(tester);
  return (db, socket);
}

Map<String, dynamic> lastCommand(FakeSocket socket) => socket.sent.lastWhere((m) => m['type'] != 'sync');

Switch switchOf(WidgetTester tester, String name) => tester.widget<Switch>(find.byKey(Key('sold-out-$name')));

void main() {
  testWidgets("lists only this station's items, with which ones are sold out", (tester) async {
    await openSoldOut(tester);

    expect(find.text('Shiro'), findsOneWidget);
    expect(find.text('Tibs'), findsOneWidget);
    expect(find.text('Macchiato'), findsNothing); // the bar's item
    expect(switchOf(tester, 'Shiro').value, isFalse);
    expect(switchOf(tester, 'Tibs').value, isTrue);
    expect(find.text('SOLD OUT'), findsOneWidget);
    await unmountAndFlush(tester);
  });

  testWidgets("tapping sends the command; the switch flips when the server's push arrives", (tester) async {
    final (_, socket) = await openSoldOut(tester);

    await tester.tap(find.byKey(const Key('sold-out-Shiro')));
    await settled(tester);
    expect(lastCommand(socket!), containsPair('type', 'menu.sold_out'));
    expect(lastCommand(socket), containsPair('menuItemId', 'Shiro'));
    expect(lastCommand(socket), containsPair('soldOut', true));
    expect(switchOf(tester, 'Shiro').value, isFalse); // not yet: the server decides

    socket.ackLast({'ok': true, 'menuItemId': 'Shiro', 'soldOut': true, 'alreadyDone': false});
    socket.receive({'type': 'menu.sold_out', 'menuItemId': 'Shiro', 'soldOut': true});
    await settled(tester);

    expect(switchOf(tester, 'Shiro').value, isTrue);
    await unmountAndFlush(tester);
  });

  testWidgets('back in stock is the same switch (it is also the undo)', (tester) async {
    final (_, socket) = await openSoldOut(tester);

    await tester.tap(find.byKey(const Key('sold-out-Tibs')));
    await settled(tester);

    expect(lastCommand(socket!), containsPair('soldOut', false));
    socket.ackLast({'ok': true});
    await settled(tester);
    await unmountAndFlush(tester);
  });

  testWidgets('a refusal says why', (tester) async {
    final (_, socket) = await openSoldOut(tester);
    await tester.tap(find.byKey(const Key('sold-out-Shiro')));
    await settled(tester);

    socket!.ackLast({'ok': false, 'error': 'WRONG_STATION'});
    await settled(tester);

    expect(find.textContaining('another station'), findsOneWidget);
    expect(switchOf(tester, 'Shiro').value, isFalse);
    await unmountAndFlush(tester);
  });

  testWidgets('offline: "Needs internet", and nothing changes', (tester) async {
    final (db, _) = await openSoldOut(tester, online: false);

    await tester.tap(find.byKey(const Key('sold-out-Shiro')));
    await settled(tester);

    expect(find.textContaining('Needs internet'), findsOneWidget);
    expect(switchOf(tester, 'Shiro').value, isFalse);
    expect(await tester.runAsync(db.pendingMessages), isEmpty);
    await unmountAndFlush(tester);
  });
}
