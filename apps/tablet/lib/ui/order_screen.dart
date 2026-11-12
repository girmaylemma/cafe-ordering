import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/database.dart';
import '../ids.dart';
import '../ordering/order_draft.dart';
import '../providers.dart';
import '../session/providers.dart';
import '../session/work_session.dart';
import '../sync/outbox.dart';

/// Everything the order screen needs, read once from the tablet's database (no network, CLAUDE.md).
class _Menu {
  _Menu(this.categories, this.items, this.groups, this.options, this.favourites);
  final List<Category> categories;
  final List<MenuItem> items;
  final Map<String, OptionGroup> groups;
  final Map<String, List<OptionChoice>> options; // by group id
  final List<String> favourites;
}

final _menuProvider = FutureProvider.autoDispose<_Menu>((ref) async {
  final db = ref.watch(databaseProvider);
  final options = <String, List<OptionChoice>>{};
  for (final o in await db.allOptions()) {
    options.putIfAbsent(o.groupId, () => []).add(o);
  }
  return _Menu(
    await db.allCategories(),
    await db.allMenuItems(),
    {for (final g in await db.allOptionGroups()) g.id: g},
    options,
    await db.favouriteItemIds(DateTime.now()),
  );
});

/// Sold-out changes arrive live while the screen is open (W-10).
final _soldOutProvider = StreamProvider.autoDispose<Set<String>>(
  (ref) => ref.watch(databaseProvider).watchMenuItems().map((items) => {for (final i in items) if (i.soldOut) i.id}),
);

class OrderScreen extends ConsumerStatefulWidget {
  const OrderScreen({super.key, required this.tableId});
  final String tableId;

  @override
  ConsumerState<OrderScreen> createState() => _OrderScreenState();
}

class _OrderScreenState extends ConsumerState<OrderScreen> {
  final _draft = OrderDraft();
  final _search = TextEditingController();
  String? _tab; // a category id, or 'fav'

