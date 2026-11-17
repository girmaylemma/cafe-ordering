import 'dart:convert';

import 'package:cafe_tablet/api/api_client.dart';
import 'package:cafe_tablet/data/database.dart';
import 'package:cafe_tablet/providers.dart';
import 'package:cafe_tablet/session/providers.dart';
import 'package:cafe_tablet/session/work_session.dart';
import 'package:cafe_tablet/ui/order_screen.dart';
import 'package:cafe_tablet/ui/table_screen.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fakes.dart';

const hana = StaffMember(id: 'hana', name: 'Hana', role: 'waiter');
const meron = StaffMember(id: 'meron', name: 'Meron', role: 'manager');

final tables = [
  {'id': 't7', 'name': 'Table 7', 'area': null, 'seats': 4, 'sortOrder': 0, 'state': 'ordered', 'sessionId': 's1', 'waiterId': 'hana'},
  {'id': 't8', 'name': 'Table 8', 'area': null, 'seats': 4, 'sortOrder': 1, 'state': 'seated', 'sessionId': 's2', 'waiterId': 'abebe'},
  {'id': 't9', 'name': 'Table 9', 'area': null, 'seats': 2, 'sortOrder': 2, 'state': 'free', 'sessionId': null, 'waiterId': null},
];
final menu = {
  'categories': [
    {'id': 'food', 'nameEn': 'Food', 'nameAm': null, 'sortOrder': 0},
  ],
  'items': [
    {'id': 'shiro', 'categoryId': 'food', 'nameEn': 'Shiro', 'nameAm': null, 'priceSantim': 18000, 'stationId': 'kitchen', 'fasting': true, 'soldOut': false, 'sortOrder': 0, 'optionGroupIds': <String>[]},
  ],
  'optionGroups': <Object>[],
};
final staff = [
  {'id': 'hana', 'name': 'Hana', 'role': 'waiter'},
  {'id': 'abebe', 'name': 'Abebe', 'role': 'waiter'},
  {'id': 'meron', 'name': 'Meron', 'role': 'manager'},
];

ApiClient api() => ApiClient(
      MockClient((r) async => switch (r.url.path) {
            '/menu' => http.Response(jsonEncode(menu), 200),
            '/tables' => http.Response(jsonEncode({'tables': tables}), 200),
            '/staff' => http.Response(jsonEncode({'staff': staff}), 200),
            _ => http.Response('{}', 404),
          }),
      Uri.parse('http://server'),
    );

OrderLinesCompanion line(String id, {String state = 'sent', String sync = 'sent', String orderId = 'o1', String? error}) => OrderLinesCompanion.insert(
      id: id,
      orderId: orderId,
      tableId: 't7',
      menuItemId: 'shiro',
      nameEn: 'Shiro $id',
      qty: 2,
      priceSantim: 18000,
      state: state,
      sync: sync,
      createdAt: id.hashCode,
      round: sync == 'sent' ? const Value(1) : const Value.absent(),
      error: Value(error),
      note: const Value('no onion'),
    );

/// The table screen, pushed from a home screen so we can see it close. Online unless [online] is false.
Future<(AppDatabase, FakeSocket?)> pumpTable(WidgetTester tester, List<OrderLinesCompanion> lines, {bool online = true, StaffMember user = hana}) async {
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
    await db.addLocalLines(lines);
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
      currentUserProvider.overrideWithValue(user),
    ],
    child: MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: TextButton(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const TableScreen(tableId: 't7'))),
            child: const Text('home'),
          ),
        ),
      ),
    ),
  ));
  await tester.tap(find.text('home'));
  await settled(tester);
  return (db, socket);
}

Future<void> settled(WidgetTester tester) async {
  await tester.runAsync(settle);
  await tester.pumpAndSettle();
}

Future<void> tapText(WidgetTester tester, String text) async {
  await tester.tap(find.text(text).last);
  await settled(tester);
}

/// The server accepts the last command (also ends its 10 s answer timer before the test ends).
Future<void> answer(WidgetTester tester, FakeSocket socket) async {
  socket.ackLast({'ok': true});
  await settled(tester);
}

Map<String, dynamic> lastCommand(FakeSocket socket) => socket.sent.lastWhere((m) => m['type'] != 'sync');

