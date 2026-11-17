/// Waiter actions that need a live connection (D-18): item taps (delivered, cancel, void) and
/// table actions (close, move, merge, hand over).
///
/// They are NEVER queued: a cancel kept offline could arrive after the kitchen accepted the item,
/// and the waiter would believe it was cancelled. Failing at tap time ("Needs internet") is honest.
library;

import 'dart:async';

import '../ids.dart';
import 'connection.dart';

/// A manager's PIN typed on this tablet to approve a void (D-57). Sent once, never stored.
class ManagerApproval {
  const ManagerApproval({required this.managerId, required this.managerPin});
  final String managerId;
  final String managerPin;
}

/// What the screen shows after an action: done, or an error code for [errorText].
class ActionResult {
  const ActionResult.done()
      : error = null,
        retryAfter = null;
  const ActionResult.failed(String this.error, {this.retryAfter});

  /// A server refusal (e.g. ITEMS_NOT_FINISHED), NEEDS_CONNECTION (nothing was sent), or
  /// NO_ANSWER (sent, but the connection dropped: it may have happened; the screen updates
  /// from the server's event if it did).
  final String? error;
  final Duration? retryAfter;
  bool get ok => error == null;
}

class TableCommands {
  TableCommands(this._connection);
  final Connection _connection;

  Future<ActionResult> delivered(String itemId) => _item(itemId, {'type': 'delivered'});
  Future<ActionResult> cancel(String itemId) => _item(itemId, {'type': 'cancel'});

  /// No [approval] means the signed-in user approves it themselves (managers and owners only:
  /// the server checks the role, never this tablet).
  Future<ActionResult> voidItem(String itemId, {required String reason, ManagerApproval? approval}) => _item(itemId, {
        'type': 'void',
        'reason': reason,
        if (approval != null) ...{'managerId': approval.managerId, 'managerPin': approval.managerPin},
      });

  Future<ActionResult> close(String sessionId) => _send({'type': 'session.close', 'sessionId': sessionId});
  Future<ActionResult> move(String sessionId, {required String toTableId}) =>
      _send({'type': 'session.move', 'sessionId': sessionId, 'toTableId': toTableId});
  Future<ActionResult> merge(String sessionId, {required String intoSessionId}) =>
      _send({'type': 'session.merge', 'sessionId': sessionId, 'intoSessionId': intoSessionId});
  Future<ActionResult> handOver(String sessionId, {required String toWaiterId}) =>
      _send({'type': 'session.transfer', 'sessionId': sessionId, 'toWaiterId': toWaiterId});

  Future<ActionResult> _item(String itemId, Map<String, dynamic> command) =>
      _send({'type': 'item.command', 'itemId': itemId, 'command': command});

  /// One tap = one new idempotency key, so a double tap is answered "already done" (D-35).
  Future<ActionResult> _send(Map<String, dynamic> message) async {
    final Map<String, dynamic> result;
    try {
      result = await _connection.send({...message, 'idempotencyKey': newId()});
    } on NotConnected {
      return const ActionResult.failed('NEEDS_CONNECTION');
    } on ConnectionLost {
      return const ActionResult.failed('NO_ANSWER');
    } on TimeoutException {
      return const ActionResult.failed('NO_ANSWER');
    }
    if (result['ok'] == true) return const ActionResult.done();
    final wait = result['retryAfterMs'];
    return ActionResult.failed('${result['error']}', retryAfter: wait is int ? Duration(milliseconds: wait) : null);
  }
}
