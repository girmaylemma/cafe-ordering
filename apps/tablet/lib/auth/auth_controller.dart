/// Who is using this tablet: unpaired → paired (station ready, or waiter needs a PIN) → signed in.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../api/api_client.dart';
import '../config.dart';
import '../providers.dart';
import 'credentials.dart';

// ---------- states ----------

sealed class AuthState {
  const AuthState();
}

/// Not paired yet. [error] is the server's code from the last failed attempt (e.g. INVALID_CODE).
class Unpaired extends AuthState {
  const Unpaired({this.error});
  final String? error;
}

/// A kitchen/bar tablet: no PIN, it acts as its station (D-25).
class StationReady extends AuthState {
  const StationReady(this.device);
  final DeviceInfo device;
}

/// A waiter tablet with nobody signed in. [error] and [retryAfter] come from the last PIN attempt.
class NeedsSignIn extends AuthState {
  const NeedsSignIn(this.device, {this.error, this.retryAfter});
  final DeviceInfo device;
  final String? error;
  final Duration? retryAfter;
}

class SignedIn extends AuthState {
  const SignedIn(this.device, this.user, {this.error});
  final DeviceInfo device;
  final StaffMember user;

  /// Why the last sign-out was refused (UNSENT_ROUNDS), if it was.
  final String? error;
}

// ---------- dependencies (overridden in tests) ----------

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(http.Client(), Uri.parse(apiBaseUrl)));
final credentialStoreProvider = Provider<CredentialStore>((ref) => SecureCredentialStore());

final authControllerProvider = AsyncNotifierProvider<AuthController, AuthState>(AuthController.new);

class AuthController extends AsyncNotifier<AuthState> {
  CredentialStore get _store => ref.read(credentialStoreProvider);
  ApiClient get _api => ref.read(apiClientProvider);

  @override
  Future<AuthState> build() async {
    final device = await _store.loadDevice();
    if (device == null) return const Unpaired();
    if (device.info.kind == DeviceKind.station) return StationReady(device.info);
    final session = await _store.loadSession();
    return session == null ? NeedsSignIn(device.info) : SignedIn(device.info, session.user);
  }

  /// The device and session tokens, for the connection layer.
  Future<PairedDevice?> device() => _store.loadDevice();
  Future<SignedInUser?> session() => _store.loadSession();

  Future<void> pair(String code) async {
    try {
      final paired = await _api.pair(code.trim());
      await _store.saveDevice(PairedDevice(token: paired.token, info: paired.device));
      state = AsyncData(paired.device.kind == DeviceKind.station ? StationReady(paired.device) : NeedsSignIn(paired.device));
    } on ApiException catch (e) {
      state = AsyncData(Unpaired(error: e.code));
    } on NetworkException {
      state = const AsyncData(Unpaired(error: 'NETWORK'));
    }
  }

  Future<List<StaffMember>> staff() async {
    final device = await _store.loadDevice();
    if (device == null) return const [];
    try {
      return await _api.staff(device.token);
    } on ApiException catch (e) {
      if (e.status == 401) await _forgetDevice();
      rethrow;
    }
  }

  Future<void> signIn(String userId, String pin) async {
    final device = await _store.loadDevice();
    if (device == null) {
      state = const AsyncData(Unpaired());
      return;
    }
    try {
      final result = await _api.signIn(device.token, userId, pin);
      await _store.saveSession(SignedInUser(sessionToken: result.sessionToken, user: result.user));
      state = AsyncData(SignedIn(device.info, result.user));
    } on ApiException catch (e) {
      // A revoked or unknown tablet must pair again; it can never sign anyone in.
      if (e.code == 'UNAUTHORIZED_DEVICE') return _forgetDevice();
      state = AsyncData(NeedsSignIn(device.info, error: e.code, retryAfter: e.retryAfter));
    } on NetworkException {
      state = AsyncData(NeedsSignIn(device.info, error: 'NETWORK'));
    }
  }

  /// Ends the PIN session; the tablet stays paired. The server is told when reachable.
  /// Refused while rounds wait to be sent: they exist only on this tablet (D-20).
  Future<void> signOut() async {
    final device = await _store.loadDevice();
    final session = await _store.loadSession();
    if (device != null && session != null && await ref.read(databaseProvider).watchUnsentCount().first > 0) {
      state = AsyncData(SignedIn(device.info, session.user, error: 'UNSENT_ROUNDS'));
      return;
    }
    if (device != null && session != null) {
      try {
        await _api.signOut(device.token, session.sessionToken);
      } on Exception {
        // Offline: the session still ends here; it expires on the server later (D-53).
      }
    }
    await _store.clearSession();
    state = device == null ? const AsyncData(Unpaired()) : AsyncData(NeedsSignIn(device.info));
  }

  /// Called when the server says this tablet's token is no longer valid (revoked, D-13).
  Future<void> _forgetDevice() async {
    await _store.clearDevice();
    state = const AsyncData(Unpaired(error: 'UNAUTHORIZED_DEVICE'));
  }
}
