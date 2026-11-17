/// Everything that runs while a waiter is signed in (or a kitchen tablet is paired): the
/// connection, the outbox, keeping the local menu and tables current, and applying pushes.
library;

import 'dart:async';

import '../alerts/keep_alive.dart';
import '../alerts/waiter_alerts.dart';
import '../api/api_client.dart';
import '../data/database.dart';
import '../sync/commands.dart';
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
    String? userId,
    AlertOutput? alertOutput,
    KeepAlive? keepAlive,
  }) {
    connection = Connection(connect: connect, db: _db, delay: delay);
    // A round that waited offline: show its final answer on the table screen.
    outbox = Outbox(_db, connection, onAnswer: (key, result) {
      final ok = result['ok'] == true;
      unawaited(_db.setLinesSync(key, ok ? 'sent' : 'needs_attention', error: ok ? null : '${result['error']}'));
    });
    commands = TableCommands(connection);
    // Only a signed-in waiter's tablet rings (a kitchen tablet has no user and no alerts).
    alerts = userId == null || alertOutput == null
        ? null
        : WaiterAlerts(db: _db, myUserId: userId, output: alertOutput, staffName: staffName);
    // Only a waiter's phone needs to stay awake for alerts (a kitchen tablet stays on screen).
    _keepAlive = alerts == null ? null : keepAlive;
  }

  final ApiClient _api;
  final AppDatabase _db;
  final String _deviceToken;
  final Future<void> Function()? _onAccessEnded;
  final DeviceInfo device;
  late final Connection connection;
  late final Outbox outbox;

  /// Actions that need a connection (delivered, cancel, void, close, move, merge, hand over).
  late final TableCommands commands;

  /// The waiter's alerts (null on a kitchen tablet).
  late final WaiterAlerts? alerts;

  final _staff = <String, StaffMember>{};
  final _subscriptions = <StreamSubscription<Object?>>[];
  late final KeepAlive? _keepAlive;
  bool _accessEndedReported = false;

  /// A staff member's name for the floor map (null if unknown, e.g. never downloaded).
  String? staffName(String? id) => id == null ? null : _staff[id]?.name;

  /// Active staff as last downloaded (for hand-over and the manager list of a void).
  List<StaffMember> get staff => List.unmodifiable(_staff.values);

  Future<void> start() async {
    final keepAlive = _keepAlive;
    if (keepAlive != null) {
      _subscriptions.add(alerts!.alerts.listen((a) => unawaited(keepAlive.show(a.text))));
      // Not awaited: the permission questions must not hold up the connection. Best effort:
      // if Android refuses, alerts still work while the app is on screen.
      unawaited(keepAlive.start().catchError((Object _) {}));
    }
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
    alerts?.dispose();
    await _keepAlive?.stop().catchError((Object _) {});
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
        ..addEntries(staff.map((s) => MapEntry(s.id, s)));
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
      case 'event':
        await _db.applyItemEvent((push['event'] as Map).cast<String, dynamic>());
    }
    await alerts?.onPush(push); // after the database: the rules read the item's current table
  }

  Future<void> _accessEnded() async {
    if (_accessEndedReported) return;
    _accessEndedReported = true;
    await _onAccessEnded?.call();
  }
}
