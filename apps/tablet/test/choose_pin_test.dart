/// M1a: a PIN set by someone else is temporary. After signing in with it the person chooses their
/// own before anything else; anyone can change their own PIN from the floor map.
library;

import 'package:cafe_tablet/auth/credentials.dart';
import 'package:cafe_tablet/l10n/l10n.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';
import 'screens_test.dart' as app;

final en = lookupAppLocalizations(const Locale('en'));

const hana = {'id': 'hana', 'name': 'Hana', 'role': 'waiter'};

/// Signs Hana in with her temporary PIN 1234; `change` answers POST /auth/pin/change.
Future<List<Map<String, dynamic>>> signInTemporarily(WidgetTester tester, (int, Object) Function(Map<String, dynamic> body) change) async {
  final store = MemoryCredentialStore();
  await store.saveDevice(PairedDevice.fromJson('t', app.waiterDevice));
  final calls = <Map<String, dynamic>>[];
  final api = app.fakeApi({
    'GET /staff': (_) => (200, {'staff': [hana]}),
    'POST /auth/pin': (_) => (200, {'sessionToken': 's', 'user': hana, 'expiresAt': 1, 'mustChangePin': true}),
    'POST /auth/pin/change': (body) {
      calls.add(body);
      return change(body);
    },
  });
  await app.pumpApp(tester, api, store);
  await tester.tap(find.text('Hana'));
  await tester.pumpAndSettle();
  await tester.enterText(find.byKey(const Key('pin')), '1234');
  await tester.tap(find.text(en.pinSignIn));
  await tester.runAsync(settle);
  await tester.pumpAndSettle();
  return calls;
}

Future<void> fill(WidgetTester tester, String first, String second) async {
  await tester.enterText(find.byKey(const Key('new-pin')), first);
  await tester.enterText(find.byKey(const Key('new-pin-again')), second);
  await tester.pump();
}

FilledButton save(WidgetTester tester) => tester.widget<FilledButton>(find.byKey(const Key('pin-save')));

void main() {
  testWidgets('after a temporary PIN the person must choose their own (not the tables yet)', (tester) async {
    await signInTemporarily(tester, (_) => (200, {'ok': true}));

    expect(find.text(en.pinChooseTitle), findsOneWidget);
    expect(find.text(en.pinRuleWaiter), findsOneWidget);
    expect(find.widgetWithText(AppBar, 'Hana'), findsNothing); // not the floor map
    await unmountAndFlush(tester);
  });

  testWidgets('Save turns on only when both PINs follow the rule', (tester) async {
    await signInTemporarily(tester, (_) => (200, {'ok': true}));

    expect(save(tester).onPressed, isNull);
    await fill(tester, '12', '12');
    expect(save(tester).onPressed, isNull);
    await fill(tester, '8642', '8642');
    expect(save(tester).onPressed, isNotNull);
    await unmountAndFlush(tester);
  });

  testWidgets('two different PINs: says so, and the server is not asked', (tester) async {
    final calls = await signInTemporarily(tester, (_) => (200, {'ok': true}));

    await fill(tester, '8642', '8643');
    await tester.tap(find.byKey(const Key('pin-save')));
    await tester.pumpAndSettle();

    expect(find.text(en.pinMismatch), findsOneWidget);
    expect(calls, isEmpty);
    await unmountAndFlush(tester);
  });

  testWidgets('the same PIN as given is refused with a clear reason, and the fields are cleared', (tester) async {
    await signInTemporarily(tester, (_) => (400, {'error': 'SAME_PIN'}));

    await fill(tester, '1234', '1234');
    await tester.tap(find.byKey(const Key('pin-save')));
    await tester.runAsync(settle);
    await tester.pumpAndSettle();

    expect(find.text(en.errorSamePin), findsOneWidget);
    expect(tester.widget<TextField>(find.byKey(const Key('new-pin'))).controller!.text, isEmpty);
    await unmountAndFlush(tester);
  });

  testWidgets('a good choice signs in: the floor map, titled with the name', (tester) async {
    final calls = await signInTemporarily(tester, (_) => (200, {'ok': true}));

    await fill(tester, '8642', '8642');
    await tester.tap(find.byKey(const Key('pin-save')));
    await tester.runAsync(settle);
    await tester.pumpAndSettle();

    expect(calls.single, {'currentPin': '1234', 'newPin': '8642'});
    expect(find.widgetWithText(AppBar, 'Hana'), findsOneWidget);
    await unmountAndFlush(tester);
  });

  group('Change my PIN (floor map)', () {
    Future<List<Map<String, dynamic>>> signedIn(WidgetTester tester, (int, Object) Function(Map<String, dynamic> body) change) async {
      final store = MemoryCredentialStore();
      await store.saveDevice(PairedDevice.fromJson('t', app.waiterDevice));
      await store.saveSession(SignedInUser.fromJson({'sessionToken': 's', 'user': hana}));
      final calls = <Map<String, dynamic>>[];
      await app.pumpApp(tester, app.fakeApi({
        'POST /auth/pin/change': (body) {
          calls.add(body);
          return change(body);
        },
      }), store);
      await tester.tap(find.byKey(const Key('floor-menu')));
      await tester.pumpAndSettle();
      await tester.tap(find.text(en.floorChangePin));
      await tester.pumpAndSettle();
      return calls;
    }

    testWidgets('sends the current and the new PIN, and says it is changed', (tester) async {
      final calls = await signedIn(tester, (_) => (200, {'ok': true}));

      await tester.enterText(find.byKey(const Key('current-pin')), '8642');
      await fill(tester, '9753', '9753');
      await tester.tap(find.byKey(const Key('pin-save')));
      await tester.runAsync(settle);
      await tester.pumpAndSettle();

      expect(calls.single, {'currentPin': '8642', 'newPin': '9753'});
      expect(find.text(en.pinChanged), findsOneWidget);
      await unmountAndFlush(tester);
    });

    testWidgets('a wrong current PIN keeps the dialog open and says why', (tester) async {
      await signedIn(tester, (_) => (401, {'error': 'INVALID_CREDENTIALS'}));

      await tester.enterText(find.byKey(const Key('current-pin')), '0000');
      await fill(tester, '9753', '9753');
      await tester.tap(find.byKey(const Key('pin-save')));
      await tester.runAsync(settle);
      await tester.pumpAndSettle();

      expect(find.text(en.errorInvalidCredentials), findsOneWidget);
      expect(find.byKey(const Key('current-pin')), findsOneWidget);
      await unmountAndFlush(tester);
    });
  });
}
