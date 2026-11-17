/// Everything that runs while a waiter is signed in (or a kitchen tablet is paired): the
/// connection, the outbox, keeping the local menu and tables current, and applying pushes.
library;

import 'dart:async';

import '../alerts/keep_alive.dart';
import '../alerts/kitchen_alerts.dart';
import '../alerts/waiter_alerts.dart';
import '../api/api_client.dart';
import '../data/database.dart';
import '../sync/commands.dart';
import '../sync/connection.dart';
import '../sync/outbox.dart';
import '../sync/server_clock.dart';

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
    ServerClock? clock,
  }) : clock = clock ?? ServerClock() {
    connection = Connection(connect: connect, db: _db, delay: delay);
    // A round that waited offline: show its final answer on the table screen.
    outbox = Outbox(_db, connection, onAnswer: (key, result) {
      final ok = result['ok'] == true;
      unawaited(_db.setLinesSync(key, ok ? 'sent' : 'needs_attention', error: ok ? null : '${result['error']}'));
    });
    commands = TableCommands(connection);
    stationCommands = StationCommands(connection);
    // A signed-in waiter's tablet rings by the waiter rules, a kitchen tablet by the kitchen ones.
    alerts = userId == null || alertOutput == null
        ? null
        : WaiterAlerts(db: _db, myUserId: userId, output: alertOutput, staffName: staffName);
    kitchenAlerts = device.kind != DeviceKind.station || alertOutput == null ? null : KitchenAlerts(db: _db, output: alertOutput);
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

  /// A kitchen or bar tablet's taps: accept, ready, undo (F3a).
  late final StationCommands stationCommands;

  /// The waiter's alerts (null on a kitchen tablet).
  late final WaiterAlerts? alerts;

  /// New-ticket and void alerts (only on a kitchen or bar tablet, F3b).
  late final KitchenAlerts? kitchenAlerts;

  /// The server's time, learned on every catch-up: ticket timers use it (K-04).
  final ServerClock clock;

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
    kitchenAlerts?.dispose();
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
        if (device.kind == DeviceKind.station) await _reloadTickets();
      case 'synced':
        clock.learn(push['serverNow'] as int?);
      case 'event':
        final event = (push['event'] as Map).cast<String, dynamic>();
        // A kitchen tablet keeps tickets; a waiter's tablet keeps the lines of its tables.
        await (device.kind == DeviceKind.station ? _db.applyTicketEvent(event) : _db.applyItemEvent(event));
    }
    // After the database: the rules read the item's current table, or which tickets are open.
    await alerts?.onPush(push);
    await kitchenAlerts?.onPush(push);
  }

  /// Too much was missed to replay (more than the server's catch-up limit): download the open
  /// tickets instead, then continue catch-up from the download's seq, so anything that happened
  /// while the download travelled is replayed (events are safe to apply twice).
  Future<void> _reloadTickets() async {
    final Map<String, dynamic> download;
    try {
      download = await _api.tickets(_deviceToken);
    } on NetworkException {
      return; // the next reconnect asks again (seq was not advanced)
    } on ApiException catch (e) {
      if (e.status == 401) await _accessEnded();
      return;
    }
    final fresh = await _db.replaceTickets((download['tickets'] as List).cast<Map<String, dynamic>>());
    await _db.setLastSeq(download['seq'] as int); // may go back: what came after it is replayed
    if (fresh.isNotEmpty) kitchenAlerts?.newTicketsDownloaded();
    await connection.resync();
  }

  Future<void> _accessEnded() async {
    if (_accessEndedReported) return;
    _accessEndedReported = true;
    await _onAccessEnded?.call();
  }
}
