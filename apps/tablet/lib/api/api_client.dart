/// REST calls to the server (server/src/index.ts). Live commands go over the WebSocket (F1b).
library;

import 'dart:convert';

import 'package:http/http.dart' as http;

enum DeviceKind { waiter, station }

class DeviceInfo {
  const DeviceInfo({required this.id, required this.name, required this.kind, required this.stationId});

  factory DeviceInfo.fromJson(Map<String, dynamic> json) => DeviceInfo(
        id: json['id'] as String,
        name: json['name'] as String,
        kind: json['kind'] == 'station' ? DeviceKind.station : DeviceKind.waiter,
        stationId: json['stationId'] as String?,
      );

  final String id;
  final String name;
  final DeviceKind kind;

  /// "kitchen" or "bar" for station tablets; null for waiter tablets.
  final String? stationId;

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'kind': kind.name, 'stationId': stationId};
}

class PairResult {
  const PairResult(this.token, this.device);
  final String token;
  final DeviceInfo device;
}

class StaffMember {
  const StaffMember({required this.id, required this.name, required this.role});
  factory StaffMember.fromJson(Map<String, dynamic> json) =>
      StaffMember(id: json['id'] as String, name: json['name'] as String, role: json['role'] as String);
  final String id;
  final String name;
  final String role;
  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'role': role};
}

class SessionResult {
  const SessionResult({required this.sessionToken, required this.user});
  final String sessionToken;
  final StaffMember user;
}

/// The server answered with an error code (e.g. INVALID_CODE, LOCKED, UNAUTHORIZED_DEVICE).
class ApiException implements Exception {
  const ApiException(this.status, this.code, {this.retryAfter});
  final int status;
  final String code;

  /// For LOCKED: how long until the PIN can be tried again.
  final Duration? retryAfter;

  @override
  String toString() => 'ApiException($status, $code)';
}

/// The server could not be reached (no Wi-Fi, server down). The app shows "no connection".
class NetworkException implements Exception {
  const NetworkException(this.message);
  final String message;
  @override
  String toString() => 'NetworkException($message)';
}

class ApiClient {
  ApiClient(this._http, this._base);

  final http.Client _http;
  final Uri _base;

  Future<PairResult> pair(String code) async {
    final json = await _send('POST', '/devices/pair', body: {'code': code});
    return PairResult(json['token'] as String, DeviceInfo.fromJson(json['device'] as Map<String, dynamic>));
  }

  Future<List<StaffMember>> staff(String deviceToken) async {
    final json = await _send('GET', '/staff', deviceToken: deviceToken);
    return (json['staff'] as List).map((s) => StaffMember.fromJson(s as Map<String, dynamic>)).toList();
  }

  /// PIN sign-in, checked only by the server (D-10).
  Future<SessionResult> signIn(String deviceToken, String userId, String pin) async {
    final json = await _send('POST', '/auth/pin', deviceToken: deviceToken, body: {'userId': userId, 'pin': pin});
    return SessionResult(
      sessionToken: json['sessionToken'] as String,
      user: StaffMember.fromJson(json['user'] as Map<String, dynamic>),
    );
  }

  Future<void> signOut(String deviceToken, String sessionToken) async {
    await _send('POST', '/auth/sign-out', deviceToken: deviceToken, sessionToken: sessionToken, body: const {});
  }

  Future<Map<String, dynamic>> menu(String deviceToken) => _send('GET', '/menu', deviceToken: deviceToken);

  Future<Map<String, dynamic>> tables(String deviceToken) => _send('GET', '/tables', deviceToken: deviceToken);

  Future<Map<String, dynamic>> _send(
    String method,
    String path, {
    String? deviceToken,
    String? sessionToken,
    Map<String, Object?>? body,
  }) async {
    final request = http.Request(method, _base.resolve(path));
    if (deviceToken != null) request.headers['Authorization'] = 'Bearer $deviceToken';
    if (sessionToken != null) request.headers['X-Staff-Session'] = sessionToken;
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }

    final http.Response response;
    try {
      response = await http.Response.fromStream(await _http.send(request)).timeout(const Duration(seconds: 15));
    } on http.ClientException catch (e) {
      throw NetworkException(e.message);
    } on Exception catch (e) {
      throw NetworkException(e.toString());
    }

    final decoded = response.body.isEmpty ? <String, dynamic>{} : _decode(response.body);
    if (response.statusCode >= 200 && response.statusCode < 300) return decoded;
    final retryMs = decoded['retryAfterMs'];
    throw ApiException(
      response.statusCode,
      decoded['error'] is String ? decoded['error'] as String : 'HTTP_${response.statusCode}',
      retryAfter: retryMs is int ? Duration(milliseconds: retryMs) : null,
    );
  }

  Map<String, dynamic> _decode(String text) {
    try {
      final value = jsonDecode(text);
      return value is Map<String, dynamic> ? value : <String, dynamic>{};
    } on FormatException {
      return <String, dynamic>{};
    }
  }
}
