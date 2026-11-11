/// Everything that runs while a waiter is signed in (or a kitchen tablet is paired): the
/// connection, the outbox, keeping the local menu and tables current, and applying pushes.
library;

import 'dart:async';

import '../api/api_client.dart';
import '../data/database.dart';
import '../sync/connection.dart';
import '../sync/outbox.dart';

class WorkSession {
  WorkSession({
    required this._api,
    required this._db,
    required this.device,
    required this._deviceToken,
    required SocketConnector connect,
    Future<void> Function(Duration)? delay,
    this._onAccessEnded,
  }) {
    connection = Connection(connect: connect, db: _db, delay: delay);
    outbox = Outbox(_db, connection);
  }

  final ApiClient _api;
  final AppDatabase _db;
  final String _deviceToken;
  final Future<void> Function()? _onAccessEnded;
  final DeviceInfo device;
  late final Connection connection;
  late final Outbox outbox;

  final _staff = <String, String>{};
  final _subscriptions = <StreamSubscription<Object?>>[];
  bool _accessEndedReported = false;

  /// A staff member's name for the floor map (null if unknown, e.g. never downloaded).
  String? staffName(String? id) => id == null ? null : _staff[id];

  Future<void> start() async {
    _subscriptions
      ..add(connection.pushes.listen(_onPush))
      ..add(connection.states.listen((state) {
        // Table states are not part of event catch-up: download them again on every reconnect.
        if (state == LinkState.online) unawaited(refresh());
        if (state == LinkState.signedOut) unawaited(_accessEnded());
      }));
    outbox.start();
    connection.start();
    await refresh(); // offline: fails quietly and the last downloaded data stays
  }

  Future<void> stop() async {
    for (final s in _subscriptions) {
      await s.cancel();
    }
    _subscriptions.clear();
    await outbox.stop();
    await connection.stop();
  }

  /// Download the menu, tables and staff names. Never deletes data when offline.
  Future<void> refresh() async {
    try {
      final menu = await _api.menu(_deviceToken);
      final tables = await _api.tables(_deviceToken);
      final staff = await _api.staff(_deviceToken);
      await _db.replaceMenu(menu);
      await _db.replaceTables(tables['tables'] as List);
      _staff
        ..clear()
        ..addEntries(staff.map((s) => MapEntry(s.id, s.name)));
    } on NetworkException {
      // keep what we have; we'll try again when the connection is back
    } on ApiException catch (e) {
      if (e.status == 401) await _accessEnded();
    }
  }

  Future<void> _onPush(Map<String, dynamic> push) async {
    switch (push['type']) {
      case 'table.state':
        await _db.setTableState(push['tableId'] as String, push['state'] as String, push['sessionId'] as String?, push['waiterId'] as String?);
      case 'menu.sold_out':
        await _db.setSoldOut(push['menuItemId'] as String, push['soldOut'] as bool);
      case 'reload':
        await refresh();
    }
  }

  Future<void> _accessEnded() async {
    if (_accessEndedReported) return;
    _accessEndedReported = true;
    await _onAccessEnded?.call();
  }
}