void main() {
  group('item actions', () {
    testWidgets('a ready item: Delivered sends the command, and the server event updates the line', (tester) async {
      final (_, socket) = await pumpTable(tester, [line('a', state: 'ready')]);

      await tester.tap(find.byKey(const Key('line-a')));
      await settled(tester);
      expect(find.text('Void…'), findsOneWidget);
      expect(find.text('Cancel item'), findsNothing); // too late to cancel
      await tapText(tester, 'Delivered');

      expect(lastCommand(socket!), containsPair('command', {'type': 'delivered'}));
      expect(lastCommand(socket)['itemId'], 'a');
      socket.ackLast({'ok': true});
      socket.receive({
        'type': 'event',
        'event': {'seq': 5, 'orderId': 'o1', 'itemId': 'a', 'stationId': 'kitchen', 'type': 'item.delivered', 'from': 'ready', 'to': 'delivered', 'actor': {}, 'at': 1},
      });
      await settled(tester);

      expect(find.descendant(of: find.byKey(const Key('line-a')), matching: find.text('Delivered')), findsOneWidget);
      await unmountAndFlush(tester);
    });

    testWidgets('an item the kitchen has not accepted can be cancelled', (tester) async {
      final (_, socket) = await pumpTable(tester, [line('a')]);

      await tester.tap(find.byKey(const Key('line-a')));
      await settled(tester);
      expect(find.text('Void…'), findsNothing);
      await tapText(tester, 'Cancel item');

      expect(lastCommand(socket!), containsPair('command', {'type': 'cancel'}));
      await answer(tester, socket);
      await unmountAndFlush(tester);
    });

    testWidgets('the kitchen accepted it first: the refusal is explained', (tester) async {
      final (_, socket) = await pumpTable(tester, [line('a')]);

      await tester.tap(find.byKey(const Key('line-a')));
      await settled(tester);
      await tapText(tester, 'Cancel item');
      socket!.ackLast({'ok': false, 'error': 'NEEDS_MANAGER_VOID'});
      await settled(tester);

      expect(find.textContaining('already accepted'), findsOneWidget);
      await unmountAndFlush(tester);
    });

    testWidgets('offline: an action says it needs internet and nothing is queued', (tester) async {
      final (db, _) = await pumpTable(tester, [line('a', state: 'ready')], online: false);

      await tester.tap(find.byKey(const Key('line-a')));
      await settled(tester);
      await tapText(tester, 'Delivered');

      expect(find.textContaining('Needs internet'), findsOneWidget);
      expect(await tester.runAsync(db.pendingMessages), isEmpty);
      await unmountAndFlush(tester);
    });
  });

  group('void', () {
    Future<void> openVoid(WidgetTester tester) async {
      await tester.tap(find.byKey(const Key('line-a')));
      await settled(tester);
      await tapText(tester, 'Void…');
      await tester.enterText(find.byKey(const Key('void-reason')), 'Customer left');
      await tester.pump();
    }

    testWidgets("a waiter needs a manager's 6-digit PIN; it goes with the command", (tester) async {
      final (_, socket) = await pumpTable(tester, [line('a', state: 'accepted')]);
      await openVoid(tester);

      final button = find.widgetWithText(FilledButton, 'Void item');
      expect(tester.widget<FilledButton>(button).onPressed, isNull); // no manager, no PIN yet
      await tester.tap(find.text('Meron'));
      await tester.enterText(find.byKey(const Key('void-pin')), '12345');
      await tester.pump();
      expect(tester.widget<FilledButton>(button).onPressed, isNull); // 5 digits: not yet
      await tester.enterText(find.byKey(const Key('void-pin')), '123456');
      await tester.pump();
      await tester.tap(button);
      await settled(tester);

      expect(lastCommand(socket!)['command'], {'type': 'void', 'reason': 'Customer left', 'managerId': 'meron', 'managerPin': '123456'});
      socket.ackLast({'ok': true});
      await settled(tester);
      expect(find.byKey(const Key('void-pin')), findsNothing); // dialog closed
      await unmountAndFlush(tester);
    });

    testWidgets('a wrong manager PIN keeps the dialog open, says so, and clears the PIN', (tester) async {
      final (_, socket) = await pumpTable(tester, [line('a', state: 'accepted')]);
      await openVoid(tester);
      await tester.tap(find.text('Meron'));
      await tester.enterText(find.byKey(const Key('void-pin')), '000000');
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Void item'));
      await settled(tester);

      socket!.ackLast({'ok': false, 'error': 'MANAGER_PIN_INVALID'});
      await settled(tester);

      expect(find.textContaining('Wrong manager PIN'), findsOneWidget);
      expect(tester.widget<TextField>(find.byKey(const Key('void-pin'))).controller!.text, isEmpty);
      await unmountAndFlush(tester);
    });

    testWidgets('a signed-in manager voids without typing a PIN', (tester) async {
      final (_, socket) = await pumpTable(tester, [line('a', state: 'ready')], user: meron);
      await openVoid(tester);

      expect(find.byKey(const Key('void-pin')), findsNothing);
      await tester.tap(find.widgetWithText(FilledButton, 'Void item'));
      await settled(tester);

      expect(lastCommand(socket!)['command'], {'type': 'void', 'reason': 'Customer left'});
      await answer(tester, socket);
      await unmountAndFlush(tester);
    });
  });

  group('table actions', () {
    Future<void> openMenu(WidgetTester tester, String action) async {
      await tester.tap(find.byKey(const Key('table-actions')));
      await settled(tester);
      await tapText(tester, action);
    }

    testWidgets('close: asks first; a refusal is explained and the screen stays', (tester) async {
      final (_, socket) = await pumpTable(tester, [line('a', state: 'accepted')]);

      await openMenu(tester, 'Close table');
      await tapText(tester, 'Close');
      expect(lastCommand(socket!), containsPair('type', 'session.close'));
      expect(lastCommand(socket)['sessionId'], 's1');
      socket.ackLast({'ok': false, 'error': 'ITEMS_NOT_FINISHED'});
      await settled(tester);

      expect(find.textContaining('not finished'), findsOneWidget);
      expect(find.byType(TableScreen), findsOneWidget);
      await unmountAndFlush(tester);
    });

    testWidgets('close: when the server agrees, back to the floor map', (tester) async {
      final (_, socket) = await pumpTable(tester, [line('a', state: 'delivered')]);

      await openMenu(tester, 'Close table');
      await tapText(tester, 'Close');
      socket!.ackLast({'ok': true});
      await settled(tester);

      expect(find.byType(TableScreen), findsNothing);
      await unmountAndFlush(tester);
    });

    testWidgets('move offers only free tables', (tester) async {
      final (_, socket) = await pumpTable(tester, [line('a')]);

      await openMenu(tester, 'Move to another table');
      expect(find.text('Table 8'), findsNothing); // in use
      await tapText(tester, 'Table 9');

      expect(lastCommand(socket!), containsPair('toTableId', 't9'));
      expect(lastCommand(socket)['type'], 'session.move');
      await answer(tester, socket);
      await unmountAndFlush(tester);
    });

    testWidgets('merge offers only other open tables and sends their visit', (tester) async {
      final (_, socket) = await pumpTable(tester, [line('a')]);

      await openMenu(tester, 'Merge into another table');
      expect(find.text('Table 9'), findsNothing); // free: nothing to merge into
      await tapText(tester, 'Table 8');

      expect(lastCommand(socket!), containsPair('intoSessionId', 's2'));
      expect(lastCommand(socket)['type'], 'session.merge');
      await answer(tester, socket);
      await unmountAndFlush(tester);
    });

    testWidgets('hand over offers the other waiters', (tester) async {
      final (_, socket) = await pumpTable(tester, [line('a')]);

      await openMenu(tester, 'Hand over to…');
      expect(find.text('Hana'), findsNothing); // that's me
      await tapText(tester, 'Abebe');

      expect(lastCommand(socket!), containsPair('toWaiterId', 'abebe'));
      expect(lastCommand(socket)['type'], 'session.transfer');
      await answer(tester, socket);
      await unmountAndFlush(tester);
    });
  });

  group('a round the server refused', () {
    testWidgets('Dismiss asks first, then removes the round', (tester) async {
      final (db, _) = await pumpTable(tester, [line('x', sync: 'needs_attention', orderId: 'bad', error: 'SESSION_CLOSED')]);

      await tester.tap(find.byKey(const Key('line-x')));
      await settled(tester);
      await tapText(tester, 'Dismiss');
      expect(find.byKey(const Key('line-x')), findsOneWidget); // not yet: a confirmation first
      await tapText(tester, 'Remove');

      expect(find.byKey(const Key('line-x')), findsNothing);
      expect(await tester.runAsync(() => db.select(db.orderLines).get()), isEmpty);
      await unmountAndFlush(tester);
    });

    testWidgets('Order again opens the order screen with the same items; sending it replaces the refused round', (tester) async {
      final (db, socket) = await pumpTable(tester, [line('x', sync: 'needs_attention', orderId: 'bad', error: 'SESSION_CLOSED')]);

      await tester.tap(find.byKey(const Key('line-x')));
      await settled(tester);
      await tapText(tester, 'Order again');

      expect(find.byType(OrderScreen), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('round-summary')), matching: find.text('2× Shiro')), findsOneWidget);
      await tapText(tester, 'Send to kitchen');

      final sent = socket!.sent.lastWhere((m) => m['type'] == 'order.send');
      expect(sent['orderId'], isNot('bad'));
      expect((sent['items'] as List).single, containsPair('note', 'no onion'));
      final lines = await tester.runAsync(() => db.select(db.orderLines).get());
      expect(lines!.map((l) => l.orderId), [sent['orderId']]); // the refused round is gone
      await answer(tester, socket);
      await unmountAndFlush(tester);
    });
  });
}
