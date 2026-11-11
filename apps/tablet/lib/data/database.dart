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

class KeyValues extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();
  @override
  Set<Column> get primaryKey => {key};
}

@DriftDatabase(tables: [Categories, MenuItems, OptionGroups, OptionChoices, CafeTables, OutboxEntries, KeyValues])
class AppDatabase extends _$AppDatabase {
  AppDatabase([QueryExecutor? executor]) : super(executor ?? driftDatabase(name: 'cafe'));

  @override
  int get schemaVersion => 1;

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

  /// A `menu.sold_out` push.
  Future<void> setSoldOut(String menuItemId, bool soldOut) =>
      (update(menuItems)..where((i) => i.id.equals(menuItemId))).write(MenuItemsCompanion(soldOut: Value(soldOut)));

  /// A `table.state` push.
  Future<void> setTableState(String tableId, String state, String? sessionId, String? waiterId) =>
      (update(cafeTables)..where((t) => t.id.equals(tableId)))
          .write(CafeTablesCompanion(state: Value(state), sessionId: Value(sessionId), waiterId: Value(waiterId)));

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
