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

  group('order again (a round the server refused)', () {
    const size = DraftGroup(id: 'g-size', nameEn: 'Size', minChoices: 1, maxChoices: 1);
    final menu = {'shiro': shiro, 'mac': mac};
    final options = {'o-large': large};
    List<String> again(OrderDraft draft, List<AgainLine> lines, {Set<String> soldOut = const {}}) => addAgain(
          draft,
          lines,
          item: (id) => soldOut.contains(id) ? null : menu[id],
          groups: (id) => id == 'mac' ? const [size] : const [],
          option: (id) => options[id],
        );

    test('the same items, quantities, notes and options go into the new round', () {
      final draft = OrderDraft();
      final skipped = again(draft, const [
        AgainLine(name: 'Shiro', menuItemId: 'shiro', qty: 2, note: 'no onion'),
        AgainLine(name: 'Macchiato', menuItemId: 'mac', qty: 1, optionIds: ['o-large']),
      ]);

      expect(skipped, isEmpty);
      expect(draft.lines.map((l) => (l.item.menuItemId, l.qty, l.note, l.optionsText)), [('shiro', 2, 'no onion', null), ('mac', 1, null, 'Large')]);
    });

    test('an item now sold out or removed from the menu is left out and named', () {
      final draft = OrderDraft();
      final skipped = again(draft, const [
        AgainLine(name: 'Shiro', menuItemId: 'shiro', qty: 1),
        AgainLine(name: 'Kitfo', menuItemId: 'kitfo', qty: 1),
      ], soldOut: {'shiro'});

      expect(draft.isEmpty, isTrue);
      expect(skipped, ['Shiro', 'Kitfo']);
    });

    test('an option that no longer exists leaves a required choice open: the line is left out', () {
      final draft = OrderDraft();
      final skipped = again(draft, const [AgainLine(name: 'Macchiato', menuItemId: 'mac', qty: 1, optionIds: ['o-gone'])]);

      expect(draft.isEmpty, isTrue);
      expect(skipped, ['Macchiato']);
    });

    test('the new round gets NEW item ids (it is a new round, not a resend)', () {
      final draft = OrderDraft();
      again(draft, const [AgainLine(name: 'Shiro', menuItemId: 'shiro', qty: 1)]);
      final a = draft.toMessage(orderId: 'o1', sessionId: 's1', tableId: 't7', now: DateTime(2026));
      final b = draft.toMessage(orderId: 'o2', sessionId: 's1', tableId: 't7', now: DateTime(2026));
      expect((a['items'] as List).single['id'], isNot((b['items'] as List).single['id']));
    });
  });
}
