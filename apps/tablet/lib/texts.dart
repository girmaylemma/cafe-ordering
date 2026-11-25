/// Sentences for server and connection error codes, and station names, in the user's language
/// (F4a: the texts themselves live in lib/l10n/app_en.arb and app_am.arb).
library;

import 'l10n/l10n.dart';

/// The station's name (kitchen screen title); an unknown station shows its id.
String stationName(AppLocalizations t, String stationId) => switch (stationId) {
      'kitchen' => t.stationKitchen,
      'bar' => t.stationBar,
      _ => stationId,
    };

/// A sentence the waiter or kitchen can act on, for a server or connection error code.
String errorText(AppLocalizations t, String code, {Duration? retryAfter}) {
  final minutes = ((retryAfter?.inSeconds ?? 300) / 60).ceil();
  return switch (code) {
    'INVALID_CODE' => t.errorInvalidCode,
    'RATE_LIMITED' => t.errorRateLimited,
    'NETWORK' => t.errorNetwork,
    'UNAUTHORIZED_DEVICE' => t.errorUnauthorizedDevice,
    'INVALID_CREDENTIALS' => t.errorInvalidCredentials,
    'LOCKED' => t.errorLocked(minutes),
    'SESSION_ENDED' => t.errorSessionEnded,
    'TABLE_ALREADY_OPEN' => t.errorTableAlreadyOpen,
    'UNSENT_ROUNDS' => t.errorUnsentRounds,
    'NOT_A_WAITER_DEVICE' => t.errorNotAWaiterDevice,
    'NEEDS_CONNECTION' => t.errorNeedsConnection,
    'NO_ANSWER' => t.errorNoAnswer,
    'NEEDS_MANAGER_VOID' => t.errorNeedsManagerVoid,
    'NOT_ALLOWED_FROM_STATE' => t.errorNotAllowedFromState,
    'ITEMS_NOT_FINISHED' => t.errorItemsNotFinished,
    'NOT_YOUR_TABLE' => t.errorNotYourTable,
    'SESSION_CLOSED' => t.errorSessionClosed,
    'SESSION_NOT_FOUND' => t.errorSessionNotFound,
    'TABLE_NOT_FOUND' => t.errorTableNotFound,
    'STAFF_NOT_FOUND' => t.errorStaffNotFound,
    'MANAGER_PIN_INVALID' => t.errorManagerPinInvalid,
    'MANAGER_APPROVAL_REQUIRED' => t.errorManagerApprovalRequired,
    'MANAGER_LOCKED' => t.errorManagerLocked(minutes),
    'VOID_NEEDS_REASON' => t.errorVoidNeedsReason,
    'UNDO_EXPIRED' => t.errorUndoExpired,
    'NOTHING_TO_UNDO' => t.errorNothingToUndo,
    'WRONG_STATION' => t.errorWrongStation,
    'ITEM_NOT_FOUND' => t.errorItemNotFound,
    'MENU_ITEM_NOT_FOUND' => t.errorMenuItemNotFound,
    'SAME_PIN' => t.errorSamePin,
    'PIN_CHANGE_REQUIRED' => t.errorPinChangeRequired,
    _ => t.errorUnknown(code),
  };
}
