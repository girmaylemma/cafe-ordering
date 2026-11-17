import 'dart:convert';

import 'package:cafe_tablet/api/api_client.dart';
import 'package:cafe_tablet/data/database.dart';
import 'package:cafe_tablet/providers.dart';
import 'package:cafe_tablet/session/providers.dart';
import 'package:cafe_tablet/session/work_session.dart';
import 'package:cafe_tablet/ui/order_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fakes.dart';

final menu = {
  'categories': [
    {'id': 'food', 'nameEn': 'Food', 'nameAm': null, 'sortOrder': 0},
    {'id': 'drinks', 'nameEn': 'Drinks', 'nameAm': null, 'sortOrder': 1},
  ],
  'items': [
    {'id': 'shiro', 'categoryId': 'food', 'nameEn': 'Shiro', 'nameAm': 'ሽሮ', 'priceSantim': 18000, 'stationId': 'kitchen', 'fasting': true, 'soldOut': false, 'sortOrder': 0, 'optionGroupIds': <String>[]},
    {'id': 'tibs', 'categoryId': 'food', 'nameEn': 'Tibs', 'nameAm': null, 'priceSantim': 32000, 'stationId': 'kitchen', 'fasting': false, 'soldOut': true, 'sortOrder': 1, 'optionGroupIds': <String>[]},
    {'id': 'mac', 'categoryId': 'drinks', 'nameEn': 'Macchiato', 'nameAm': null, 'priceSantim': 4000, 'stationId': 'bar', 'fasting': false, 'soldOut': false, 'sortOrder': 0, 'optionGroupIds': ['size']},
  ],
  'optionGroups': [
    {
      'id': 'size', 'nameEn': 'Size', 'nameAm': null, 'minChoices': 1, 'maxChoices': 1, 'sortOrder': 0,
      'options': [
        {'id': 'small', 'nameEn': 'Small', 'nameAm': null, 'extraSantim': 0, 'sortOrder': 0},
        {'id': 'large', 'nameEn': 'Large', 'nameAm': null, 'extraSantim': 1500, 'sortOrder': 1},
      ],
    },
  ],
};
final tables = [
  {'id': 't7', 'name': 'Table 7', 'area': null, 'seats': 4, 'sortOrder': 0, 'state': 'seated', 'sessionId': 's1', 'waiterId': 'hana'},
];

ApiClient api() => ApiClient(
      MockClient((r) async => switch (r.url.path) {
            // UTF-8 bytes like the real server: a String body would be encoded as Latin-1 (no Amharic).
            '/menu' => http.Response.bytes(utf8.encode(jsonEncode(menu)), 200, headers: {'content-type': 'application/json'}),
            '/tables' => http.Response(jsonEncode({'tables': tables}), 200),
            '/staff' => http.Response(jsonEncode({'staff': []}), 200),
            _ => http.Response('{}', 404),
          }),
      Uri.parse('http://server'),
    );

/// A screen with an "open" button that pushes the order screen, so we can see it close after Send.
Future<(AppDatabase, FakeSocket?)> pumpOrder(WidgetTester tester, {required bool online}) async {
  final db = memoryDb();
  final socket = online ? FakeSocket() : null;
  final session = WorkSession(
    api: api(),
    db: db,
    device: const DeviceInfo(id: 'd1', name: 'Tab', kind: DeviceKind.waiter, stationId: null),
    deviceToken: 't',
    connect: FakeServer([?socket]).connect,
    delay: (_) async {},
  );
  await tester.runAsync(() async {
    await db.replaceMenu(menu);
    await db.replaceTables(tables);
    await session.start();
    await settle();
  });
  addTearDown(() async {
    await session.stop();
    await db.close();
  });

  await tester.pumpWidget(ProviderScope(
    overrides: [databaseProvider.overrideWithValue(db), workSessionProvider.overrideWith((ref) async => session)],
    child: MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: TextButton(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const OrderScreen(tableId: 't7'))),
            child: const Text('open'),
          ),
        ),
      ),
    ),
  ));
  await tester.tap(find.text('open'));
  await tester.runAsync(settle);
  await tester.pumpAndSettle();
  return (db, socket);
}

Future<void> tapItem(WidgetTester tester, String name) async {
  await tester.tap(find.byKey(Key('menu-$name')));
  await tester.pumpAndSettle();
}

Finder summary() => find.byKey(const Key('round-summary'));

