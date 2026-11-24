/// F4a: dish and option names in both languages (design 5.4). Waiters and cooks call dishes by
/// both names, so both are always shown: the current language big, the other small under it.
library;

import 'package:cafe_tablet/data/database.dart';
import 'package:cafe_tablet/l10n/names.dart';
import 'package:cafe_tablet/ui/dish_name.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  group('names', () {
    test('primaryName: the current language, English when there is no Amharic', () {
      expect(primaryName('Tibs', 'ጥብስ', 'en'), 'Tibs');
      expect(primaryName('Tibs', 'ጥብስ', 'am'), 'ጥብስ');
      expect(primaryName('Tibs', null, 'am'), 'Tibs');
    });

    test('secondaryName: the other language, or nothing when there is no Amharic', () {
      expect(secondaryName('Tibs', 'ጥብስ', 'en'), 'ጥብስ');
      expect(secondaryName('Tibs', 'ጥብስ', 'am'), 'Tibs');
      expect(secondaryName('Tibs', null, 'en'), isNull);
      expect(secondaryName('Tibs', null, 'am'), isNull);
      expect(secondaryName('Tibs', '', 'en'), isNull);
    });

    test("F4e: Tigrinya (Ge'ez script) puts the Amharic name first, like Amharic", () {
      expect(primaryName('Tibs', 'ጥብስ', 'ti'), 'ጥብስ');
      expect(secondaryName('Tibs', 'ጥብስ', 'ti'), 'Tibs');
      expect(primaryName('Tibs', null, 'ti'), 'Tibs'); // no Amharic name: English, never empty
      expect(secondaryName('Tibs', null, 'ti'), isNull);
    });

    test('F4e: Afaan Oromoo (Latin script) puts the English name first, like English', () {
      expect(primaryName('Tibs', 'ጥብስ', 'om'), 'Tibs');
      expect(secondaryName('Tibs', 'ጥብስ', 'om'), 'ጥብስ');
    });

    test('optionLabel: both names on one line, English first', () {
      expect(optionLabel('Large', 'ትልቅ'), 'Large · ትልቅ');
      expect(optionLabel('Large', null), 'Large');
      expect(optionLabel('Large', ''), 'Large');
      expect(optionLabel('', 'ትልቅ'), 'ትልቅ'); // a snapshot without an English name
    });
  });

  group('DishName', () {
    Future<void> pump(WidgetTester tester, Widget dish, {Locale locale = const Locale('en')}) =>
        tester.pumpWidget(localizedApp(locale: locale, home: Scaffold(body: dish)));

    testWidgets('shows both names, English first in English', (tester) async {
      await pump(tester, const DishName(en: 'Tibs', am: 'ጥብስ', qty: 2));
      expect(find.text('2× Tibs'), findsOneWidget);
      expect(find.text('ጥብስ'), findsOneWidget);
    });

    testWidgets('in Amharic puts the Amharic name first', (tester) async {
      await pump(tester, const DishName(en: 'Tibs', am: 'ጥብስ', qty: 2), locale: const Locale('am'));
      expect(find.text('2× ጥብስ'), findsOneWidget);
      expect(find.text('Tibs'), findsOneWidget);
    });

    testWidgets('F4e: in Tigrinya the Amharic name comes first (kitchen ticket, table and order screens)', (tester) async {
      await pump(tester, const DishName(en: 'Tibs', am: 'ጥብስ', qty: 2), locale: const Locale('ti'));
      expect(find.text('2× ጥብስ'), findsOneWidget);
      expect(find.text('Tibs'), findsOneWidget);
    });

    testWidgets('F4e: in Afaan Oromoo the English name comes first', (tester) async {
      await pump(tester, const DishName(en: 'Tibs', am: 'ጥብስ', qty: 2), locale: const Locale('om'));
      expect(find.text('2× Tibs'), findsOneWidget);
      expect(find.text('ጥብስ'), findsOneWidget);
    });

    testWidgets('no Amharic name: one line only, never an empty one', (tester) async {
      await pump(tester, const DishName(en: 'Tibs', am: null));
      expect(find.descendant(of: find.byType(DishName), matching: find.byType(Text)), findsOneWidget);
      expect(find.text('Tibs'), findsOneWidget);
    });
  });

  group('option texts stored on lines', () {
    late AppDatabase db;
    setUp(() => db = memoryDb());
    tearDown(() => db.close());

    const options = [
      {'nameEn': 'Large', 'nameAm': 'ትልቅ'},
      {'nameEn': 'Spicy', 'nameAm': null},
    ];
    Map<String, dynamic> sentEvent() => {
          'seq': 1, 'orderId': 'o1', 'itemId': 'i1', 'stationId': 'kitchen', 'type': 'item.sent', 'from': null, 'to': 'sent', 'at': 1000,
          'details': {'tableId': 't7', 'tableName': 'Table 7', 'round': 1, 'name': 'Tibs', 'nameAm': 'ጥብስ', 'qty': 1, 'note': null, 'options': options},
        };

    test('a waiter line keeps both option names', () async {
      await db.applyItemEvent(sentEvent());
      expect((await db.select(db.orderLines).getSingle()).optionsText, 'Large · ትልቅ, Spicy');
    });

    test('a reloaded waiter line keeps both option names', () async {
      await db.replaceServerLines([
        {'itemId': 'i1', 'orderId': 'o1', 'state': 'sent', 'at': 1000, 'details': sentEvent()['details']},
      ]);
      expect((await db.select(db.orderLines).getSingle()).optionsText, 'Large · ትልቅ, Spicy');
    });

    test('a kitchen ticket keeps both option names', () async {
      await db.applyTicketEvent(sentEvent());
      expect((await db.select(db.ticketItems).getSingle()).optionsText, 'Large · ትልቅ, Spicy');
    });

    test('an option without a name does not stop the line (sync keeps working)', () async {
      final event = sentEvent();
      (event['details'] as Map)['options'] = [
        {'nameAm': 'ትልቅ'},
        {'nameEn': 'Spicy', 'nameAm': null},
      ];
      await db.applyItemEvent(event);
      await db.applyTicketEvent(event);
      expect((await db.select(db.orderLines).getSingle()).optionsText, 'ትልቅ, Spicy');
      expect((await db.select(db.ticketItems).getSingle()).optionsText, 'ትልቅ, Spicy');
    });

    test('a line stored before F4a keeps its old option text', () async {
      await db.addLocalLines([
        OrderLinesCompanion.insert(
            id: 'old', orderId: 'o0', tableId: 't7', menuItemId: 'm', nameEn: 'Tibs', qty: 1, priceSantim: 0, state: 'sent', sync: 'sent', createdAt: 1,
            optionsText: const Value('Large, Spicy')),
      ]);
      expect((await db.watchLines('t7').first).single.optionsText, 'Large, Spicy');
    });
  });
}
