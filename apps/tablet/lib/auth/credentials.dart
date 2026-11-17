/// The device token and the PIN session, stored ENCRYPTED on the tablet (Android Keystore).
///
/// Never stored: PINs (D-10). A token in plain storage could be copied off a lost tablet, which
/// is why this uses flutter_secure_storage, not shared preferences.
library;

import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/api_client.dart';

class PairedDevice {
  const PairedDevice({required this.token, required this.info});
  factory PairedDevice.fromJson(String token, Map<String, dynamic> device) =>
      PairedDevice(token: token, info: DeviceInfo.fromJson(device));
  final String token;
  final DeviceInfo info;
}

class SignedInUser {
  const SignedInUser({required this.sessionToken, required this.user});
  factory SignedInUser.fromJson(Map<String, dynamic> json) => SignedInUser(
        sessionToken: json['sessionToken'] as String,
        user: StaffMember.fromJson(json['user'] as Map<String, dynamic>),
      );
  final String sessionToken;
  final StaffMember user;
  Map<String, dynamic> toJson() => {'sessionToken': sessionToken, 'user': user.toJson()};
}

abstract class CredentialStore {
  Future<PairedDevice?> loadDevice();
  Future<void> saveDevice(PairedDevice device);
  Future<void> clearDevice();
  Future<SignedInUser?> loadSession();
  Future<void> saveSession(SignedInUser session);
  Future<void> clearSession();
}

class SecureCredentialStore implements CredentialStore {
  SecureCredentialStore([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _storage;

  static const _deviceKey = 'device';
  static const _sessionKey = 'session';

  @override
  Future<PairedDevice?> loadDevice() async {
    final raw = await _storage.read(key: _deviceKey);
    if (raw == null) return null;
    final json = jsonDecode(raw) as Map<String, dynamic>;
    return PairedDevice.fromJson(json['token'] as String, json['device'] as Map<String, dynamic>);
  }

  @override
  Future<void> saveDevice(PairedDevice device) =>
      _storage.write(key: _deviceKey, value: jsonEncode({'token': device.token, 'device': device.info.toJson()}));

  @override
  Future<void> clearDevice() async {
    await _storage.delete(key: _deviceKey);
    await _storage.delete(key: _sessionKey); // a session can't outlive its device
  }

  @override
  Future<SignedInUser?> loadSession() async {
    final raw = await _storage.read(key: _sessionKey);
    return raw == null ? null : SignedInUser.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  @override
  Future<void> saveSession(SignedInUser session) => _storage.write(key: _sessionKey, value: jsonEncode(session.toJson()));

  @override
  Future<void> clearSession() => _storage.delete(key: _sessionKey);
}

/// For tests and previews: same behaviour, kept in memory.
class MemoryCredentialStore implements CredentialStore {
  PairedDevice? _device;
  SignedInUser? _session;

  @override
  Future<PairedDevice?> loadDevice() async => _device;
  @override
  Future<void> saveDevice(PairedDevice device) async => _device = device;
  @override
  Future<void> clearDevice() async {
    _device = null;
    _session = null;
  }

  @override
  Future<SignedInUser?> loadSession() async => _session;
  @override
  Future<void> saveSession(SignedInUser session) async => _session = session;
  @override
  Future<void> clearSession() async => _session = null;
}
