import 'package:cafe_tablet/data/database.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

Map<String, dynamic> menu({List<Map<String, dynamic>>? items}) => {
      'categories': [
        {'id': 'c1', 'nameEn': 'Food', 'nameAm': 'ምግብ', 'sortOrder': 0},
      ],
      'items': items ??
          [
            {'id': 'shiro', 'categoryId': 'c1', 'nameEn': 'Shiro', 'nameAm': 'ሽሮ', 'priceSantim': 18000, 'stationId': 'kitchen', 'fasting': true, 'soldOut': false, 'sortOrder': 0, 'optionGroupIds': ['g1']},
          ],
      'optionGroups': [
        {
          'id': 'g1', 'nameEn': 'Size', 'nameAm': null, 'minChoices': 1, 'maxChoices': 1, 'sortOrder': 0,
          'options': [
            {'id': 'o1', 'nameEn': 'Large', 'nameAm': null, 'extraSantim': 1500, 'sortOrder': 0},
          ],
        },
      ],
    };

void main() {
  test('a menu download is stored, and the next download replaces it (removed items disappear)', () async {
    final db = memoryDb();
    addTearDown(db.close);

    await db.replaceMenu(menu());
    expect((await db.select(db.menuItems).get()).single.nameAm, 'ሽሮ');
    expect((await db.select(db.optionChoices).get()).single.extraSantim, 1500);

    await db.replaceMenu(menu(items: []));
    expect(await db.select(db.menuItems).get(), isEmpty);
  });

  test('sold-out and table-state pushes update the stored rows', () async {
    final db = memoryDb();
    addTearDown(db.close);
    await db.replaceMenu(menu());
    await db.replaceTables([
      {'id': 't7', 'name': 'Table 7', 'area': null, 'seats': 4, 'sortOrder': 0, 'state': 'free', 'sessionId': null, 'waiterId': null},
    ]);

    await db.setSoldOut('shiro', true);
    await db.setTableState('t7', 'ready', 's1', 'hana');

    expect((await db.select(db.menuItems).get()).single.soldOut, isTrue);
    final table = (await db.select(db.cafeTables).get()).single;
    expect([table.state, table.sessionId, table.waiterId], ['ready', 's1', 'hana']);
  });

  test('the outbox keeps first-in-first-out order and marks refusals, and counts unsent rounds', () async {
    final db = memoryDb();
    addTearDown(db.close);
    final t0 = DateTime(2026, 11, 11, 12);
    await db.enqueue('b', '{"n":2}', t0.add(const Duration(microseconds: 1)));
    await db.enqueue('a', '{"n":1}', t0);
    await db.enqueue('a', '{"n":1}', t0); // same key again: still one row

    expect((await db.pendingMessages()).map((m) => m.key), ['a', 'b']);
    await db.markNeedsAttention('a', 'TABLE_NOT_FOUND');
    expect((await db.pendingMessages()).map((m) => m.key), ['b']);
    expect(await db.watchUnsentCount().first, 2); // refused rounds still block sign-out
    await db.removeFromOutbox('b');
    expect(await db.watchUnsentCount().first, 1);
  });

  test('the last seen event seq is remembered', () async {
    final db = memoryDb();
    addTearDown(db.close);
    expect(await db.lastSeq(), 0);
    await db.setLastSeq(42);
    expect(await db.lastSeq(), 42);
  });

  group('a refused round (F2c)', () {
    OrderLinesCompanion refusedLine(String id, String orderId) => OrderLinesCompanion.insert(
          id: id,
          orderId: orderId,
          tableId: 't7',
          menuItemId: 'shiro',
          nameEn: 'Shiro',
          qty: 1,
          priceSantim: 18000,
          state: 'sent',
          sync: 'needs_attention',
          createdAt: 1,
          optionIds: const Value('["o1"]'),
        );

    test('remembers the chosen option ids, so "Order again" can choose them again', () async {
      final db = memoryDb();
      addTearDown(db.close);
      await db.addLocalLines([refusedLine('i1', 'o1')]);

      expect((await db.select(db.orderLines).getSingle()).optionIds, '["o1"]');
    });

    test('dismissing it removes its lines AND its outbox entry, so sign-out is no longer blocked', () async {
      final db = memoryDb();
      addTearDown(db.close);
      await db.addLocalLines([refusedLine('i1', 'o1'), refusedLine('i2', 'o1'), refusedLine('i3', 'o2')]);
      await db.enqueue('o1', '{}', DateTime(2026));
      await db.markNeedsAttention('o1', 'SESSION_CLOSED');
      await db.enqueue('o2', '{}', DateTime(2026));
      expect(await db.watchUnsentCount().first, 2);

      await db.dismissRound('o1');

      expect((await db.select(db.orderLines).get()).map((l) => l.id), ['i3']);
      expect(await db.watchUnsentCount().first, 1);
    });

    test('dismissing never touches a round that is still waiting to be sent', () async {
      final db = memoryDb();
      addTearDown(db.close);
      await db.addLocalLines([refusedLine('i1', 'o1')]);
      await db.enqueue('o1', '{}', DateTime(2026)); // pending, not refused

      await db.dismissRound('o1');

      expect(await db.select(db.orderLines).get(), hasLength(1));
      expect(await db.pendingMessages(), hasLength(1));
    });
  });

  for (final version in [2, 3]) {
  test('upgrading from schema $version keeps existing lines and adds the option ids column', () async {
    // A tablet that installed F2b1 (2) or F2b2 (3): order_lines exists without option_ids.
    final db = AppDatabase(NativeDatabase.memory(setup: (raw) {
      raw.execute('''
        CREATE TABLE order_lines (id TEXT NOT NULL PRIMARY KEY, order_id TEXT NOT NULL, table_id TEXT NOT NULL,
          menu_item_id TEXT NOT NULL, name_en TEXT NOT NULL, name_am TEXT, qty INTEGER NOT NULL, note TEXT,
          options_text TEXT, price_santim INTEGER NOT NULL, round INTEGER, state TEXT NOT NULL, sync TEXT NOT NULL,
          error TEXT, created_at INTEGER NOT NULL)''');
      raw.execute("INSERT INTO order_lines VALUES ('i1','o1','t7','shiro','Shiro',NULL,1,NULL,NULL,18000,1,'sent','sent',NULL,1)");
      raw.execute('PRAGMA user_version = $version');
    }));
    addTearDown(db.close);

    // Write to the new column: a plain read can't prove it exists (drift reads with SELECT * and
    // a missing column just comes back null, so a read-only check passes even without the migration).
    await (db.update(db.orderLines)..where((l) => l.id.equals('i1'))).write(const OrderLinesCompanion(optionIds: Value('["o1"]')));
    final line = await db.select(db.orderLines).getSingle();

    expect(line.nameEn, 'Shiro'); // the old line survived
    expect(line.optionIds, '["o1"]');
  });
  }
}
