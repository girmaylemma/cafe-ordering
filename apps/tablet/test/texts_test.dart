/// F4a: error texts and station names come from the English and Amharic ARB files. The English
/// sentences are pinned word for word to what the app said before F4a.
library;

import 'package:cafe_tablet/l10n/l10n.dart';
import 'package:cafe_tablet/texts.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

/// Every code's English sentence before F4a (LOCKED and MANAGER_LOCKED with 5 minutes).
const before = <String, String>{
  'INVALID_CODE': 'That code didn\'t work. Check it, or ask the manager for a new one.',
  'RATE_LIMITED': 'Too many wrong codes. Wait a while, or ask the manager.',
  'NETWORK': 'No connection to the server. Check the Wi-Fi.',
  'UNAUTHORIZED_DEVICE': 'This tablet was removed by the manager. Pair it again.',
  'INVALID_CREDENTIALS': 'Wrong PIN. Try again.',
  'LOCKED': 'Locked for 5 minutes after too many wrong PINs.',
  'SESSION_ENDED': 'You were signed out (the manager ended it, or the shift session expired). Sign in again.',
  'TABLE_ALREADY_OPEN': 'Someone else just opened this table.',
  'UNSENT_ROUNDS': 'Some orders have not reached the kitchen yet. Wait for the connection before signing out.',
  'NOT_A_WAITER_DEVICE': 'This is a kitchen tablet: nobody signs in on it.',
  'NEEDS_CONNECTION': 'Needs internet: this cannot wait offline. Try again when the connection is back.',
  'NO_ANSWER': 'No answer from the server. Check the table: it may have worked. If not, try again.',
  'NEEDS_MANAGER_VOID': 'The kitchen already accepted it. Ask a manager to void it.',
  'NOT_ALLOWED_FROM_STATE': 'Not possible any more: the item changed. Look at its state now.',
  'ITEMS_NOT_FINISHED': 'Some items are not finished yet. Mark them delivered, cancelled or voided first.',
  'NOT_YOUR_TABLE': 'This table belongs to another waiter.',
  'SESSION_CLOSED': 'This table was already closed.',
  'SESSION_NOT_FOUND': 'The server does not know this table visit yet. Wait a moment and try again.',
  'TABLE_NOT_FOUND': 'That table no longer exists.',
  'STAFF_NOT_FOUND': 'That waiter is not active any more.',
  'MANAGER_PIN_INVALID': 'Wrong manager PIN. Try again.',
  'MANAGER_APPROVAL_REQUIRED': 'A manager must approve this.',
  'MANAGER_LOCKED': 'Manager PIN locked for 5 minutes after too many wrong tries.',
  'VOID_NEEDS_REASON': 'Write why the item is voided.',
  'UNDO_EXPIRED': 'Too late to undo (more than 10 seconds).',
  'NOTHING_TO_UNDO': 'Nothing to undo on this item any more.',
  'WRONG_STATION': 'This item belongs to another station.',
  'ITEM_NOT_FOUND': 'The server does not know this item.',
  'MENU_ITEM_NOT_FOUND': 'This item is no longer on the menu.',
};

final ethiopic = RegExp(r'[\u1200-\u137F]');
const five = Duration(minutes: 5);

void main() {
  final en = englishTexts();
  final am = lookupAppLocalizations(const Locale('am'));

  test('every error code has the same English sentence as before', () {
    for (final MapEntry(key: code, value: sentence) in before.entries) {
      expect(errorText(en, code, retryAfter: five), sentence, reason: code);
    }
  });

  test('Amharic error texts are Amharic', () {
    for (final code in before.keys) {
      final text = errorText(am, code, retryAfter: five);
      expect(text, isNot(errorText(en, code, retryAfter: five)), reason: code);
      expect(text, contains(ethiopic), reason: code);
    }
  });

  test('the minutes survive translation', () {
    expect(errorText(am, 'LOCKED', retryAfter: five), contains('5'));
    expect(errorText(am, 'MANAGER_LOCKED', retryAfter: five), contains('5'));
  });

  test('an unknown code still gives a sentence with the code, in both languages', () {
    expect(errorText(en, 'WEIRD_CODE'), 'Something went wrong (WEIRD_CODE). Try again.');
    expect(errorText(am, 'WEIRD_CODE'), allOf(contains('WEIRD_CODE'), contains(ethiopic)));
  });

  test('station names', () {
    expect(stationName(en, 'kitchen'), 'Kitchen');
    expect(stationName(en, 'bar'), 'Bar');
    expect(stationName(en, 'pizza'), 'pizza');
    expect(stationName(am, 'kitchen'), contains(ethiopic));
  });
}
