/// The tablet's one WebSocket to its café (server/src/cafe/CafeDO.ts).
///
/// - On every (re)connect it asks for everything after the last seen event `seq` (D-42).
/// - Answers are matched to commands by idempotency key, never by "the next message": pushes can
///   arrive in between (a lesson from the server tests).
/// - After a drop it reconnects with a growing wait: 1, 2, 4 ... seconds, at most 30.
/// - Close code 4001 or SESSION_ENDED means access ended (revoked, signed out): no reconnect.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io' show WebSocketException;
import 'dart:math' as math;

import 'package:web_socket_channel/io.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../data/database.dart';

/// The small part of a WebSocket the connection needs (a fake one is used in tests).
abstract class Socket {
  Stream<String> get messages;
  void send(String text);
  Future<void> close();

  /// Set once the socket closed; 4001 means "access ended" (server CLOSE_AUTH_ENDED).
  int? get closeCode;
}

typedef SocketConnector = Future<Socket> Function();

/// The server refused the connection's credentials (HTTP 401 on the upgrade).
class AuthRejected implements Exception {
  const AuthRejected();
}

/// The connection attempt failed for another reason (no Wi-Fi, server down).
class SocketFailure implements Exception {
  const SocketFailure(this.message);
  final String message;
  @override
  String toString() => 'SocketFailure($message)';
}

/// A command was sent but the connection dropped before its answer: it may or may not have
/// been applied. Resending the SAME message is safe (idempotency key).
class ConnectionLost implements Exception {
  const ConnectionLost();
}

/// Nothing was sent: there is no connection right now.
class NotConnected implements Exception {
  const NotConnected();
}

enum LinkState { offline, connecting, online, signedOut }

const closeAuthEnded = 4001;

class Connection {
  Connection({
    required this._connect,
    required this._db,
    Future<void> Function(Duration)? delay,
    this.ackTimeout = const Duration(seconds: 10),
  }) : _delay = delay ?? Future<void>.delayed;

  final SocketConnector _connect;
  final AppDatabase _db;
  final Future<void> Function(Duration) _delay;
  final Duration ackTimeout;

  final _states = StreamController<LinkState>.broadcast();
  final _pushes = StreamController<Map<String, dynamic>>.broadcast();
  final _waiting = <String, Completer<Map<String, dynamic>>>{};

  LinkState _state = LinkState.offline;
  Socket? _socket;
  StreamSubscription<String>? _subscription;
  Completer<void>? _closed;
  Future<void> _inbox = Future.value();
  bool _running = false;
  int _failures = 0;

  LinkState get state => _state;
  Stream<LinkState> get states => _states.stream;

  /// Everything the server pushes: item events ({type: event}), table.state, menu.sold_out,
  /// table.transferred, and {type: reload} when catch-up was too long (download everything again).
  /// Events from catch-up carry `replay: true`: they are history (no alerts for them).
  Stream<Map<String, dynamic>> get pushes => _pushes.stream;

  void start() {
    if (_running) return;
    _running = true;
    unawaited(_loop());
  }

  Future<void> stop() async {
    _running = false;
    await _subscription?.cancel();
    await _socket?.close();
    _socket = null;
    _failWaiting();
    if (_closed != null && !_closed!.isCompleted) _closed!.complete();
  }

  /// Send a command and wait for its answer (the `result` of the ack).
  Future<Map<String, dynamic>> send(Map<String, dynamic> message) {
    final socket = _socket;
    if (_state != LinkState.online || socket == null) return Future.error(const NotConnected());
    final key = (message['idempotencyKey'] ?? message['orderId']) as String;
    final answer = Completer<Map<String, dynamic>>();
    _waiting[key] = answer;
    socket.send(jsonEncode(message));
    return answer.future.timeout(ackTimeout, onTimeout: () {
      _waiting.remove(key);
      throw TimeoutException('no answer for $key');
    });
  }

