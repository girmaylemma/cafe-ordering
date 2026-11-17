import 'package:cafe_tablet/data/database.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

Map<String, dynamic> sent(String itemId, {String tableId = 't7', String name = 'Shiro', int round = 1}) => {
      'seq': 1,
      'orderId': 'o1',
      'itemId': itemId,
      'stationId': 'kitchen',
      'type': 'item.sent',
      'from': null,
      'to': 'sent',
      'details': {
        'tableId': tableId,
        'tableName': 'Table 7',
        'waiterId': 'hana',
        'round': round,
        'name': name,
        'nameAm': 'ሽሮ',
        'qty': 2,
        'note': 'no onion',
        'options': [
          {'nameEn': 'Large', 'nameAm': null},
        ],
      },
    };

Map<String, dynamic> change(String itemId, String type, String to, [Map<String, dynamic>? details]) =>
    {'seq': 2, 'orderId': 'o1', 'itemId': itemId, 'stationId': 'kitchen', 'type': type, 'from': 'sent', 'to': to, 'details': ?details};

void main() {
  late AppDatabase db;
  setUp(() => db = memoryDb());
  tearDown(() => db.close());

  Future<OrderLine> line(String id) async => (await (db.select(db.orderLines)..where((l) => l.id.equals(id))).getSingle());

  test('item.sent creates the line from the ticket details', () async {
    await db.applyItemEvent(sent('i1'));

    final l = await line('i1');
    expect([l.tableId, l.nameEn, l.nameAm, l.qty, l.note, l.optionsText, l.round], ['t7', 'Shiro', 'ሽሮ', 2, 'no onion', 'Large', 1]);
    expect([l.state, l.sync], ['sent', 'sent']);
  });

  test('later events move the item through its states; undo goes back', () async {
    await db.applyItemEvent(sent('i1'));
    await db.applyItemEvent(change('i1', 'item.accepted', 'accepted'));
    await db.applyItemEvent(change('i1', 'item.ready', 'ready'));
    expect((await line('i1')).state, 'ready');

    await db.applyItemEvent(change('i1', 'item.undone', 'accepted'));
    expect((await line('i1')).state, 'accepted');
  });

  test('item.sent confirms a line this tablet already shows as sending (keeps its price)', () async {
    await db.addLocalLines([
      OrderLinesCompanion.insert(id: 'i1', orderId: 'o1', tableId: 't7', menuItemId: 'shiro', nameEn: 'Shiro', qty: 2, priceSantim: 18000, state: 'sent', sync: 'sending', createdAt: 1),
    ]);

    await db.applyItemEvent(sent('i1'));

    final l = await line('i1');
    expect([l.sync, l.priceSantim, l.round], ['sent', 18000, 1]);
  });

  test('a move or merge changes the table of the item', () async {
    await db.applyItemEvent(sent('i1'));
    await db.applyItemEvent(change('i1', 'item.table_changed', 'sent', {'tableId': 't9', 'tableName': 'Table 9'}));
    expect((await line('i1')).tableId, 't9');
  });

  test('when a table becomes free its lines are removed (the visit ended)', () async {
    await db.replaceTables([
      {'id': 't7', 'name': 'Table 7', 'area': null, 'seats': null, 'sortOrder': 0, 'state': 'ordered', 'sessionId': 's1', 'waiterId': 'hana'},
    ]);
    await db.applyItemEvent(sent('i1'));
    await db.applyItemEvent(sent('i2', tableId: 't8'));

    await db.setTableState('t7', 'free', null, null);

    expect((await db.select(db.orderLines).get()).map((l) => l.id), ['i2']);
  });

  test('a fresh table download also clears lines of tables that are free now', () async {
    await db.applyItemEvent(sent('i1'));
    await db.replaceTables([
      {'id': 't7', 'name': 'Table 7', 'area': null, 'seats': null, 'sortOrder': 0, 'state': 'free', 'sessionId': null, 'waiterId': null},
    ]);
    expect(await db.select(db.orderLines).get(), isEmpty);
  });

  test('an event for an item this tablet never saw is ignored', () async {
    await db.applyItemEvent(change('ghost', 'item.ready', 'ready'));
    expect(await db.select(db.orderLines).get(), isEmpty);
  });

  test('migration: a version-1 database upgrades and gets the order_lines table', () async {
    // A database as version 1 of the app left it: the outbox with one waiting round, no order_lines.
    final old = AppDatabase(NativeDatabase.memory(setup: (raw) {
      raw.execute('CREATE TABLE outbox (key TEXT NOT NULL PRIMARY KEY, message TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL, error TEXT)');
      raw.execute("INSERT INTO outbox VALUES ('o1', '{}', 1, 'pending', NULL)");
      raw.userVersion = 1;
    }));
    addTearDown(old.close);

    await old.addLocalLines([
      OrderLinesCompanion.insert(id: 'i1', orderId: 'o1', tableId: 't7', menuItemId: 'shiro', nameEn: 'Shiro', qty: 1, priceSantim: 18000, state: 'sent', sync: 'queued', createdAt: 1),
    ]);
    expect(await old.select(old.orderLines).get(), hasLength(1));
    expect((await old.pendingMessages()).single.key, 'o1'); // the waiting round survived the upgrade
  });

  group('replaceServerLines (a waiter tablet that missed too much reloads its lines)', () {
    Map<String, dynamic> downloaded(String itemId, String state, {String orderId = 'o2', String tableId = 't8', int price = 32000}) => {
          'itemId': itemId, 'orderId': orderId, 'state': state, 'at': 5000,
          'details': {'tableId': tableId, 'round': 2, 'name': 'Tibs', 'nameAm': null, 'qty': 1, 'note': null, 'menuItemId': 'tibs', 'priceSantim': price,
            'options': [{'nameEn': 'Spicy', 'nameAm': null}]},
        };
    OrderLinesCompanion local(String id, String sync, {String state = 'sent'}) => OrderLinesCompanion.insert(
        id: id, orderId: 'o-$id', tableId: 't7', menuItemId: 'shiro', nameEn: 'Shiro', qty: 1, priceSantim: 18000, state: state, sync: sync, createdAt: 1);

    test('adds lines it missed, with the server price, state and table', () async {
      await db.replaceServerLines([downloaded('i2', 'ready')]);

      final l = await line('i2');
      expect([l.orderId, l.tableId, l.nameEn, l.qty, l.optionsText, l.round, l.priceSantim, l.menuItemId], ['o2', 't8', 'Tibs', 1, 'Spicy', 2, 32000, 'tibs']);
      expect([l.state, l.sync, l.createdAt], ['ready', 'sent', 5000 * 1000]); // createdAt is in microseconds
    });

    test('updates lines it has: new state and table, but keeps its own price and options', () async {
      await db.addLocalLines([local('i1', 'sent').copyWith(optionIds: const Value('["large"]'))]);

      await db.replaceServerLines([downloaded('i1', 'delivered', orderId: 'o-i1', tableId: 't9', price: 99)]);

      final l = await line('i1');
      expect([l.state, l.tableId, l.sync], ['delivered', 't9', 'sent']);
      expect([l.priceSantim, l.optionIds, l.menuItemId], [18000, '["large"]', 'shiro']);
    });

    test('removes confirmed lines the server no longer gives (closed or handed-over tables)', () async {
      await db.addLocalLines([local('gone', 'sent', state: 'accepted')]);

      await db.replaceServerLines([downloaded('i2', 'sent')]);

      expect((await db.select(db.orderLines).get()).map((l) => l.id), ['i2']);
    });

    test('NEVER removes lines the server has not got yet: queued, sending, needs attention', () async {
      await db.addLocalLines([local('q', 'queued'), local('s', 'sending'), local('n', 'needs_attention')]);

      await db.replaceServerLines([]);

      expect({for (final l in await db.select(db.orderLines).get()) l.id: l.sync}, {'q': 'queued', 's': 'sending', 'n': 'needs_attention'});
    });

    test('a sending line the server already has becomes sent', () async {
      await db.addLocalLines([local('i1', 'sending')]);

      await db.replaceServerLines([downloaded('i1', 'accepted', orderId: 'o-i1')]);

      expect([(await line('i1')).sync, (await line('i1')).state], ['sent', 'accepted']);
    });
  });
}
