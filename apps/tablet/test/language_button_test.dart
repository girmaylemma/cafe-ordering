/// F4b: the አማ / EN button. A waiter's tap switches the screen at once and tells the server; a
/// kitchen tablet keeps its choice to itself.
library;

import 'package:cafe_tablet/api/api_client.dart';
import 'package:cafe_tablet/auth/credentials.dart';
import 'package:cafe_tablet/l10n/l10n.dart';
import 'package:cafe_tablet/session/work_session.dart';
import 'package:cafe_tablet/ui/language_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';
import 'screens_test.dart' as app;

final am = lookupAppLocalizations(const Locale('am'));
final en = lookupAppLocalizations(const Locale('en'));

void main() {
  group('the button', () {
    Future<List<String>> pump(WidgetTester tester, String current) async {
      final changed = <String>[];
      await tester.pumpWidget(localizedApp(home: Scaffold(body: Center(child: LanguageButton(current: current, onChanged: changed.add)))));
      return changed;
    }

    testWidgets('names the other language, and a tap chooses it', (tester) async {
      final changed = await pump(tester, 'en');
      expect(find.text('አማ'), findsOneWidget);
      await tester.tap(find.byKey(const Key('language-button')));
      expect(changed, ['am']);

      final back = await pump(tester, 'am');
      expect(find.text('EN'), findsOneWidget);
      await tester.tap(find.byKey(const Key('language-button')));
      expect(back, ['en']);
    });

    testWidgets('is at least 48 dp, for a quick tap with one hand', (tester) async {
      await pump(tester, 'en');
      final size = tester.getSize(find.byKey(const Key('language-button')));
      expect(size.width, greaterThanOrEqualTo(48));
      expect(size.height, greaterThanOrEqualTo(48));
    });
  });

  group('in the app', () {
    const staff = {
      'staff': [
        {'id': 'hana', 'name': 'Hana', 'role': 'waiter', 'language': null},
      ],
      'language': 'en',
    };

    testWidgets("a waiter's tap switches the screen at once and tells the server", (tester) async {
      final store = MemoryCredentialStore();
      await store.saveDevice(PairedDevice.fromJson('t', app.waiterDevice));
      await store.saveSession(SignedInUser.fromJson({
        'sessionToken': 's',
        'user': {'id': 'hana', 'name': 'Hana', 'role': 'waiter'},
      }));
      final api = app.fakeApi({
        'GET /staff': (_) => (200, staff),
        'GET /menu': (_) => (200, {'categories': <Object>[], 'items': <Object>[], 'optionGroups': <Object>[]}),
        'GET /tables': (_) => (200, {'tables': <Object>[]}),
      });
      final db = memoryDb();
      final socket = FakeSocket();
      final work = WorkSession(
        api: api,
        db: db,
        device: DeviceInfo.fromJson(app.waiterDevice),
        deviceToken: 't',
        sessionToken: 's',
        userId: 'hana',
        connect: FakeServer([socket]).connect,
        delay: (_) async {},
      );
      addTearDown(work.stop);
      await tester.runAsync(() async {
        await work.start();
        await settle();
      });
      await app.pumpApp(tester, api, store, db: db, work: work);
      await tester.runAsync(settle);
      await tester.pumpAndSettle();
      expect(find.text(en.floorMine), findsOneWidget);

      await tester.tap(find.byKey(const Key('language-button')));
      await tester.runAsync(settle);
      await tester.pumpAndSettle();

      expect(find.text(am.floorMine), findsOneWidget); // switched, before any answer
      final sent = socket.sent.lastWhere((m) => m['type'] == 'staff.language');
      expect(sent['language'], 'am');
      expect(await tester.runAsync(() => db.watchMyLanguage('hana').first), (language: 'am', pending: true));

      socket.receive({'type': 'ack', 'idempotencyKey': sent['idempotencyKey'], 'result': {'ok': true, 'language': 'am'}});
      // The tap's code runs on the test's fake clock: pump it, and give the database real time.
      for (var i = 0; i < 3; i++) {
        await tester.pump();
        await tester.runAsync(settle);
      }
      expect(await tester.runAsync(() => db.watchMyLanguage('hana').first), (language: 'am', pending: false));
      await unmountAndFlush(tester);
    });

    testWidgets('a kitchen tap is stored on the tablet only', (tester) async {
      final store = MemoryCredentialStore();
      await store.saveDevice(PairedDevice.fromJson('t', app.kitchenDevice));
      final db = memoryDb();
      await app.pumpApp(tester, app.fakeApi({}), store, db: db);
      expect(find.text(en.kitchenSoldOutButton), findsOneWidget);

      await tester.tap(find.byKey(const Key('language-button')));
      await tester.runAsync(settle);
      await tester.pumpAndSettle();

      expect(find.text(am.kitchenSoldOutButton), findsOneWidget);
      expect(await tester.runAsync(() => db.watchKitchenLanguage().first), 'am');
      await unmountAndFlush(tester);
    });
  });
}
