/// F4b/F4e: the language button. It shows the current language; a tap opens the list of all four,
/// each in its own name. A waiter's choice switches the screen at once and tells the server; a
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
final om = lookupAppLocalizations(const Locale('om'));
final ti = lookupAppLocalizations(const Locale('ti'));

/// Open the language list and choose one (by its own name).
Future<void> choose(WidgetTester tester, String name) async {
  await tester.tap(find.byKey(const Key('language-button')));
  await tester.pumpAndSettle();
  await tester.tap(find.text(name));
  await tester.runAsync(settle);
  await tester.pumpAndSettle();
}

void main() {
  group('the button', () {
    Future<List<String>> pump(WidgetTester tester, String current) async {
      final changed = <String>[];
      await tester.pumpWidget(
        localizedApp(
          home: Scaffold(
            body: Center(
              child: LanguageButton(current: current, onChanged: changed.add),
            ),
          ),
        ),
      );
      return changed;
    }

    testWidgets('shows the current language', (tester) async {
      for (final (language, short) in [
        ('en', 'EN'),
        ('am', 'አማ'),
        ('om', 'OM'),
        ('ti', 'ትግ'),
      ]) {
        await pump(tester, language);
        expect(find.text(short), findsOneWidget, reason: language);
      }
    });

    testWidgets(
      'a tap lists all four languages, each in its own name; choosing one reports it',
      (tester) async {
        final changed = await pump(tester, 'en');

        await tester.tap(find.byKey(const Key('language-button')));
        await tester.pumpAndSettle();
        for (final name in ['English', 'አማርኛ', 'Afaan Oromoo', 'ትግርኛ']) {
          expect(find.text(name), findsOneWidget, reason: name);
        }
        await tester.tap(find.text('Afaan Oromoo'));
        await tester.pumpAndSettle();

        expect(changed, ['om']);
      },
    );

    testWidgets('choosing the language already shown changes nothing', (
      tester,
    ) async {
      final changed = await pump(tester, 'ti');

      await tester.tap(find.byKey(const Key('language-button')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('ትግርኛ'));
      await tester.pumpAndSettle();

      expect(changed, isEmpty);
    });

    testWidgets('is at least 48 dp, for a quick tap with one hand', (
      tester,
    ) async {
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

    for (final (name, code, texts) in [
      ('አማርኛ', 'am', am),
      ('Afaan Oromoo', 'om', om),
    ]) {
      testWidgets(
        "a waiter choosing $name: the screen switches at once and the server is told",
        (tester) async {
          final store = MemoryCredentialStore();
          await store.saveDevice(PairedDevice.fromJson('t', app.waiterDevice));
          await store.saveSession(
            SignedInUser.fromJson({
              'sessionToken': 's',
              'user': {'id': 'hana', 'name': 'Hana', 'role': 'waiter'},
            }),
          );
          final api = app.fakeApi({
            'GET /staff': (_) => (200, staff),
            'GET /menu': (_) => (
              200,
              {
                'categories': <Object>[],
                'items': <Object>[],
                'optionGroups': <Object>[],
              },
            ),
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

          await choose(tester, name);

          expect(
            find.text(texts.floorMine),
            findsOneWidget,
          ); // switched, before any answer
          final sent = socket.sent.lastWhere(
            (m) => m['type'] == 'staff.language',
          );
          expect(sent['language'], code);
          expect(
            await tester.runAsync(() => db.watchMyLanguage('hana').first),
            (language: code, pending: true),
          );

          socket.receive({
            'type': 'ack',
            'idempotencyKey': sent['idempotencyKey'],
            'result': {'ok': true, 'language': code},
          });
          // The tap's code runs on the test's fake clock: pump it, and give the database real time.
          for (var i = 0; i < 3; i++) {
            await tester.pump();
            await tester.runAsync(settle);
          }
          expect(
            await tester.runAsync(() => db.watchMyLanguage('hana').first),
            (language: code, pending: false),
          );
          await unmountAndFlush(tester);
        },
      );
    }

    testWidgets('a kitchen tap is stored on the tablet only', (tester) async {
      final store = MemoryCredentialStore();
      await store.saveDevice(PairedDevice.fromJson('t', app.kitchenDevice));
      final db = memoryDb();
      await app.pumpApp(tester, app.fakeApi({}), store, db: db);
      expect(find.text(en.kitchenSoldOutButton), findsOneWidget);

      await choose(tester, 'አማርኛ');

      expect(find.text(am.kitchenSoldOutButton), findsOneWidget);
      expect(
        await tester.runAsync(() => db.watchKitchenLanguage().first),
        'am',
      );
      await unmountAndFlush(tester);
    });

    testWidgets('F4e: a kitchen tablet can speak Tigrinya', (tester) async {
      final store = MemoryCredentialStore();
      await store.saveDevice(PairedDevice.fromJson('t', app.kitchenDevice));
      final db = memoryDb();
      await app.pumpApp(tester, app.fakeApi({}), store, db: db);

      await choose(tester, 'ትግርኛ');

      expect(find.text(ti.kitchenSoldOutButton), findsOneWidget);
      expect(
        await tester.runAsync(() => db.watchKitchenLanguage().first),
        'ti',
      );
      await unmountAndFlush(tester);
    });
  });
}