  @override
  void initState() {
    super.initState();
    _draft.addListener(() => setState(() {}));
    _search.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _draft.dispose();
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final menu = ref.watch(_menuProvider).value;
    final soldOut = ref.watch(_soldOutProvider).value ?? const <String>{};
    if (menu == null) return const Scaffold(body: SizedBox.shrink()); // the local read takes milliseconds

    final tab = _tab ?? (menu.favourites.isNotEmpty ? 'fav' : menu.categories.firstOrNull?.id);
    final query = _search.text.trim().toLowerCase();
    final shown = query.isNotEmpty
        ? menu.items.where((i) => i.nameEn.toLowerCase().contains(query) || (i.nameAm ?? '').contains(query)).toList()
        : tab == 'fav'
            ? [for (final id in menu.favourites) ...menu.items.where((i) => i.id == id)]
            : menu.items.where((i) => i.categoryId == tab).toList();

    return Scaffold(
      appBar: AppBar(
        title: TextField(
          key: const Key('menu-search'),
          controller: _search,
          decoration: const InputDecoration(hintText: 'Search the menu', border: InputBorder.none, prefixIcon: Icon(Icons.search)),
        ),
      ),
      body: Column(
        children: [
          if (query.isEmpty)
            SizedBox(
              height: 56,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                children: [
                  if (menu.favourites.isNotEmpty) _tabChip('fav', 'Favourites', tab),
                  for (final c in menu.categories) _tabChip(c.id, c.nameEn, tab),
                ],
              ),
            ),
          Expanded(
            child: GridView.extent(
              maxCrossAxisExtent: 180,
              childAspectRatio: 1.4,
              padding: const EdgeInsets.all(8),
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              children: [for (final item in shown) _itemTile(item, soldOut.contains(item.id), menu)],
            ),
          ),
          _summary(context),
        ],
      ),
    );
  }

  Widget _tabChip(String id, String label, String? current) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(label: Text(label), selected: id == current, onSelected: (_) => setState(() => _tab = id)),
      );

  Widget _itemTile(MenuItem item, bool soldOut, _Menu menu) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      key: Key('menu-${item.id}'),
      color: soldOut ? scheme.surfaceContainerHighest.withValues(alpha: 0.5) : scheme.surfaceContainerHigh,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: soldOut ? null : () => _tapItem(item, menu),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(item.nameEn, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: soldOut ? scheme.outline : null)),
              if (item.nameAm != null) Text(item.nameAm!, style: TextStyle(color: scheme.outline)),
              const Spacer(),
              Text(soldOut ? 'Sold out' : formatEtb(item.priceSantim), style: TextStyle(color: soldOut ? scheme.error : scheme.primary)),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _tapItem(MenuItem item, _Menu menu) async {
    final draftItem = DraftItem(menuItemId: item.id, nameEn: item.nameEn, nameAm: item.nameAm, priceSantim: item.priceSantim, stationId: item.stationId);
    final groupIds = (jsonDecode(item.optionGroupIds) as List).cast<String>();
    final groups = [for (final id in groupIds) ?menu.groups[id]];
    if (groups.isEmpty) {
      _draft.add(draftItem); // two taps: category, then item (design §5)
      return;
    }
    final picked = await showModalBottomSheet<(List<DraftOption>, String?)>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _OptionsSheet(item: item, groups: groups, options: menu.options),
    );
    if (picked != null) _draft.add(draftItem, options: picked.$1, note: picked.$2);
  }

  Widget _summary(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      key: const Key('round-summary'),
      elevation: 8,
      color: scheme.surface,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ConstrainedBox(
                constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.3),
                child: ListView(
                  shrinkWrap: true,
                  children: [
                    for (final l in _draft.lines)
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('${l.qty}× ${l.item.nameEn}', style: const TextStyle(fontWeight: FontWeight.w600)),
                                if (l.optionsText != null) Text(l.optionsText!),
                                if (l.note != null) Text(l.note!, style: const TextStyle(fontStyle: FontStyle.italic)),
                              ],
                            ),
                          ),
                          IconButton(tooltip: 'One less', icon: const Icon(Icons.remove_circle_outline), onPressed: () => _minus(l)),
                          IconButton(tooltip: 'One more', icon: const Icon(Icons.add_circle_outline), onPressed: () => _draft.increment(l.key)),
                        ],
                      ),
                  ],
                ),
              ),
              if (!_draft.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Text('Total ${formatEtb(_draft.totalSantim)} ETB', textAlign: TextAlign.right, style: Theme.of(context).textTheme.titleMedium),
                ),
              FilledButton(
                onPressed: _draft.isEmpty ? null : _send,
                child: const Padding(padding: EdgeInsets.all(12), child: Text('Send to kitchen')),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _minus(DraftLine line) {
    final removing = line.qty == 1;
    _draft.decrement(line.key);
    if (removing) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('${line.item.nameEn} removed'),
        action: SnackBarAction(label: 'Undo', onPressed: _draft.undoRemove),
      ));
    }
  }

  Future<void> _send() async {
    final db = ref.read(databaseProvider);
    // Wait for the work session rather than reading whatever is there: .value is null while it
    // is still loading (e.g. right after the app starts), which would wrongly refuse the round.
    final work = await ref.read(workSessionProvider.future);
    final table = await db.tableById(widget.tableId);
    final sessionId = table?.sessionId;
    if (work == null || sessionId == null) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('This table is not open.')));
      return;
    }

    final now = DateTime.now();
    final orderId = newId();
    final message = _draft.toMessage(orderId: orderId, sessionId: sessionId, tableId: widget.tableId, now: now);
    final items = (message['items'] as List).cast<Map<String, dynamic>>();
    final lines = _draft.lines;
    // Show the round at once as "Sending" (the < 100 ms rule), then deliver in the background.
    await db.addLocalLines([
      for (var i = 0; i < lines.length; i++)
        OrderLinesCompanion.insert(
          id: items[i]['id'] as String,
          orderId: orderId,
          tableId: widget.tableId,
          menuItemId: lines[i].item.menuItemId,
          nameEn: lines[i].item.nameEn,
          nameAm: Value(lines[i].item.nameAm),
          qty: lines[i].qty,
          note: Value(lines[i].note),
          optionsText: Value(lines[i].optionsText),
          priceSantim: lines[i].unitSantim,
          state: 'sent',
          sync: 'sending',
          createdAt: now.microsecondsSinceEpoch + i,
        ),
    ]);
    for (final l in lines) {
      await db.recordOrdered(l.item.menuItemId, now);
    }
    unawaited(_deliver(work, db, orderId, message));
    if (mounted) Navigator.of(context).pop(); // back to the table screen (D-80)
  }

  static Future<void> _deliver(WorkSession work, AppDatabase db, String orderId, Map<String, dynamic> message) async {
    try {
      final result = await work.outbox.submit(message);
      switch (result) {
        case Sent(:final result) when result['ok'] == true:
          await db.setLinesSync(orderId, 'sent');
        case Sent(:final result):
          await db.setLinesSync(orderId, 'needs_attention', error: '${result['error']}');
        case Queued():
          await db.setLinesSync(orderId, 'queued');
      }
    } on Object {
      await db.setLinesSync(orderId, 'needs_attention', error: 'NETWORK');
    }
  }
}

