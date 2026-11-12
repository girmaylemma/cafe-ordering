/// The tablet's own SQLite database: the menu and tables (so building an order makes NO network
/// calls), the outbox of unsent rounds, and the last event `seq` seen (for catch-up after reconnect).
library;

import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'database.g.dart';

// ---------- downloaded from the server (replaced as a whole on each download) ----------

class Categories extends Table {
  TextColumn get id => text()();
  TextColumn get nameEn => text()();
  TextColumn get nameAm => text().nullable()();
  IntColumn get sortOrder => integer()();
  @override
  Set<Column> get primaryKey => {id};
}

class MenuItems extends Table {
  TextColumn get id => text()();
  TextColumn get categoryId => text().nullable()();
  TextColumn get nameEn => text()();
  TextColumn get nameAm => text().nullable()();
  IntColumn get priceSantim => integer()();
  TextColumn get stationId => text()();
  BoolColumn get fasting => boolean()();
  BoolColumn get soldOut => boolean()();
  IntColumn get sortOrder => integer()();

  /// JSON list of option group ids, in order.
  TextColumn get optionGroupIds => text()();
  @override
  Set<Column> get primaryKey => {id};
}

class OptionGroups extends Table {
  TextColumn get id => text()();
  TextColumn get nameEn => text()();
  TextColumn get nameAm => text().nullable()();
  IntColumn get minChoices => integer()();
  IntColumn get maxChoices => integer()();
  IntColumn get sortOrder => integer()();
  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('OptionChoice')
class OptionChoices extends Table {
  // Not "Options": drift's database already has an `options` property.
  @override
  String get tableName => 'options';

  TextColumn get id => text()();
  TextColumn get groupId => text()();
  TextColumn get nameEn => text()();
  TextColumn get nameAm => text().nullable()();
  IntColumn get extraSantim => integer()();
  IntColumn get sortOrder => integer()();
  @override
  Set<Column> get primaryKey => {id};
}

/// Tables on the floor map, with their live state (W-02), kept current by pushes.
class CafeTables extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  TextColumn get area => text().nullable()();
  IntColumn get seats => integer().nullable()();
  IntColumn get sortOrder => integer()();
  TextColumn get state => text()();
  TextColumn get sessionId => text().nullable()();
  TextColumn get waiterId => text().nullable()();
  @override
  Set<Column> get primaryKey => {id};
}

// ---------- made on the tablet ----------

/// Rounds (and table openings) waiting to reach the server. Kept until the server answers.
@DataClassName('OutboxEntry')
class OutboxEntries extends Table {
  @override
  String get tableName => 'outbox';

  /// The idempotency key (the order id for order.send).
  TextColumn get key => text()();

  /// The exact JSON message: a retry must be byte-identical to the first attempt (F1b).
  TextColumn get message => text()();
  IntColumn get createdAt => integer()();

  /// pending, or needs_attention (the server refused it; the waiter must look).
  TextColumn get status => text()();
  TextColumn get error => text().nullable()();
  @override
  Set<Column> get primaryKey => {key};
}

/// What is on the waiter's tables right now: built from item events (sent, accepted, ready ...)
/// plus rounds this tablet has not got confirmed yet. Cleared when a table becomes free.
class OrderLines extends Table {
  /// The item id (UUID v7 made on the tablet).
  TextColumn get id => text()();
  TextColumn get orderId => text()();
  TextColumn get tableId => text()();
  TextColumn get menuItemId => text()();
  TextColumn get nameEn => text()();
  TextColumn get nameAm => text().nullable()();
  IntColumn get qty => integer()();
  TextColumn get note => text().nullable()();

  /// Chosen options for display, e.g. "Large, Honey".
  TextColumn get optionsText => text().nullable()();

  /// Unit price incl. options, for DISPLAY only; the server's price counts (D-17).
  IntColumn get priceSantim => integer()();

  /// Round number from the server; null until the round is confirmed.
  IntColumn get round => integer().nullable()();

  /// sent, accepted, ready, delivered, cancelled, voided (the server's item state).
  TextColumn get state => text()();

  /// queued, sending, sent, needs_attention: has the server got it? (not an order state)
  TextColumn get sync => text()();
  TextColumn get error => text().nullable()();
  IntColumn get createdAt => integer()();
  @override
  Set<Column> get primaryKey => {id};
}

class KeyValues extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();
  @override
  Set<Column> get primaryKey => {key};
}

@DriftDatabase(tables: [Categories, MenuItems, OptionGroups, OptionChoices, CafeTables, OutboxEntries, KeyValues, OrderLines])
class AppDatabase extends _$AppDatabase {
  AppDatabase([QueryExecutor? executor]) : super(executor ?? driftDatabase(name: 'cafe'));

