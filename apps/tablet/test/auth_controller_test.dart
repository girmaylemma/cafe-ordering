import 'dart:convert';

import 'package:cafe_tablet/api/api_client.dart';
import 'package:cafe_tablet/auth/auth_controller.dart';
import 'package:cafe_tablet/auth/credentials.dart';
import 'package:cafe_tablet/data/database.dart';
import 'package:cafe_tablet/providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fakes.dart';

/// A fake server: routes are "METHOD /path" -> (status, body).
ApiClient fakeApi(Map<String, (int, Object)> routes) {
  return ApiClient(
    MockClient((r) async {
      final route = routes['${r.method} ${r.url.path}'];
      if (route == null) return http.Response('{"error":"NOT_FOUND"}', 404);
      return http.Response(jsonEncode(route.$2), route.$1, headers: {'content-type': 'application/json'});
    }),
    Uri.parse('http://server'),
  );
}

const waiterDevice = {'id': 'd1', 'name': 'Tab 1', 'kind': 'waiter', 'stationId': null};
const kitchenDevice = {'id': 'k1', 'name': 'Kitchen', 'kind': 'station', 'stationId': 'kitchen'};
const hanaSession = {
  'sessionToken': 'sess',
  'user': {'id': 'hana', 'name': 'Hana', 'role': 'waiter'},
  'expiresAt': 1,
};

ProviderContainer container(ApiClient api, MemoryCredentialStore store, [AppDatabase? db]) {
  final database = db ?? memoryDb();
  addTearDown(database.close);
  final c = ProviderContainer(overrides: [
    apiClientProvider.overrideWithValue(api),
    credentialStoreProvider.overrideWithValue(store),
    databaseProvider.overrideWithValue(database),
  ]);
  addTearDown(c.dispose);
  return c;
}

