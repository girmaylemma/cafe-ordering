// The kitchen tablet's tickets (F3a): built only from item events, like the waiter's lines.
import 'package:cafe_tablet/data/database.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

/// An `item.sent` event as the server pushes it to a station (orders.ts).
Map<String, dynamic> sent(String itemId, {String orderId = 'o1', int round = 1, int at = 1000, String table = 'Table 7', Map<String, dynamic> extra = const {}}) => {
      'seq': 1,
      'orderId': orderId,
      'itemId': itemId,
      'stationId': 'kitchen',
      'type': 'item.sent',
      'from': null,
      'to': 'sent',
      'at': at,
      'details': {
        'tableId': 't7',
        'tableName': table,
        'waiterId': 'hana',
        'waiterName': 'Hana',
        'round': round,
        'name': 'Shiro',
        'nameAm': 'ሽሮ',
        'qty': 2,
        'note': 'no onion',
        'flag': null,
        'conflict': null,
        'options': [
          {'nameEn': 'Large', 'nameAm': null},
        ],
        'optionsChanged': false,
        'sentWhileOffline': false,
        ...extra,
      },
    };

Map<String, dynamic> moved(String itemId, String to) =>
    {'itemId': itemId, 'orderId': 'o1', 'type': 'item.${to == 'sent' ? 'undone' : to}', 'to': to, 'at': 2000};

void main() {
  late AppDatabase db;
  setUp(() => db = memoryDb());
  tearDown(() => db.close());

  test('a new item becomes a ticket line with everything the kitchen needs', () async {
    await db.applyTicketEvent(sent('i1', extra: {'flag': 'sold_out', 'sentWhileOffline': true}));

    final line = (await db.watchTickets().first).single;
    expect(line.tableLabel, 'Table 7');
    expect(line.waiterName, 'Hana');
    expect(line.round, 1);
    expect(line.nameEn, 'Shiro');
    expect(line.qty, 2);
    expect(line.note, 'no onion');
    expect(line.optionsText, 'Large');
    expect(line.flag, 'sold_out');
    expect(line.sentWhileOffline, isTrue);
    expect(line.state, 'sent');
    expect(line.receivedAt, 1000);
  });

  test('the same event twice (catch-up after a live push) gives one line', () async {
    await db.applyTicketEvent(sent('i1'));
    await db.applyTicketEvent(sent('i1'));
    expect(await db.watchTickets().first, hasLength(1));
  });

  test('accept, ready and undo change the state', () async {
    await db.applyTicketEvent(sent('i1'));
    await db.applyTicketEvent(moved('i1', 'accepted'));
    expect((await db.watchTickets().first).single.state, 'accepted');
    await db.applyTicketEvent(moved('i1', 'ready'));
    await db.applyTicketEvent({...moved('i1', 'accepted'), 'type': 'item.undone'});
    expect((await db.watchTickets().first).single.state, 'accepted');
  });

  test('oldest round first; lines of one round stay together', () async {
    await db.applyTicketEvent(sent('late', orderId: 'o2', round: 2, at: 5000));
    await db.applyTicketEvent(sent('early', orderId: 'o1', at: 1000));
    await db.applyTicketEvent(sent('early2', orderId: 'o1', at: 1000));

    expect((await db.watchTickets().first).map((l) => l.id), ['early', 'early2', 'late']);
  });

  test('a cancelled item stays crossed out while the rest of its round is still cooking', () async {
    await db.applyTicketEvent(sent('i1'));
    await db.applyTicketEvent(sent('i2'));
    await db.applyTicketEvent(moved('i1', 'cancelled'));

    expect((await db.watchTickets().first).map((l) => '${l.id}:${l.state}'), ['i1:cancelled', 'i2:sent']);
  });

  test('when every item of a round is delivered, cancelled or voided, the ticket is gone', () async {
    await db.applyTicketEvent(sent('i1'));
    await db.applyTicketEvent(sent('i2'));
    await db.applyTicketEvent(sent('other', orderId: 'o2'));
    await db.applyTicketEvent(moved('i1', 'voided'));
    await db.applyTicketEvent(moved('i2', 'delivered'));

    expect((await db.watchTickets().first).map((l) => l.id), ['other']);
    expect(await db.select(db.ticketItems).get(), hasLength(1)); // removed, not just hidden
  });

  test('a table move renames the ticket', () async {
    await db.applyTicketEvent(sent('i1'));
    await db.applyTicketEvent({'itemId': 'i1', 'orderId': 'o1', 'type': 'item.table_changed', 'to': 'sent', 'at': 2000, 'details': {'tableId': 't9', 'tableName': 'Table 9'}});

    expect((await db.watchTickets().first).single.tableLabel, 'Table 9');
  });

  test('an event for an item this tablet never saw is ignored', () async {
    await db.applyTicketEvent(moved('unknown', 'accepted'));
    expect(await db.watchTickets().first, isEmpty);
  });

  test("a station's menu: only its own items, by category order, then item order", () async {
    await db.replaceMenu({
      'categories': [
        {'id': 'drinks', 'nameEn': 'Drinks', 'nameAm': null, 'sortOrder': 0},
        {'id': 'food', 'nameEn': 'Food', 'nameAm': null, 'sortOrder': 1},
      ],
      'items': [
        for (final (id, cat, station, sort) in [('tibs', 'food', 'kitchen', 2), ('shiro', 'food', 'kitchen', 1), ('tea', 'drinks', 'bar', 0), ('soup', 'drinks', 'kitchen', 5)])
          {'id': id, 'categoryId': cat, 'nameEn': id, 'nameAm': null, 'priceSantim': 100, 'stationId': station, 'fasting': false, 'soldOut': id == 'tibs', 'sortOrder': sort, 'optionGroupIds': <String>[]},
      ],
      'optionGroups': <Object>[],
    });

    final menu = await db.watchStationMenu('kitchen').first;

    expect(menu.map((r) => '${r.category?.nameEn}/${r.item.id}'), ['Drinks/soup', 'Food/shiro', 'Food/tibs']);
    expect(menu.last.item.soldOut, isTrue);
  });

  test('upgrading from schema 4 keeps the waiter lines and adds the kitchen tickets table', () async {
    final old = AppDatabase(NativeDatabase.memory(setup: (raw) {
      raw.execute('''
        CREATE TABLE order_lines (id TEXT NOT NULL PRIMARY KEY, order_id TEXT NOT NULL, table_id TEXT NOT NULL,
          menu_item_id TEXT NOT NULL, name_en TEXT NOT NULL, name_am TEXT, qty INTEGER NOT NULL, note TEXT,
          options_text TEXT, price_santim INTEGER NOT NULL, option_ids TEXT, round INTEGER, state TEXT NOT NULL,
          sync TEXT NOT NULL, error TEXT, created_at INTEGER NOT NULL)''');
      raw.execute("INSERT INTO order_lines VALUES ('i1','o1','t7','shiro','Shiro',NULL,1,NULL,NULL,18000,NULL,1,'sent','sent',NULL,1)");
      raw.execute('PRAGMA user_version = 4');
    }));
    addTearDown(old.close);

    await old.applyTicketEvent(sent('k1'));

    expect((await old.select(old.orderLines).getSingle()).nameEn, 'Shiro');
    expect((await old.watchTickets().first).single.id, 'k1');
  });
}
