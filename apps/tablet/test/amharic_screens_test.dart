/// F4a: every screen in Amharic, on a phone and a 10-inch tablet, at normal and large (1.3x)
/// text: no overflow (no cut-off or overlapping words), and Amharic is really shown.
/// Dishes use one very long Amharic name, the hardest case for the layout.
library;

import 'package:cafe_tablet/auth/credentials.dart';
import 'package:cafe_tablet/l10n/l10n.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';
import 'floor_map_test.dart' as floor;
import 'kitchen_screen_test.dart' as kitchen;
import 'order_screen_test.dart' as order;
import 'screens_test.dart' as app;
import 'sold_out_screen_test.dart' as sold_out;
import 'table_actions_test.dart' as actions;
import 'table_screen_test.dart' as table;
import 'tickets_db_test.dart' show sent;

const longName = 'የበግ ጥብስ ከአትክልትና ከቅመማ ቅመም ጋር በልዩ ሁኔታ የተዘጋጀ';
final ethiopic = RegExp(r'[ሀ-፿]');

const sizes = {'phone': Size(360, 640), 'tablet': Size(1280, 800)};
const scales = [1.0, 1.3];

/// The screen in Amharic at every size and text scale.
void inAmharic(String screen, Future<void> Function(WidgetTester tester) show) {
  for (final MapEntry(key: sizeName, value: size) in sizes.entries) {
    for (final scale in scales) {
      testWidgets('$screen in Amharic on a $sizeName at x$scale has no overflow', (tester) async {
        testLocale = const Locale('am');
        addTearDown(() => testLocale = const Locale('en'));
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = size;
        addTearDown(tester.view.reset);
        tester.platformDispatcher.textScaleFactorTestValue = scale;
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

        await show(tester);

        final error = tester.takeException();
        // The full error names the widget and file:line that overflowed.
        expect(error, isNull, reason: error is FlutterError ? error.toStringDeep() : null);
        expect(find.textContaining(ethiopic), findsWidgets);
        await unmountAndFlush(tester);
      });
    }
  }
}

void main() {
  final amharicApp = [appLocaleProvider.overrideWithValue(const Locale('am'))];

  inAmharic('the pairing screen (with an error)', (tester) async {
    final api = app.fakeApi({'POST /devices/pair': (_) => (401, {'error': 'INVALID_CODE'})});
    await app.pumpApp(tester, api, MemoryCredentialStore(), extra: amharicApp);
    await tester.enterText(find.byType(TextField), '123456');
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();
  });

  inAmharic('the PIN screen', (tester) async {
    final store = MemoryCredentialStore();
    await store.saveDevice(PairedDevice.fromJson('t', app.waiterDevice));
    final api = app.fakeApi({
      'GET /staff': (_) => (200, {'staff': [{'id': 'hana', 'name': 'Hana', 'role': 'waiter'}]}),
    });
    await app.pumpApp(tester, api, store, extra: amharicApp);
    await tester.tap(find.text('Hana'));
    await tester.pumpAndSettle();
  });

  inAmharic('the floor map (offline banner)', (tester) async {
    await floor.pumpFloor(tester, online: false);
  });

  inAmharic('the table screen (every state, a long dish name)', (tester) async {
    await table.pumpTable(tester, [
      table.line('a', 'Lamb tibs', nameAm: longName, round: 1, state: 'ready', note: 'no onion', options: 'Large · ትልቅ'),
      table.line('b', 'Tibs', nameAm: 'ጥብስ', round: 1, state: 'accepted'),
      table.line('c', 'Shiro', round: 2, state: 'voided'),
      table.line('d', 'Kitfo', round: 0, sync: 'queued'),
      table.line('e', 'Firfir', round: 0, sync: 'needs_attention', error: 'MENU_ITEM_NOT_FOUND'),
    ]);
  });

  inAmharic('the void dialog', (tester) async {
    await actions.pumpTable(tester, [actions.line('a', state: 'accepted')]);
    await tester.tap(find.byKey(const Key('line-a')));
    await actions.settled(tester);
    await actions.tapText(tester, lookupAppLocalizations(const Locale('am')).lineActionVoid);
  });

  inAmharic('the order screen (menu and order summary)', (tester) async {
    ((order.menu['items'] as List).first as Map)['nameAm'] = longName;
    await order.pumpOrder(tester, online: true);
    await tester.tap(find.text('Food'));
    await tester.pumpAndSettle();
    await order.tapItem(tester, 'shiro');
  });

  inAmharic('the option dialog', (tester) async {
    await order.pumpOrder(tester, online: true);
    await tester.tap(find.text('Drinks'));
    await tester.pumpAndSettle();
    await order.tapItem(tester, 'mac');
  });

  inAmharic('the kitchen screen (3 tickets, offline-sent, old)', (tester) async {
    kitchen.clockNow = DateTime(2026, 11, 17, 12);
    kitchen.screenAwake = kitchen.FakeScreenAwake();
    await kitchen.pumpKitchen(tester, [
      sent('i1', extra: {'nameAm': longName, 'sentWhileOffline': true}),
      sent('i2', orderId: 'o2', round: 2, at: 0),
      sent('i3', orderId: 'o3', table: 'Table 12'),
    ]);
  });

  inAmharic('the sold-out list', (tester) async {
    ((sold_out.menu['items'] as List).first as Map)['nameAm'] = longName;
    await sold_out.openSoldOut(tester);
  });

  group('menu headings in Amharic (F4b)', () {
    setUp(() => testLocale = const Locale('am'));
    tearDown(() => testLocale = const Locale('en'));

    testWidgets('category tabs and option group titles use the Amharic name', (tester) async {
      ((order.menu['categories'] as List)[1] as Map)['nameAm'] = 'መጠጥ';
      (((order.menu['optionGroups'] as List).first as Map))['nameAm'] = 'መጠን';
      await order.pumpOrder(tester, online: true);

      await tester.tap(find.text('መጠጥ'));
      await tester.pumpAndSettle();
      await order.tapItem(tester, 'mac');

      final am = lookupAppLocalizations(const Locale('am'));
      expect(find.text(am.orderRequired('መጠን')), findsOneWidget);
      expect(find.text(am.orderChoose('መጠን')), findsOneWidget);
      await unmountAndFlush(tester);
    });

    testWidgets('the sold-out list heads its dishes with the Amharic category name', (tester) async {
      ((sold_out.menu['categories'] as List).first as Map)['nameAm'] = 'ምግብ';
      await sold_out.openSoldOut(tester);

      expect(find.text('ምግብ'), findsOneWidget);
      await unmountAndFlush(tester);
    });
  });
}
