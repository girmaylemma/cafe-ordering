/// The round a waiter is building (pure Dart, no Flutter): lines, quantities, the display
/// total, and the `order.send` message. Prices are for DISPLAY only and are never sent:
/// the server copies them from its own menu (D-17).
library;

import 'package:flutter/foundation.dart';

import '../ids.dart';

class DraftItem {
  const DraftItem({required this.menuItemId, required this.nameEn, required this.nameAm, required this.priceSantim, required this.stationId});
  final String menuItemId;
  final String nameEn;
  final String? nameAm;
  final int priceSantim;
  final String stationId;
}

class DraftOption {
  const DraftOption({required this.id, required this.groupId, required this.nameEn, required this.extraSantim});
  final String id;
  final String groupId;
  final String nameEn;
  final int extraSantim;
}

class DraftGroup {
  const DraftGroup({required this.id, required this.nameEn, required this.minChoices, required this.maxChoices});
  final String id;
  final String nameEn;
  final int minChoices;
  final int maxChoices;
}

class DraftLine {
  DraftLine({required this.key, required this.item, required this.options, required this.note, required this.qty});
  final String key;
  final DraftItem item;
  final List<DraftOption> options;
  final String? note;
  int qty;

  /// Unit price including the options' extras (display only).
  int get unitSantim => item.priceSantim + options.fold(0, (sum, o) => sum + o.extraSantim);
  String? get optionsText => options.isEmpty ? null : options.map((o) => o.nameEn).join(', ');
  bool get isPlain => options.isEmpty && note == null;
}

class OrderDraft extends ChangeNotifier {
  final List<DraftLine> _lines = [];
  (int, DraftLine)? _lastRemoved;
  int _keys = 0;

  List<DraftLine> get lines => List.unmodifiable(_lines);
  bool get isEmpty => _lines.isEmpty;
  int get totalSantim => _lines.fold(0, (sum, l) => sum + l.unitSantim * l.qty);

  /// Add an item. A plain item (no options, no note) joins an existing plain line of the same
  /// item; anything with options or a note gets its own line.
  void add(DraftItem item, {List<DraftOption> options = const [], String? note}) {
    final cleanNote = (note == null || note.trim().isEmpty) ? null : note.trim();
    if (options.isEmpty && cleanNote == null) {
      for (final l in _lines) {
        if (l.isPlain && l.item.menuItemId == item.menuItemId) {
          l.qty++;
          notifyListeners();
          return;
        }
      }
    }
    _lines.add(DraftLine(key: 'l${_keys++}', item: item, options: List.of(options), note: cleanNote, qty: 1));
    notifyListeners();
  }

  void increment(String key) {
    _lines.firstWhere((l) => l.key == key).qty++;
    notifyListeners();
  }

  /// Minus at 1 removes the line (undo with [undoRemove]).
  void decrement(String key) {
    final i = _lines.indexWhere((l) => l.key == key);
    if (_lines[i].qty > 1) {
      _lines[i].qty--;
    } else {
      _lastRemoved = (i, _lines.removeAt(i));
    }
    notifyListeners();
  }

  void undoRemove() {
    final removed = _lastRemoved;
    if (removed == null) return;
    final (index, line) = removed;
    _lines.insert(index.clamp(0, _lines.length), line);
    _lastRemoved = null;
    notifyListeners();
  }

  /// The message for the server. A new UUID v7 per line (made on the device); no prices.
  Map<String, dynamic> toMessage({required String orderId, required String sessionId, required String tableId, required DateTime now}) => {
        'type': 'order.send',
        'orderId': orderId,
        'sessionId': sessionId,
        'tableId': tableId,
        'createdAt': now.millisecondsSinceEpoch,
        'queuedOffline': false, // the outbox sets true if it has to keep it (decided once)
        'items': [
          for (final l in _lines)
            {'id': newId(), 'menuItemId': l.item.menuItemId, 'qty': l.qty, 'note': l.note, 'options': [for (final o in l.options) o.id]},
        ],
      };
}

/// Names of required groups that are not chosen yet (empty = ready to add).
List<String> missingChoices(List<DraftGroup> groups, List<DraftOption> chosen) => [
      for (final g in groups)
        if (chosen.where((o) => o.groupId == g.id).length < g.minChoices) g.nameEn,
    ];

/// Whether another option of this group may be chosen.
bool canChooseMore(DraftGroup group, List<DraftOption> chosen) => chosen.where((o) => o.groupId == group.id).length < group.maxChoices;

/// 18000 → "180.00" (santim to ETB text; never through a float).
String formatEtb(int santim) => '${santim ~/ 100}.${(santim % 100).toString().padLeft(2, '0')}';
