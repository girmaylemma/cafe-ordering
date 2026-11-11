import 'dart:convert';

import 'package:cafe_tablet/api/api_client.dart';
import 'package:cafe_tablet/auth/auth_controller.dart';
import 'package:cafe_tablet/auth/credentials.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

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

ProviderContainer container(ApiClient api, MemoryCredentialStore store) {
  final c = ProviderContainer(overrides: [
    apiClientProvider.overrideWithValue(api),
    credentialStoreProvider.overrideWithValue(store),
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
}