void main() {
  test('starts unpaired when nothing is stored', () async {
    final c = container(fakeApi({}), MemoryCredentialStore());
    expect(await c.read(authControllerProvider.future), isA<Unpaired>());
  });

  test('pairing a waiter tablet stores the token and asks for a PIN', () async {
    final store = MemoryCredentialStore();
    final c = container(fakeApi({'POST /devices/pair': (200, {'token': 't', 'device': waiterDevice})}), store);
    await c.read(authControllerProvider.future);

    await c.read(authControllerProvider.notifier).pair('482913');

    expect(c.read(authControllerProvider).value, isA<NeedsSignIn>());
    expect((await store.loadDevice())?.token, 't');
  });

  test('pairing a kitchen tablet is ready at once (stations need no PIN)', () async {
    final c = container(fakeApi({'POST /devices/pair': (200, {'token': 't', 'device': kitchenDevice})}), MemoryCredentialStore());
    await c.read(authControllerProvider.future);

    await c.read(authControllerProvider.notifier).pair('482913');

    final state = c.read(authControllerProvider).value;
    expect(state, isA<StationReady>());
    expect((state as StationReady).device.stationId, 'kitchen');
  });

  test('a wrong code keeps the tablet unpaired and says why', () async {
    final c = container(fakeApi({'POST /devices/pair': (401, {'error': 'INVALID_CODE'})}), MemoryCredentialStore());
    await c.read(authControllerProvider.future);

    await c.read(authControllerProvider.notifier).pair('000000');

    final state = c.read(authControllerProvider).value;
    expect(state, isA<Unpaired>());
    expect((state as Unpaired).error, 'INVALID_CODE');
  });

  test('a stored device and session survive a restart', () async {
    final store = MemoryCredentialStore();
    await store.saveDevice(PairedDevice.fromJson('t', waiterDevice));
    await store.saveSession(SignedInUser.fromJson(hanaSession));
    final c = container(fakeApi({}), store);

    final state = await c.read(authControllerProvider.future);

    expect(state, isA<SignedIn>());
    expect((state as SignedIn).user.name, 'Hana');
  });

  test('a correct PIN signs in and stores the session; a lock is reported with the wait', () async {
    final store = MemoryCredentialStore();
    await store.saveDevice(PairedDevice.fromJson('t', waiterDevice));
    var locked = false;
    final api = ApiClient(
      MockClient((r) async => locked
          ? http.Response(jsonEncode({'error': 'LOCKED', 'retryAfterMs': 300000}), 423)
          : http.Response(jsonEncode(hanaSession), 200)),
      Uri.parse('http://server'),
    );
    final c = container(api, store);
    await c.read(authControllerProvider.future);

    await c.read(authControllerProvider.notifier).signIn('hana', '1234');
    expect(c.read(authControllerProvider).value, isA<SignedIn>());
    expect((await store.loadSession())?.sessionToken, 'sess');

    await c.read(authControllerProvider.notifier).signOut();
    locked = true;
    await c.read(authControllerProvider.notifier).signIn('hana', '1234');
    final state = c.read(authControllerProvider).value as NeedsSignIn;
    expect(state.error, 'LOCKED');
    expect(state.retryAfter, const Duration(minutes: 5));
  });

  test('sign-out forgets the session but keeps the tablet paired', () async {
    final store = MemoryCredentialStore();
    await store.saveDevice(PairedDevice.fromJson('t', waiterDevice));
    await store.saveSession(SignedInUser.fromJson(hanaSession));
    final c = container(fakeApi({'POST /auth/sign-out': (204, {})}), store);
    await c.read(authControllerProvider.future);

    await c.read(authControllerProvider.notifier).signOut();

    expect(c.read(authControllerProvider).value, isA<NeedsSignIn>());
    expect(await store.loadSession(), isNull);
    expect(await store.loadDevice(), isNotNull);
  });

  test('a revoked tablet (401 on sign-in) forgets its token and goes back to pairing', () async {
    final store = MemoryCredentialStore();
    await store.saveDevice(PairedDevice.fromJson('t', waiterDevice));
    final c = container(fakeApi({'POST /auth/pin': (401, {'error': 'UNAUTHORIZED_DEVICE'})}), store);
    await c.read(authControllerProvider.future);

    await c.read(authControllerProvider.notifier).signIn('hana', '1234');

    expect(c.read(authControllerProvider).value, isA<Unpaired>());
    expect(await store.loadDevice(), isNull);
  });

  test('sign-out is refused while rounds are still waiting to be sent (D-20)', () async {
    final store = MemoryCredentialStore();
    await store.saveDevice(PairedDevice.fromJson('t', waiterDevice));
    await store.saveSession(SignedInUser.fromJson(hanaSession));
    final db = memoryDb();
    await db.enqueue('o1', '{"type":"order.send"}', DateTime(2026));
    final c = container(fakeApi({'POST /auth/sign-out': (204, {})}), store, db);
    await c.read(authControllerProvider.future);

    await c.read(authControllerProvider.notifier).signOut();

    final state = c.read(authControllerProvider).value;
    expect(state, isA<SignedIn>());
    expect((state as SignedIn).error, 'UNSENT_ROUNDS');
    expect(await store.loadSession(), isNotNull);
  });

  group('temporary PIN (M1a)', () {
    const temporarySession = {...hanaSession, 'mustChangePin': true};

    Future<(ProviderContainer, MemoryCredentialStore, List<({String route, String? session, Map<String, dynamic> body})>)> signedInTemporarily(
      Map<String, (int, Object)> more,
    ) async {
      final store = MemoryCredentialStore();
      await store.saveDevice(PairedDevice.fromJson('t', waiterDevice));
      final (api, calls) = recordingApi({'POST /auth/pin': (200, temporarySession), ...more});
      final c = container(api, store);
      await c.read(authControllerProvider.future);
      await c.read(authControllerProvider.notifier).signIn('hana', '1234');
      return (c, store, calls);
    }

    test('a temporary PIN leads to "choose your own", and the session is not saved yet', () async {
      final (c, store, _) = await signedInTemporarily({});

      final state = c.read(authControllerProvider).value;
      expect(state, isA<MustChangePin>());
      expect((state as MustChangePin).user.id, 'hana');
      expect(await store.loadSession(), isNull);
    });

    test('choosing sends the temporary PIN as the current one with the session, then signs in and saves the session', () async {
      final (c, store, calls) = await signedInTemporarily({'POST /auth/pin/change': (200, {'ok': true})});

      await c.read(authControllerProvider.notifier).choosePin('8642');

      final change = calls.lastWhere((x) => x.route == 'POST /auth/pin/change');
      expect(change.session, 'sess');
      expect(change.body, {'currentPin': '1234', 'newPin': '8642'});
      expect(c.read(authControllerProvider).value, isA<SignedIn>());
      expect((await store.loadSession())?.sessionToken, 'sess');
    });

    test('a refused choice stays on "choose your own" and says why', () async {
      final (c, store, _) = await signedInTemporarily({'POST /auth/pin/change': (400, {'error': 'SAME_PIN'})});

      await c.read(authControllerProvider.notifier).choosePin('1234');

      final state = c.read(authControllerProvider).value;
      expect(state, isA<MustChangePin>());
      expect((state as MustChangePin).error, 'SAME_PIN');
      expect(await store.loadSession(), isNull);
    });

    test('closing the app before choosing: the next start asks for the PIN again', () async {
      final (_, store, _) = await signedInTemporarily({});

      final restarted = container(fakeApi({}), store);

      expect(await restarted.read(authControllerProvider.future), isA<NeedsSignIn>());
    });

    test('changeMyPin: done is null; a refusal returns its code', () async {
      final store = MemoryCredentialStore();
      await store.saveDevice(PairedDevice.fromJson('t', waiterDevice));
      await store.saveSession(SignedInUser.fromJson({'sessionToken': 'sess', 'user': hanaSession['user']}));
      var reply = (200, <String, Object>{'ok': true});
      final calls = <Map<String, dynamic>>[];
      final api = ApiClient(
        MockClient((r) async {
          calls.add({'session': r.headers['X-Staff-Session'], ...jsonDecode(r.body) as Map<String, dynamic>});
          return http.Response(jsonEncode(reply.$2), reply.$1, headers: {'content-type': 'application/json'});
        }),
        Uri.parse('http://server'),
      );
      final c = container(api, store);
      await c.read(authControllerProvider.future);
      final auth = c.read(authControllerProvider.notifier);

      expect(await auth.changeMyPin('1234', '8642'), isNull);
      expect(calls.last, {'session': 'sess', 'currentPin': '1234', 'newPin': '8642'});
      reply = (401, {'error': 'INVALID_CREDENTIALS'});
      expect(await auth.changeMyPin('0000', '8642'), 'INVALID_CREDENTIALS');
      reply = (423, {'error': 'LOCKED', 'retryAfterMs': 300000});
      expect(await auth.changeMyPin('0000', '8642'), 'LOCKED');
      expect(c.read(authControllerProvider).value, isA<SignedIn>()); // still signed in
    });
  });

  group('languages (F4b)', () {
    Future<(ProviderContainer, AppDatabase)> pinScreen(Map<String, (int, Object)> routes) async {
      final store = MemoryCredentialStore();
      await store.saveDevice(PairedDevice.fromJson('t', waiterDevice));
      final db = memoryDb();
      final c = container(fakeApi(routes), store, db);
      await c.read(authControllerProvider.future);
      return (c, db);
    }

    test("the PIN screen's staff download stores the café language", () async {
      final (c, db) = await pinScreen({
        'GET /staff': (200, {'staff': [{'id': 'hana', 'name': 'Hana', 'role': 'waiter'}], 'language': 'am'}),
      });

      expect((await c.read(authControllerProvider.notifier).staff()).single.name, 'Hana');
      expect(await db.watchCafeLanguage().first, 'am');
    });

    test("sign-in keeps the server's language for this waiter", () async {
      final (c, db) = await pinScreen({
        'POST /auth/pin': (200, {...hanaSession, 'user': {'id': 'hana', 'name': 'Hana', 'role': 'waiter', 'language': 'am'}}),
      });

      await c.read(authControllerProvider.notifier).signIn('hana', '1234');

      expect(await db.watchMyLanguage('hana').first, (language: 'am', pending: false));
    });

    test('sign-in does not overwrite a choice still to send', () async {
      final (c, db) = await pinScreen({
        'POST /auth/pin': (200, {...hanaSession, 'user': {'id': 'hana', 'name': 'Hana', 'role': 'waiter', 'language': 'am'}}),
      });
      await db.setMyLanguage('hana', 'en', pending: true); // switched offline, never sent

      await c.read(authControllerProvider.notifier).signIn('hana', '1234');

      expect(await db.watchMyLanguage('hana').first, (language: 'en', pending: true));
    });
  });
}

/// A fake server that also records each request (method, path, session header, JSON body).
(ApiClient, List<({String route, String? session, Map<String, dynamic> body})>) recordingApi(Map<String, (int, Object)> routes) {
  final calls = <({String route, String? session, Map<String, dynamic> body})>[];
  final api = ApiClient(
    MockClient((r) async {
      final route = '${r.method} ${r.url.path}';
      calls.add((route: route, session: r.headers['X-Staff-Session'], body: r.body.isEmpty ? {} : jsonDecode(r.body) as Map<String, dynamic>));
      final reply = routes[route];
      if (reply == null) return http.Response('{"error":"NOT_FOUND"}', 404);
      return http.Response(jsonEncode(reply.$2), reply.$1, headers: {'content-type': 'application/json'});
    }),
    Uri.parse('http://server'),
  );
  return (api, calls);
}