  Future<void> _loop() async {
    while (_running && _state != LinkState.signedOut) {
      _set(LinkState.connecting);
      try {
        final socket = await _connect();
        if (!_running) {
          await socket.close();
          return;
        }
        _failures = 0;
        _socket = socket;
        _closed = Completer<void>();
        final closed = _closed!;
        _subscription = socket.messages.listen(
          (text) => _inbox = _inbox.then((_) => _handle(text)),
          onDone: () => closed.isCompleted ? null : closed.complete(),
          onError: (_) => closed.isCompleted ? null : closed.complete(),
        );
        _set(LinkState.online);
        socket.send(jsonEncode({'type': 'sync', 'since': await _db.lastSeq()}));
        await closed.future;

        _socket = null;
        _failWaiting();
        if (socket.closeCode == closeAuthEnded) _set(LinkState.signedOut);
        if (_state == LinkState.signedOut || !_running) return;
        _set(LinkState.offline);
      } on AuthRejected {
        _set(LinkState.signedOut);
        return;
      } on Object {
        _set(LinkState.offline);
      }
      if (!_running) return;
      await _delay(_nextWait());
    }
  }

  /// 1, 2, 4, 8, 16, then 30 seconds; back to 1 after a successful connection.
  Duration _nextWait() {
    final seconds = math.min(30, 1 << _failures);
    _failures = math.min(_failures + 1, 10);
    return Duration(seconds: seconds);
  }

  Future<void> _handle(String text) async {
    final Map<String, dynamic> message;
    try {
      message = jsonDecode(text) as Map<String, dynamic>;
    } on Object {
      return; // not ours; ignore
    }
    switch (message['type']) {
      case 'ack':
        _waiting.remove(message['idempotencyKey'])?.complete((message['result'] as Map).cast<String, dynamic>());
      case 'event':
        await _advance((message['event'] as Map)['seq'] as int);
        _pushes.add(message);
      case 'sync.result':
        for (final event in (message['events'] as List).cast<Map<String, dynamic>>()) {
          await _advance(event['seq'] as int);
          _pushes.add({'type': 'event', 'event': event, 'replay': true});
        }
        if (message['reloadRequired'] == true) _pushes.add(const {'type': 'reload'});
      case 'error' when message['error'] == 'SESSION_ENDED':
        _set(LinkState.signedOut);
        await _socket?.close();
      default:
        _pushes.add(message);
    }
  }

  Future<void> _advance(int seq) async {
    if (seq > await _db.lastSeq()) await _db.setLastSeq(seq);
  }

  void _failWaiting() {
    for (final answer in _waiting.values) {
      if (!answer.isCompleted) answer.completeError(const ConnectionLost());
    }
    _waiting.clear();
  }

  void _set(LinkState state) {
    if (_state == state) return;
    _state = state;
    _states.add(state);
  }
}

// ---------- the real socket ----------

class _IoSocket implements Socket {
  _IoSocket(this._channel);
  final WebSocketChannel _channel;
  @override
  Stream<String> get messages => _channel.stream.map((data) => data is String ? data : utf8.decode(data as List<int>));
  @override
  void send(String text) => _channel.sink.add(text);
  @override
  Future<void> close() async => _channel.sink.close();
  @override
  int? get closeCode => _channel.closeCode;
}

/// Connect to `<api>/ws` with the device token (and PIN session for waiters, D-54).
Future<Socket> connectSocket(Uri apiBase, String deviceToken, String? sessionToken) async {
  final uri = apiBase.replace(scheme: apiBase.scheme == 'https' ? 'wss' : 'ws', path: '/ws');
  final channel = IOWebSocketChannel.connect(
    uri,
    headers: {'Authorization': 'Bearer $deviceToken', 'X-Staff-Session': ?sessionToken},
    pingInterval: const Duration(seconds: 25), // answered by the server without waking it
  );
  try {
    await channel.ready;
  } on Object catch (e) {
    // The upgrade's HTTP status only appears in the error text (e.g. "status code: 401").
    final inner = e is WebSocketChannelException ? e.inner : e;
    final text = inner is WebSocketException ? inner.message : inner.toString();
    if (RegExp(r'status code:? 401').hasMatch(text)) throw const AuthRejected();
    throw SocketFailure(text);
  }
  return _IoSocket(channel);
}