void main() {
  testWidgets('tapping an item twice adds to its line; the total shows in ETB', (tester) async {
    await pumpOrder(tester, online: true);
    await tester.tap(find.text('Food'));
    await tester.pumpAndSettle();

    await tapItem(tester, 'shiro');
    await tapItem(tester, 'shiro');

    expect(find.descendant(of: summary(), matching: find.text('2× Shiro')), findsOneWidget);
    expect(find.descendant(of: summary(), matching: find.text('Total 360.00 ETB')), findsOneWidget);
    await unmountAndFlush(tester);
  });

  testWidgets('a sold-out item is greyed out and cannot be added', (tester) async {
    await pumpOrder(tester, online: true);
    await tester.tap(find.text('Food'));
    await tester.pumpAndSettle();

    expect(find.descendant(of: find.byKey(const Key('menu-tibs')), matching: find.text('Sold out')), findsOneWidget);
    await tapItem(tester, 'tibs');

    expect(find.descendant(of: summary(), matching: find.textContaining('Tibs')), findsNothing);
    await unmountAndFlush(tester);
  });

  testWidgets('an item with a required option asks for it before it can be added', (tester) async {
    await pumpOrder(tester, online: true);
    await tester.tap(find.text('Drinks'));
    await tester.pumpAndSettle();

    await tapItem(tester, 'mac');
    final add = find.widgetWithText(FilledButton, 'Add');
    expect(tester.widget<FilledButton>(add).onPressed, isNull); // Size not chosen yet
    await tester.tap(find.text('Large (+15.00)'));
    await tester.pumpAndSettle();
    await tester.tap(add);
    await tester.pumpAndSettle();

    expect(find.descendant(of: summary(), matching: find.text('1× Macchiato')), findsOneWidget);
    expect(find.descendant(of: summary(), matching: find.text('Large')), findsOneWidget);
    expect(find.descendant(of: summary(), matching: find.text('Total 55.00 ETB')), findsOneWidget);
    await unmountAndFlush(tester);
  });

  testWidgets('search finds an item by a few letters', (tester) async {
    await pumpOrder(tester, online: true);

    await tester.enterText(find.byKey(const Key('menu-search')), 'mac');
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('menu-mac')), findsOneWidget);
    expect(find.byKey(const Key('menu-shiro')), findsNothing);
    await unmountAndFlush(tester);
  });

  testWidgets('Send is disabled for an empty round', (tester) async {
    await pumpOrder(tester, online: true);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Send to kitchen')).onPressed, isNull);
    await unmountAndFlush(tester);
  });

  testWidgets('online: Send sends order.send at once, shows the lines as sending, and goes back to the table', (tester) async {
    final (db, socket) = await pumpOrder(tester, online: true);
    await tester.tap(find.text('Food'));
    await tester.pumpAndSettle();
    await tapItem(tester, 'shiro');

    await tester.tap(find.text('Send to kitchen'));
    await tester.runAsync(settle);
    await tester.pumpAndSettle();

    final sent = socket!.sent.firstWhere((m) => m['type'] == 'order.send');
    expect([sent['sessionId'], sent['tableId'], (sent['items'] as List).single['menuItemId']], ['s1', 't7', 'shiro']);
    expect(find.byType(OrderScreen), findsNothing); // back to the table
    final lines = await tester.runAsync(() => db.select(db.orderLines).get());
    expect(lines!.single.sync, 'sending');

    socket.ackLast({'ok': true, 'orderId': sent['orderId'], 'round': 1, 'items': []});
    await tester.runAsync(settle);
    expect((await tester.runAsync(() => db.select(db.orderLines).get()))!.single.sync, 'sent');
    await unmountAndFlush(tester);
  });

  testWidgets('offline: Send keeps the round on the tablet and shows it as waiting', (tester) async {
    final (db, _) = await pumpOrder(tester, online: false);
    await tester.tap(find.text('Food'));
    await tester.pumpAndSettle();
    await tapItem(tester, 'shiro');

    await tester.tap(find.text('Send to kitchen'));
    await tester.runAsync(settle);
    await tester.pumpAndSettle();

    final lines = await tester.runAsync(() => db.select(db.orderLines).get());
    expect(lines!.single.sync, 'queued');
    final queued = await tester.runAsync(() => db.pendingMessages());
    expect(jsonDecode(queued!.single.message)['queuedOffline'], isTrue);
    await unmountAndFlush(tester);
  });
}
