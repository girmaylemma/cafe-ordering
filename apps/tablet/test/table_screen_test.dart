import 'package:cafe_tablet/data/database.dart';
import 'package:cafe_tablet/providers.dart';
import 'package:cafe_tablet/session/providers.dart';
import 'package:cafe_tablet/ui/table_screen.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

OrderLinesCompanion line(String id, String name, {required int round, String state = 'sent', String sync = 'sent', String? note, String? options, String? error}) =>
    OrderLinesCompanion.insert(
      id: id,
      orderId: 'o$round',
      tableId: 't7',
      menuItemId: 'm-$id',
      nameEn: name,
      qty: 1,
      priceSantim: 18000,
      state: state,
      sync: sync,
      createdAt: id.hashCode,
      round: round == 0 ? const Value.absent() : Value(round),
      note: Value(note),
      optionsText: Value(options),
      error: Value(error),
    );

Future<AppDatabase> pumpTable(WidgetTester tester, List<OrderLinesCompanion> lines) async {
  final db = memoryDb();
  await tester.runAsync(() async {
    await db.replaceTables([
      {'id': 't7', 'name': 'Table 7', 'area': null, 'seats': 4, 'sortOrder': 0, 'state': 'ordered', 'sessionId': 's1', 'waiterId': 'hana'},
    ]);
    await db.addLocalLines(lines);
  });
  addTearDown(db.close);
  await tester.pumpWidget(ProviderScope(
    overrides: [databaseProvider.overrideWithValue(db), workSessionProvider.overrideWith((ref) async => null)],
    child: const MaterialApp(home: TableScreen(tableId: 't7')),
  ));
  await tester.runAsync(settle);
  await tester.pumpAndSettle();
  return db;
}

void main() {
  testWidgets('shows the items by round, with notes, options and each state', (tester) async {
    await pumpTable(tester, [
      line('a', 'Shiro', round: 1, state: 'ready', note: 'no onion'),
      line('b', 'Tibs', round: 1, state: 'accepted'),
      line('c', 'Macchiato', round: 2, options: 'Large'),
    ]);

    expect(find.text('Table 7'), findsOneWidget);
    expect(find.text('Round 1'), findsOneWidget);
    expect(find.text('Round 2'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('line-a')), matching: find.text('READY')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('line-a')), matching: find.text('no onion')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('line-b')), matching: find.text('Accepted')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('line-c')), matching: find.text('Large')), findsOneWidget);

    await unmountAndFlush(tester);
  });

  testWidgets('a round not yet confirmed shows its sync status, and a refusal says why', (tester) async {
    await pumpTable(tester, [
      line('q', 'Shiro', round: 0, sync: 'queued'),
      line('s', 'Tibs', round: 0, sync: 'sending'),
      line('x', 'Kitfo', round: 0, sync: 'needs_attention', error: 'TABLE_NOT_FOUND'),
    ]);

    expect(find.descendant(of: find.byKey(const Key('line-q')), matching: find.textContaining('Waiting for internet')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('line-s')), matching: find.text('Sending…')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('line-x')), matching: find.textContaining('Not sent')), findsOneWidget);

    await unmountAndFlush(tester);
  });

  testWidgets('cancelled and voided items are shown struck through, not hidden', (tester) async {
    await pumpTable(tester, [line('v', 'Shiro', round: 1, state: 'voided')]);

    final text = tester.widget<Text>(find.descendant(of: find.byKey(const Key('line-v')), matching: find.text('Shiro')));
    expect(text.style?.decoration, TextDecoration.lineThrough);

    await unmountAndFlush(tester);
  });
}
