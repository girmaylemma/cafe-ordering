import 'dart:convert';

import 'package:cafe_tablet/api/api_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// An ApiClient whose "server" answers with [handler]; every request is recorded.
(ApiClient, List<http.Request>) clientWith(Future<http.Response> Function(http.Request) handler) {
  final requests = <http.Request>[];
  final mock = MockClient((r) {
    requests.add(r);
    return handler(r);
  });
  return (ApiClient(mock, Uri.parse('http://server:8787')), requests);
}

http.Response jsonResponse(int status, Object body) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  group('pair', () {
    test('sends the code and returns the device token and details', () async {
      final (api, requests) = clientWith((_) async => jsonResponse(200, {
            'token': 'v-1.tag.secret',
            'device': {'id': 'd1', 'name': 'Tab 1', 'kind': 'waiter', 'stationId': null},
          }));

      final paired = await api.pair('482913');

      expect(paired.token, 'v-1.tag.secret');
      expect(paired.device.kind, DeviceKind.waiter);
      expect(requests.single.url.path, '/devices/pair');
      expect(jsonDecode(requests.single.body), {'code': '482913'});
      expect(requests.single.headers['content-type'], startsWith('application/json'));
    });

    test('a wrong or used code is an ApiException with the server code', () async {
      final (api, _) = clientWith((_) async => jsonResponse(401, {'error': 'INVALID_CODE'}));
      expect(() => api.pair('000000'), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'INVALID_CODE')));
    });

    test('too many tries is RATE_LIMITED', () async {
      final (api, _) = clientWith((_) async => jsonResponse(429, {'error': 'RATE_LIMITED'}));
      expect(() => api.pair('000000'), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'RATE_LIMITED')));
    });

    test('no connection is a NetworkException, not a crash', () async {
      final (api, _) = clientWith((_) async => throw http.ClientException('no route'));
      expect(() => api.pair('123456'), throwsA(isA<NetworkException>()));
    });
  });

  group('staff and sign-in', () {
    test('lists staff with the device token in the Authorization header', () async {
      final (api, requests) = clientWith((_) async => jsonResponse(200, {
            'staff': [
              {'id': 'hana', 'name': 'Hana', 'role': 'waiter'},
            ],
          }));

      final staff = await api.staff('tok');

      expect(staff.single.name, 'Hana');
      expect(requests.single.headers['authorization'], 'Bearer tok');
    });

    test('a correct PIN returns the session', () async {
      final (api, requests) = clientWith((_) async => jsonResponse(200, {
            'sessionToken': 'sess',
            'user': {'id': 'hana', 'name': 'Hana', 'role': 'waiter'},
            'expiresAt': 1,
          }));

      final session = await api.signIn('tok', 'hana', '1234');

      expect(session.sessionToken, 'sess');
      expect(session.user.name, 'Hana');
      expect(jsonDecode(requests.single.body), {'userId': 'hana', 'pin': '1234'});
    });

    test('a locked user tells how long to wait', () async {
      final (api, _) = clientWith((_) async => jsonResponse(423, {'error': 'LOCKED', 'retryAfterMs': 240000}));
      expect(
        () => api.signIn('tok', 'hana', '1234'),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'LOCKED').having((e) => e.retryAfter, 'retryAfter', const Duration(minutes: 4))),
      );
    });

    test('sign-out sends both tokens', () async {
      final (api, requests) = clientWith((_) async => http.Response('', 204));
      await api.signOut('tok', 'sess');
      expect(requests.single.headers['authorization'], 'Bearer tok');
      expect(requests.single.headers['x-staff-session'], 'sess');
    });
  });
}
