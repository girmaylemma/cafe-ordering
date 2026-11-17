/// F4b: which language the screen uses (design 5.1): the waiter's own, the kitchen tablet's, the
/// café's, else English.
library;

import 'package:cafe_tablet/auth/credentials.dart';
import 'package:cafe_tablet/l10n/l10n.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';
import 'screens_test.dart' as app;

final am = lookupAppLocalizations(const Locale('am'));
final en = lookupAppLocalizations(const Locale('en'));

String resolve({bool paired = true, bool isKitchen = false, String? user, String? mine, String? kitchen, String? cafe}) => resolveLanguage(
      paired: paired,
      isKitchen: isKitchen,
      signedInUserId: user,
      myLanguage: mine,
      kitchenLanguage: kitchen,
      cafeLanguage: cafe,
    );

void main() {
  group('resolveLanguage', () {
    test('an unpaired tablet speaks English, whatever the café', () => expect(resolve(paired: false, cafe: 'am'), 'en'));
    test('PIN screen: the café language', () => expect(resolve(cafe: 'am'), 'am'));
    test('PIN screen without a café language: English', () => expect(resolve(), 'en'));
    test("PIN screen: a waiter's choice does not count (nobody signed in)", () => expect(resolve(mine: 'am', cafe: 'en'), 'en'));
    test("signed in with a choice: the waiter's", () => expect(resolve(user: 'hana', mine: 'am', cafe: 'en'), 'am'));
    test('signed in without a choice: the café', () => expect(resolve(user: 'hana', cafe: 'am'), 'am'));
    test('signed in, no choice, no café: English', () => expect(resolve(user: 'hana'), 'en'));
    test("kitchen with a choice: the tablet's", () => expect(resolve(isKitchen: true, kitchen: 'am', cafe: 'en'), 'am'));
    test('kitchen without a choice: the café', () => expect(resolve(isKitchen: true, cafe: 'am'), 'am'));
    test('an unknown value counts as no choice', () {
      expect(resolve(user: 'hana', mine: 'fr', cafe: 'am'), 'am');
      expect(resolve(isKitchen: true, kitchen: 'xx', cafe: 'fr'), 'en');
    });
  });

  group('the app follows it', () {
    Map<String, Object> staff(String language) => {
          'staff': [
            {'id': 'hana', 'name': 'Hana', 'role': 'waiter', 'language': 'am'},
            {'id': 'abel', 'name': 'Abel', 'role': 'waiter', 'language': null},
          ],
          'language': language,
        };

    Future<MemoryCredentialStore> pairedWaiterTablet() async {
      final store = MemoryCredentialStore();
      await store.saveDevice(PairedDevice.fromJson('t', app.waiterDevice));
      return store;
    }

    testWidgets('the PIN screen speaks the café language', (tester) async {
      final api = app.fakeApi({'GET /staff': (_) => (200, staff('am'))});

      await app.pumpApp(tester, api, await pairedWaiterTablet());
      await tester.runAsync(settle);
      await tester.pumpAndSettle();

      expect(find.text(am.pinTitle), findsOneWidget);
      await unmountAndFlush(tester);
    });

    testWidgets('a café language downloaded later changes the PIN screen', (tester) async {
      final db = memoryDb();
      final api = app.fakeApi({'GET /staff': (_) => (200, staff('en'))});
      await app.pumpApp(tester, api, await pairedWaiterTablet(), db: db);
      await tester.runAsync(settle);
      await tester.pumpAndSettle();
      expect(find.text(en.pinTitle), findsOneWidget);

      await tester.runAsync(() => db.setCafeLanguage('am')); // the manager changed it; a reconnect downloaded it
      await tester.runAsync(settle);
      await tester.pumpAndSettle();

      expect(find.text(am.pinTitle), findsOneWidget);
      await unmountAndFlush(tester);
    });

    testWidgets("two waiters on one phone: the next one gets the café language, not Hana's", (tester) async {
      final api = app.fakeApi({
        'GET /staff': (_) => (200, staff('en')),
        'POST /auth/sign-out': (_) => (204, <String, Object>{}),
        'POST /auth/pin': (body) => (200, {
              'sessionToken': 's-${body['userId']}',
              'user': body['userId'] == 'hana'
                  ? {'id': 'hana', 'name': 'Hana', 'role': 'waiter', 'language': 'am'}
                  : {'id': 'abel', 'name': 'Abel', 'role': 'waiter', 'language': null},
              'expiresAt': 1,
            }),
      });
      await app.pumpApp(tester, api, await pairedWaiterTablet());
      await tester.runAsync(settle);
      await tester.pumpAndSettle();

      Future<void> signIn(String name) async {
        await tester.tap(find.text(name));
        await tester.pumpAndSettle();
        await tester.enterText(find.byKey(const Key('pin')), '1234');
        await tester.tap(find.byType(FilledButton));
        await tester.runAsync(settle);
        await tester.pumpAndSettle();
      }

      await signIn('Hana');
      expect(find.text(am.floorMine), findsOneWidget); // Hana's own language

      await tester.tap(find.byIcon(Icons.logout));
      await tester.runAsync(settle);
      await tester.pumpAndSettle();
      expect(find.text(en.pinTitle), findsOneWidget); // nobody signed in: the café's

      await signIn('Abel');
      expect(find.text(en.floorMine), findsOneWidget); // Abel has no choice: the café's
      await unmountAndFlush(tester);
    });
  });
}
