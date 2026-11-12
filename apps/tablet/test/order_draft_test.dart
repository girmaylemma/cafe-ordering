import 'package:cafe_tablet/ordering/order_draft.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

const shiro = DraftItem(menuItemId: 'shiro', nameEn: 'Shiro', nameAm: 'ሽሮ', priceSantim: 18000, stationId: 'kitchen');
const mac = DraftItem(menuItemId: 'mac', nameEn: 'Macchiato', nameAm: null, priceSantim: 4000, stationId: 'bar');
const large = DraftOption(id: 'o-large', groupId: 'g-size', nameEn: 'Large', extraSantim: 1500);
const honey = DraftOption(id: 'o-honey', groupId: 'g-extra', nameEn: 'Honey', extraSantim: 500);

void main() {
  test('the same item tapped again (no options, no note) adds to its line', () {
    final draft = OrderDraft()
      ..add(shiro)
      ..add(shiro);
    expect(draft.lines.single.qty, 2);
  });

  test('different options or a note make a separate line', () {
    final draft = OrderDraft()
      ..add(mac)
      ..add(mac, options: const [large])
      ..add(mac, note: 'extra hot');
    expect(draft.lines.map((l) => (l.qty, l.optionsText, l.note)), [(1, null, null), (1, 'Large', null), (1, null, 'extra hot')]);
  });

  test('plus, minus and remove; minus at 1 removes; undo brings the line back', () {
    final draft = OrderDraft()..add(shiro);
    final key = draft.lines.single.key;
    draft.increment(key);
    expect(draft.lines.single.qty, 2);
    draft.decrement(key);
    draft.decrement(key);
    expect(draft.lines, isEmpty);

    draft.undoRemove();
    expect(draft.lines.single.qty, 1);
  });

  test('the display total includes option extras times quantity', () {
    final draft = OrderDraft()
      ..add(shiro) // 180.00
      ..add(mac, options: const [large, honey]); // 40 + 15 + 5 = 60.00
    draft.increment(draft.lines.last.key); // 2 × 60.00
    expect(draft.totalSantim, 18000 + 2 * 6000);
  });

  test('the order.send message carries ids, quantities, notes and option ids, but NEVER prices', () {
    final draft = OrderDraft()
      ..add(shiro, note: 'no onion')
      ..add(mac, options: const [large]);

    final message = draft.toMessage(orderId: 'o1', sessionId: 's1', tableId: 't7', now: DateTime.utc(2026, 11, 12, 9));

    expect(message['type'], 'order.send');
    expect(message['orderId'], 'o1');
    expect(message['createdAt'], DateTime.utc(2026, 11, 12, 9).millisecondsSinceEpoch);
    expect(message['queuedOffline'], isFalse);
    final items = (message['items'] as List).cast<Map<String, dynamic>>();
    expect(items.map((i) => [i['menuItemId'], i['qty'], i['note'], i['options']]), [
      ['shiro', 1, 'no onion', <String>[]],
      ['mac', 1, null, ['o-large']],
    ]);
    expect(items.map((i) => i['id']).toSet(), hasLength(2)); // a new id per line
    expect(message.toString(), isNot(contains('price')));
  });

  group('option rules', () {
    const size = DraftGroup(id: 'g-size', nameEn: 'Size', minChoices: 1, maxChoices: 1);
    const extras = DraftGroup(id: 'g-extra', nameEn: 'Extras', minChoices: 0, maxChoices: 2);

    test('a required group must be chosen; too many is not allowed', () {
      expect(missingChoices(const [size, extras], const []), ['Size']);
      expect(missingChoices(const [size, extras], const [large]), isEmpty);
      expect(canChooseMore(extras, const [honey, honey]), isFalse);
      expect(canChooseMore(extras, const [honey]), isTrue);
    });
  });

  group('favourites', () {
    test('the 12 items this tablet ordered most in the last 14 days', () async {
      final db = memoryDb();
      addTearDown(db.close);
      final now = DateTime(2026, 11, 12);
      for (var i = 0; i < 3; i++) {
        await db.recordOrdered('shiro', now.subtract(const Duration(days: 1)));
      }
      await db.recordOrdered('mac', now.subtract(const Duration(days: 2)));
      for (var i = 0; i < 5; i++) {
        await db.recordOrdered('old', now.subtract(const Duration(days: 20))); // too long ago
      }

      expect(await db.favouriteItemIds(now), ['shiro', 'mac']);
    });
  });
}
