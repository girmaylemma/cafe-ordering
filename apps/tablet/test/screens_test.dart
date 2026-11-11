import 'dart:convert';

import 'package:cafe_tablet/api/api_client.dart';
import 'package:cafe_tablet/app.dart';
import 'package:cafe_tablet/auth/auth_controller.dart';
import 'package:cafe_tablet/auth/credentials.dart';
import 'package:cafe_tablet/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fakes.dart';

const waiterDevice = {'id': 'd1', 'name': 'Tab 1', 'kind': 'waiter', 'stationId': null};
const kitchenDevice = {'id': 'k1', 'name': 'Kitchen 1', 'kind': 'station', 'stationId': 'kitchen'};

/// Routes: "METHOD /path" -> (status, body) or a function of the request body.
ApiClient fakeApi(Map<String, (int, Object) Function(Map<String, dynamic>)> routes) => ApiClient(
      MockClient((r) async {
        final route = routes['${r.method} ${r.url.path}'];
        if (route == null) return http.Response('{"error":"NOT_FOUND"}', 404);
        final (status, body) = route(r.body.isEmpty ? {} : jsonDecode(r.body) as Map<String, dynamic>);
        return http.Response(jsonEncode(body), status);
      }),
      Uri.parse('http://server'),
    );

Future<void> pumpApp(WidgetTester tester, ApiClient api, MemoryCredentialStore store) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [
      apiClientProvider.overrideWithValue(api),
      credentialStoreProvider.overrideWithValue(store),
      databaseProvider.overrideWithValue(memoryDb()),
    ],
    child: const CafeApp(),
  ));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('pairing: a wrong code shows why; a right code moves on to the PIN screen', (tester) async {
    final api = fakeApi({
      'POST /devices/pair': (body) => body['code'] == '482913' ? (200, {'token': 't', 'device': waiterDevice}) : (401, {'error': 'INVALID_CODE'}),
      'GET /staff': (_) => (200, {'staff': [{'id': 'hana', 'name': 'Hana', 'role': 'waiter'}]}),
    });
    await pumpApp(tester, api, MemoryCredentialStore());
    expect(find.text('Pair this tablet'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('pairing-code')), '000000');
    await tester.tap(find.text('Pair'));
    await tester.pumpAndSettle();
    expect(find.textContaining("didn't work"), findsOneWidget);

    await tester.enterText(find.byKey(const Key('pairing-code')), '482913');
    await tester.tap(find.text('Pair'));
    await tester.pumpAndSettle();
    expect(find.text('Who are you?'), findsOneWidget);
    expect(find.text('Hana'), findsOneWidget);
  });

  testWidgets('PIN sign-in: pick your name, type the PIN, and you are signed in', (tester) async {
    final store = MemoryCredentialStore();
    await store.saveDevice(PairedDevice.fromJson('t', waiterDevice));
    final api = fakeApi({
      'GET /staff': (_) => (200, {'staff': [{'id': 'hana', 'name': 'Hana', 'role': 'waiter'}, {'id': 'meron', 'name': 'Meron', 'role': 'waiter'}]}),
      'POST /auth/pin': (body) => body['pin'] == '1234'
          ? (200, {'sessionToken': 's', 'user': {'id': 'hana', 'name': 'Hana', 'role': 'waiter'}, 'expiresAt': 1})
          : (401, {'error': 'INVALID_CREDENTIALS'}),
    });
    await pumpApp(tester, api, store);

    await tester.tap(find.text('Hana'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('pin')), '9999');
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Wrong PIN. Try again.'), findsOneWidget);
    expect((tester.widget<TextField>(find.byKey(const Key('pin')))).controller!.text, isEmpty); // PIN cleared

    await tester.enterText(find.byKey(const Key('pin')), '1234');
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Signed in as Hana'), findsOneWidget);
  });

  testWidgets('a locked account says how long to wait', (tester) async {
    final store = MemoryCredentialStore();
    await store.saveDevice(PairedDevice.fromJson('t', waiterDevice));
    final api = fakeApi({
      'GET /staff': (_) => (200, {'staff': [{'id': 'hana', 'name': 'Hana', 'role': 'waiter'}]}),
      'POST /auth/pin': (_) => (423, {'error': 'LOCKED', 'retryAfterMs': 240000}),
    });
    await pumpApp(tester, api, store);

    await tester.tap(find.text('Hana'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('pin')), '1234');
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Locked for 4 minutes'), findsOneWidget);
  });

  testWidgets('a kitchen tablet goes straight to the kitchen screen (no PIN)', (tester) async {
    final store = MemoryCredentialStore();
    await store.saveDevice(PairedDevice.fromJson('t', kitchenDevice));
    await pumpApp(tester, fakeApi({}), store);
    expect(find.text('Kitchen station'), findsOneWidget);
  });
}
