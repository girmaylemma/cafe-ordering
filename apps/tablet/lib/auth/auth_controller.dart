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

/// Signed in with a PIN someone else set (M1a): they choose their own before anything else. The
/// session is NOT saved until then, so closing the app goes back to the PIN screen. [error] is the
/// server's code from the last refused choice (e.g. SAME_PIN).
class MustChangePin extends AuthState {
  const MustChangePin(this.device, this.user, {this.error});
  final DeviceInfo device;
  final StaffMember user;
  final String? error;
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
      final download = await _api.staff(device.token);
      // The PIN screen speaks the café's language (F4b): keep it for the next start too.
      final cafeLanguage = download.language;
      if (cafeLanguage != null) await ref.read(databaseProvider).setCafeLanguage(cafeLanguage);
      return download.staff;
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
      if (result.mustChangePin) {
        // Kept in memory only, for choosePin (the typed PIN is the "current" one).
        _pending = (session: SignedInUser(sessionToken: result.sessionToken, user: result.user), temporaryPin: pin);
        state = AsyncData(MustChangePin(device.info, result.user));
        return;
      }
      await _completeSignIn(device, SignedInUser(sessionToken: result.sessionToken, user: result.user));
    } on ApiException catch (e) {
      // A revoked or unknown tablet must pair again; it can never sign anyone in.
      if (e.code == 'UNAUTHORIZED_DEVICE') return _forgetDevice();
      state = AsyncData(NeedsSignIn(device.info, error: e.code, retryAfter: e.retryAfter));
    } on NetworkException {
      state = AsyncData(NeedsSignIn(device.info, error: 'NETWORK'));
    }
  }

  /// A signed-in session waiting for "choose your own PIN" (M1a). Memory only, never stored.
  ({SignedInUser session, String temporaryPin})? _pending;

  /// The person chooses their own PIN after a temporary one (M1a). Done: signed in as usual.
  Future<void> choosePin(String newPin) async {
    final pending = _pending;
    final device = await _store.loadDevice();
    if (pending == null || device == null) {
      state = AsyncData(device == null ? const Unpaired() : NeedsSignIn(device.info));
      return;
    }
    try {
      await _api.changePin(device.token, pending.session.sessionToken, pending.temporaryPin, newPin);
      _pending = null;
      await _completeSignIn(device, pending.session);
    } on ApiException catch (e) {
      if (e.code == 'UNAUTHORIZED_DEVICE') return _forgetDevice();
      if (e.code == 'SESSION_ENDED' || e.code == 'LOCKED') {
        _pending = null; // start again from the PIN screen
        state = AsyncData(NeedsSignIn(device.info, error: e.code, retryAfter: e.retryAfter));
        return;
      }
      state = AsyncData(MustChangePin(device.info, pending.session.user, error: e.code));
    } on NetworkException {
      state = AsyncData(MustChangePin(device.info, pending.session.user, error: 'NETWORK'));
    }
  }

  /// A signed-in person changes their own PIN (M1a). Returns null when done, else the error code.
  Future<String?> changeMyPin(String currentPin, String newPin) async {
    final device = await _store.loadDevice();
    final session = await _store.loadSession();
    if (device == null || session == null) return 'SESSION_ENDED';
    try {
      await _api.changePin(device.token, session.sessionToken, currentPin, newPin);
      return null;
    } on ApiException catch (e) {
      return e.code;
    } on NetworkException {
      return 'NETWORK';
    }
  }

  /// Save the session and show the person's tables (a plain sign-in, or after choosing a PIN).
  Future<void> _completeSignIn(PairedDevice device, SignedInUser signedIn) async {
    await _store.saveSession(signedIn);
    // The server's copy of their language, unless this tablet still has a newer one to send.
    final db = ref.read(databaseProvider);
    if (!(await db.watchMyLanguage(signedIn.user.id).first).pending) {
      await db.setMyLanguage(signedIn.user.id, signedIn.user.language, pending: false);
    }
    state = AsyncData(SignedIn(device.info, signedIn.user));
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

  /// The live connection was closed by the server (4001 or SESSION_ENDED). That means either
  /// "your PIN session ended" or "this tablet was revoked"; one REST call tells which.
  Future<void> accessEnded() async {
    await _store.clearSession();
    final device = await _store.loadDevice();
    if (device == null) {
      state = const AsyncData(Unpaired());
      return;
    }
    try {
      await _api.staff(device.token);
    } on ApiException catch (e) {
      if (e.status == 401) return _forgetDevice();
    } on NetworkException {
      // can't tell; ask for the PIN again (a revoked tablet will be found at sign-in)
    }
    state = AsyncData(device.info.kind == DeviceKind.station ? StationReady(device.info) : NeedsSignIn(device.info, error: 'SESSION_ENDED'));
  }

  /// Called when the server says this tablet's token is no longer valid (revoked, D-13).
  Future<void> _forgetDevice() async {
    await _store.clearDevice();
    state = const AsyncData(Unpaired(error: 'UNAUTHORIZED_DEVICE'));
  }
}