/// Choose an item's options: each group's minimum and maximum are enforced (D-77).
class _OptionsSheet extends StatefulWidget {
  const _OptionsSheet({required this.item, required this.groups, required this.options});
  final MenuItem item;
  final List<OptionGroup> groups;
  final Map<String, List<OptionChoice>> options;
  @override
  State<_OptionsSheet> createState() => _OptionsSheetState();
}

class _OptionsSheetState extends State<_OptionsSheet> {
  final _chosen = <DraftOption>[];
  final _note = TextEditingController();

  List<DraftGroup> get _groups => [
        for (final g in widget.groups) DraftGroup(id: g.id, nameEn: g.nameEn, minChoices: g.minChoices, maxChoices: g.maxChoices),
      ];

  void _toggle(OptionGroup group, OptionChoice option) {
    setState(() {
      if (_chosen.any((c) => c.id == option.id)) {
        _chosen.removeWhere((c) => c.id == option.id);
        return;
      }
      final draftGroup = _groups.firstWhere((g) => g.id == group.id);
      if (!canChooseMore(draftGroup, _chosen)) {
        if (group.maxChoices != 1) return; // full
        _chosen.removeWhere((c) => c.groupId == group.id); // "choose 1" acts like radio buttons
      }
      _chosen.add(DraftOption(id: option.id, groupId: group.id, nameEn: option.nameEn, extraSantim: option.extraSantim));
    });
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final missing = missingChoices(_groups, _chosen);
    return Padding(
      padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.viewInsetsOf(context).bottom + 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.item.nameEn, style: Theme.of(context).textTheme.titleLarge),
          for (final g in widget.groups) ...[
            const SizedBox(height: 12),
            Text('${g.nameEn}${g.minChoices > 0 ? ' (required)' : ''}', style: Theme.of(context).textTheme.titleSmall),
            Wrap(
              spacing: 8,
              children: [
                for (final o in widget.options[g.id] ?? const <OptionChoice>[])
                  FilterChip(
                    label: Text(o.extraSantim > 0 ? '${o.nameEn} (+${formatEtb(o.extraSantim)})' : o.nameEn),
                    selected: _chosen.any((c) => c.id == o.id),
                    onSelected: (_) => _toggle(g, o),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          TextField(controller: _note, maxLength: 200, decoration: const InputDecoration(labelText: 'Note (optional)', border: OutlineInputBorder())),
          if (missing.isNotEmpty) Text('Choose: ${missing.join(', ')}', style: TextStyle(color: Theme.of(context).colorScheme.error)),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: missing.isEmpty ? () => Navigator.pop(context, (List<DraftOption>.of(_chosen), _note.text)) : null,
            child: const Padding(padding: EdgeInsets.all(12), child: Text('Add')),
          ),
        ],
      ),
    );
  }
}

