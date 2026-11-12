/// Riverpod wiring for the work session.
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../auth/auth_controller.dart';
import '../config.dart';
import '../data/database.dart';
import '../providers.dart';
import '../sync/connection.dart';
import 'work_session.dart';

/// Which device and which person are active. The work session depends ONLY on this, so a small
/// state change (e.g. "sign-out refused") never restarts the connection.
final _activeKeyProvider = Provider<String?>((ref) {
  final auth = ref.watch(authControllerProvider).value;
  return switch (auth) {
    SignedIn(:final device, :final user) => '${device.id}/${user.id}',
    StationReady(:final device) => device.id,
    _ => null,
  };
});

/// The signed-in waiter or manager (null on a kitchen tablet or before sign-in). Used to decide
/// what to OFFER (e.g. a manager voids without typing a PIN); the server decides what is ALLOWED.
final currentUserProvider = Provider<StaffMember?>((ref) => switch (ref.watch(authControllerProvider).value) {
      SignedIn(:final user) => user,
      _ => null,
    });

final workSessionProvider = FutureProvider<WorkSession?>((ref) async {
  if (ref.watch(_activeKeyProvider) == null) return null;
  final auth = ref.read(authControllerProvider.notifier);
  final device = await auth.device();
  if (device == null) return null;
  final session = device.info.kind == DeviceKind.waiter ? await auth.session() : null;

  final work = WorkSession(
    api: ref.read(apiClientProvider),
    db: ref.read(databaseProvider),
    device: device.info,
    deviceToken: device.token,
    connect: () => connectSocket(Uri.parse(apiBaseUrl), device.token, session?.sessionToken),
    onAccessEnded: auth.accessEnded,
  );
  ref.onDispose(work.stop);
  unawaited(work.start()); // don't wait for the first download: the cached data shows at once
  return work;
});

final linkStateProvider = StreamProvider<LinkState>((ref) async* {
  final work = await ref.watch(workSessionProvider.future);
  if (work == null) return;
  yield work.connection.state;
  yield* work.connection.states;
});

final tablesProvider = StreamProvider<List<CafeTable>>((ref) => ref.watch(databaseProvider).watchTables());

final unsentCountProvider = StreamProvider<int>((ref) => ref.watch(databaseProvider).watchUnsentCount());
