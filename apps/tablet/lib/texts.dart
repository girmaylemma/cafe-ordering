/// Every text the app shows, in one place, so Amharic can be added in F4 without touching screens.
library;

const stationNames = {'kitchen': 'Kitchen', 'bar': 'Bar'};

/// A sentence the waiter or kitchen can act on, for a server or connection error code.
String errorText(String code, {Duration? retryAfter}) {
  switch (code) {
    case 'INVALID_CODE':
      return "That code didn't work. Check it, or ask the manager for a new one.";
    case 'RATE_LIMITED':
      return 'Too many wrong codes. Wait a while, or ask the manager.';
    case 'NETWORK':
      return 'No connection to the server. Check the Wi-Fi.';
    case 'UNAUTHORIZED_DEVICE':
      return 'This tablet was removed by the manager. Pair it again.';
    case 'INVALID_CREDENTIALS':
      return 'Wrong PIN. Try again.';
    case 'LOCKED':
      final minutes = ((retryAfter?.inSeconds ?? 300) / 60).ceil();
      return 'Locked for $minutes minutes after too many wrong PINs.';
    case 'SESSION_ENDED':
      return 'You were signed out (the manager ended it, or the shift session expired). Sign in again.';
    case 'TABLE_ALREADY_OPEN':
      return 'Someone else just opened this table.';
    case 'UNSENT_ROUNDS':
      return 'Some orders have not reached the kitchen yet. Wait for the connection before signing out.';
    case 'NOT_A_WAITER_DEVICE':
      return 'This is a kitchen tablet: nobody signs in on it.';
    // ---------- waiter actions (F2c) ----------
    case 'NEEDS_CONNECTION':
      return 'Needs internet: this cannot wait offline. Try again when the connection is back.';
    case 'NO_ANSWER':
      return 'No answer from the server. Check the table: it may have worked. If not, try again.';
    case 'NEEDS_MANAGER_VOID':
      return 'The kitchen already accepted it. Ask a manager to void it.';
    case 'NOT_ALLOWED_FROM_STATE':
      return 'Not possible any more: the item changed. Look at its state now.';
    case 'ITEMS_NOT_FINISHED':
      return 'Some items are not finished yet. Mark them delivered, cancelled or voided first.';
    case 'NOT_YOUR_TABLE':
      return 'This table belongs to another waiter.';
    case 'SESSION_CLOSED':
      return 'This table was already closed.';
    case 'SESSION_NOT_FOUND':
      return 'The server does not know this table visit yet. Wait a moment and try again.';
    case 'TABLE_NOT_FOUND':
      return 'That table no longer exists.';
    case 'STAFF_NOT_FOUND':
      return 'That waiter is not active any more.';
    case 'MANAGER_PIN_INVALID':
      return 'Wrong manager PIN. Try again.';
    case 'MANAGER_APPROVAL_REQUIRED':
      return 'A manager must approve this.';
    case 'MANAGER_LOCKED':
      final minutes = ((retryAfter?.inSeconds ?? 300) / 60).ceil();
      return 'Manager PIN locked for $minutes minutes after too many wrong tries.';
    case 'VOID_NEEDS_REASON':
      return 'Write why the item is voided.';
    default:
      return 'Something went wrong ($code). Try again.';
  }
}
