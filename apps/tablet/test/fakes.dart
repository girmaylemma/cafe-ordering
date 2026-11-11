/// Test doubles for the sync layer: a fake WebSocket and an in-memory database.
library;

import 'dart:async';
import 'dart:convert';

import 'package:cafe_tablet/data/database.dart';
import 'package:cafe_tablet/sync/connection.dart';
import 'package:drift/native.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

AppDatabase memoryDb() => AppDatabase(NativeDatabase.memory());

class FakeSocket implements Socket {
  final _incoming = StreamController<String>();
  final sent = <Map<String, dynamic>>[];
  int? _closeCode;

  @override
  Stream<String> get messages => _incoming.stream;
  @override
  int? get closeCode => _closeCode;

  @override
  void send(String text) => sent.add(jsonDecode(text) as Map<String, dynamic>);

  @override
  Future<void> close() async {
    if (!_incoming.isClosed) await _incoming.close();
  }

  /// The server sends a message.
  void receive(Map<String, dynamic> message) => _incoming.add(jsonEncode(message));

  /// The server (or the network) closes the socket.
  Future<void> drop([int? code]) async {
    _closeCode = code;
    await _incoming.close();
  }

  /// Answer the last command with this result.
  void ackLast(Map<String, dynamic> result) {
    final last = sent.lastWhere((m) => m['type'] != 'sync');
    receive({'type': 'ack', 'idempotencyKey': last['idempotencyKey'] ?? last['orderId'], 'result': result});
  }
}

/// Hands out the given sockets in order; afterwards "connecting" never finishes (stays offline).
class FakeServer {
  FakeServer(List<FakeSocket> sockets) : _sockets = [...sockets];
  final List<FakeSocket> _sockets;
  int connects = 0;
  Object? failNextWith;

  Future<Socket> connect() async {
    connects++;
    final failure = failNextWith;
    if (failure != null) {
      failNextWith = null;
      throw failure;
    }
    if (_sockets.isEmpty) return Completer<Socket>().future;
    return _sockets.removeAt(0);
  }
}

/// Let pending microtasks, stream events and database writes run (several event-loop turns,
/// so tests don't depend on exactly how many steps a write takes).
Future<void> settle() async {
  for (var i = 0; i < 20; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

/// End a widget test that showed database-backed screens: remove the screen, then let drift's
/// tiny clean-up timer for cancelled watch streams run. Otherwise the test framework (rightly)
/// fails with "A Timer is still pending even after the widget tree was disposed".
Future<void> unmountAndFlush(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(milliseconds: 1));
}