  /// Bump on every schema change and add a step below. Never edit an earlier step.
  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) => m.createAll(),
        onUpgrade: (m, from, to) async {
          if (from < 2) await m.createTable(orderLines); // F2b1: what is on each table
        },
      );

  // ---------- menu and tables ----------

  /// Replace the whole menu with a GET /menu answer (removed items disappear).
  Future<void> replaceMenu(Map<String, dynamic> menu) => transaction(() async {
        await delete(categories).go();
        await delete(menuItems).go();
        await delete(optionGroups).go();
        await delete(optionChoices).go();
        for (final c in (menu['categories'] as List).cast<Map<String, dynamic>>()) {
          await into(categories).insert(CategoriesCompanion.insert(
            id: c['id'] as String,
            nameEn: c['nameEn'] as String,
            nameAm: Value(c['nameAm'] as String?),
            sortOrder: c['sortOrder'] as int,
          ));
        }
        for (final i in (menu['items'] as List).cast<Map<String, dynamic>>()) {
          await into(menuItems).insert(MenuItemsCompanion.insert(
            id: i['id'] as String,
            categoryId: Value(i['categoryId'] as String?),
            nameEn: i['nameEn'] as String,
            nameAm: Value(i['nameAm'] as String?),
            priceSantim: i['priceSantim'] as int,
            stationId: i['stationId'] as String,
            fasting: i['fasting'] as bool,
            soldOut: i['soldOut'] as bool,
            sortOrder: i['sortOrder'] as int,
            optionGroupIds: jsonEncode(i['optionGroupIds'] ?? const []),
          ));
        }
        for (final g in ((menu['optionGroups'] as List?) ?? const []).cast<Map<String, dynamic>>()) {
          await into(optionGroups).insert(OptionGroupsCompanion.insert(
            id: g['id'] as String,
            nameEn: g['nameEn'] as String,
            nameAm: Value(g['nameAm'] as String?),
            minChoices: g['minChoices'] as int,
            maxChoices: g['maxChoices'] as int,
            sortOrder: g['sortOrder'] as int,
          ));
          for (final o in (g['options'] as List).cast<Map<String, dynamic>>()) {
            await into(optionChoices).insert(OptionChoicesCompanion.insert(
              id: o['id'] as String,
              groupId: g['id'] as String,
              nameEn: o['nameEn'] as String,
              nameAm: Value(o['nameAm'] as String?),
              extraSantim: o['extraSantim'] as int,
              sortOrder: o['sortOrder'] as int,
            ));
          }
        }
      });

  Future<void> replaceTables(List<dynamic> list) => transaction(() async {
        await delete(cafeTables).go();
        // Visits that ended while we were away: forget their lines.
        final free = list.cast<Map<String, dynamic>>().where((t) => t['state'] == 'free').map((t) => t['id'] as String).toList();
        await (delete(orderLines)..where((l) => l.tableId.isIn(free))).go();
        for (final t in list.cast<Map<String, dynamic>>()) {
          await into(cafeTables).insert(CafeTablesCompanion.insert(
            id: t['id'] as String,
            name: t['name'] as String,
            area: Value(t['area'] as String?),
            seats: Value(t['seats'] as int?),
            sortOrder: t['sortOrder'] as int,
            state: t['state'] as String,
            sessionId: Value(t['sessionId'] as String?),
            waiterId: Value(t['waiterId'] as String?),
          ));
        }
      });

  /// The floor map's tables, in the manager's order.
  Stream<List<CafeTable>> watchTables() =>
      (select(cafeTables)..orderBy([(t) => OrderingTerm.asc(t.sortOrder), (t) => OrderingTerm.asc(t.name)])).watch();

  /// A `menu.sold_out` push.
  Future<void> setSoldOut(String menuItemId, bool soldOut) =>
      (update(menuItems)..where((i) => i.id.equals(menuItemId))).write(MenuItemsCompanion(soldOut: Value(soldOut)));

  /// A `table.state` push. A table that becomes free ends its visit: its lines are removed.
  Future<void> setTableState(String tableId, String state, String? sessionId, String? waiterId) => transaction(() async {
        await (update(cafeTables)..where((t) => t.id.equals(tableId)))
            .write(CafeTablesCompanion(state: Value(state), sessionId: Value(sessionId), waiterId: Value(waiterId)));
        if (state == 'free') await (delete(orderLines)..where((l) => l.tableId.equals(tableId))).go();
      });

  // ---------- order lines ----------

  /// Lines this tablet just created (sending or queued), before the server confirms them.
  Future<void> addLocalLines(List<OrderLinesCompanion> lines) => batch((b) => b.insertAll(orderLines, lines, mode: InsertMode.insertOrReplace));

  Future<void> setLinesSync(String orderId, String sync, {String? error}) =>
      (update(orderLines)..where((l) => l.orderId.equals(orderId))).write(OrderLinesCompanion(sync: Value(sync), error: Value(error)));

  /// Apply one item event from the server (live push or catch-up).
  Future<void> applyItemEvent(Map<String, dynamic> e) async {
    final id = e['itemId'] as String;
    final details = (e['details'] as Map?)?.cast<String, dynamic>();
    switch (e['type']) {
      case 'item.sent':
        final d = details ?? const {};
        final options = ((d['options'] as List?) ?? const []).map((o) => (o as Map)['nameEn']).join(', ');
        final existing = await (select(orderLines)..where((l) => l.id.equals(id))).getSingleOrNull();
        if (existing != null) {
          // Our own round, confirmed: keep the display price we already have.
          await (update(orderLines)..where((l) => l.id.equals(id)))
              .write(OrderLinesCompanion(sync: const Value('sent'), error: const Value(null), round: Value(d['round'] as int?), state: Value(e['to'] as String)));
          return;
        }
        await into(orderLines).insert(OrderLinesCompanion.insert(
          id: id,
          orderId: e['orderId'] as String,
          tableId: d['tableId'] as String,
          menuItemId: '',
          nameEn: d['name'] as String,
          nameAm: Value(d['nameAm'] as String?),
          qty: d['qty'] as int,
          note: Value(d['note'] as String?),
          optionsText: Value(options.isEmpty ? null : options),
          priceSantim: 0, // unknown for rounds sent from another tablet (display only)
          round: Value(d['round'] as int?),
          state: e['to'] as String,
          sync: 'sent',
          createdAt: e['at'] is int ? (e['at'] as int) * 1000 : 0,
        ));
      case 'item.table_changed':
        await (update(orderLines)..where((l) => l.id.equals(id))).write(OrderLinesCompanion(tableId: Value(details!['tableId'] as String)));
      default:
        // accepted, ready, delivered, cancelled, voided, undone: the item's new state (ignored if unknown here)
        await (update(orderLines)..where((l) => l.id.equals(id))).write(OrderLinesCompanion(state: Value(e['to'] as String)));
    }
  }

  /// The current visit's lines of one table, round by round (unconfirmed rounds last).
  Stream<List<OrderLine>> watchLines(String tableId) => (select(orderLines)
        ..where((l) => l.tableId.equals(tableId))
        ..orderBy([(l) => OrderingTerm(expression: l.round, nulls: NullsOrder.last), (l) => OrderingTerm.asc(l.createdAt)]))
      .watch();

  Stream<CafeTable?> watchTable(String tableId) => (select(cafeTables)..where((t) => t.id.equals(tableId))).watchSingleOrNull();

  // ---------- outbox ----------

  /// [at] in microseconds keeps the order exact even for two rounds in the same millisecond.
  Future<void> enqueue(String key, String message, DateTime at) => into(outboxEntries).insert(
        OutboxEntriesCompanion.insert(key: key, message: message, createdAt: at.microsecondsSinceEpoch, status: 'pending'),
        mode: InsertMode.insertOrIgnore, // the same key twice is the same round
      );

  /// Waiting rounds, oldest first: they must reach the server in the order they were taken.
  Future<List<OutboxEntry>> pendingMessages() =>
      (select(outboxEntries)..where((o) => o.status.equals('pending'))..orderBy([(o) => OrderingTerm.asc(o.createdAt)])).get();

  Future<void> removeFromOutbox(String key) => (delete(outboxEntries)..where((o) => o.key.equals(key))).go();

  Future<void> markNeedsAttention(String key, String error) => (update(outboxEntries)..where((o) => o.key.equals(key)))
      .write(OutboxEntriesCompanion(status: const Value('needs_attention'), error: Value(error)));

  /// Unsent and refused rounds: sign-out is blocked while any exist (D-20).
  Stream<int> watchUnsentCount() => (selectOnly(outboxEntries)..addColumns([outboxEntries.key.count()])).map((r) => r.read(outboxEntries.key.count()) ?? 0).watchSingle();

  // ---------- last seen event ----------

  Future<int> lastSeq() async {
    final row = await (select(keyValues)..where((k) => k.key.equals('last_seq'))).getSingleOrNull();
    return row == null ? 0 : int.parse(row.value);
  }

  Future<void> setLastSeq(int seq) => into(keyValues).insertOnConflictUpdate(KeyValuesCompanion.insert(key: 'last_seq', value: '$seq'));
}
