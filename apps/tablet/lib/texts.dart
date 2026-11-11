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
    case 'UNSENT_ROUNDS':
      return 'Some orders have not reached the kitchen yet. Wait for the connection before signing out.';
    case 'NOT_A_WAITER_DEVICE':
      return 'This is a kitchen tablet: nobody signs in on it.';
    default:
      return 'Something went wrong ($code). Try again.';
  }
}
