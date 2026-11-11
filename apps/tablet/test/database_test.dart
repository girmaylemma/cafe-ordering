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
}
