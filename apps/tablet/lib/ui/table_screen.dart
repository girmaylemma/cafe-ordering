import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/database.dart';
import '../ordering/order_draft.dart';
import '../providers.dart';
import '../session/providers.dart';
import '../sync/commands.dart';
import '../texts.dart';
import 'order_screen.dart';
import 'void_dialog.dart';

final _linesProvider = StreamProvider.family<List<OrderLine>, String>((ref, tableId) => ref.watch(databaseProvider).watchLines(tableId));
final _tableProvider = StreamProvider.family<CafeTable?, String>((ref, tableId) => ref.watch(databaseProvider).watchTable(tableId));

const _stateLabels = {
  'sent': 'Sent ✓',
  'accepted': 'Accepted',
  'ready': 'READY',
  'delivered': 'Delivered',
  'cancelled': 'Cancelled',
  'voided': 'Voided',
};

const _approverRoles = {'manager', 'owner'};

/// One table's current visit: every item with its state, round by round. Tap an item for what
/// can be done with it; the menu at the top has the table actions (W-09).
class TableScreen extends ConsumerWidget {
  const TableScreen({super.key, required this.tableId});
  final String tableId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final table = ref.watch(_tableProvider(tableId)).value;
    final lines = ref.watch(_linesProvider(tableId)).value ?? const <OrderLine>[];

    // Rounds in order; lines the server hasn't confirmed yet (no round number) come last.
    final rounds = <int?, List<OrderLine>>{};
    for (final l in lines) {
      rounds.putIfAbsent(l.round, () => []).add(l);
    }

    final sessionId = table?.sessionId;
    return Scaffold(
      appBar: AppBar(
        title: Text(table?.name ?? ''),
        actions: [
          if (table != null && sessionId != null)
            PopupMenuButton<_TableAction>(
              key: const Key('table-actions'),
              onSelected: (action) => _tableAction(context, ref, table, sessionId, action),
              itemBuilder: (_) => [
                for (final a in _TableAction.values) PopupMenuItem(value: a, child: Text(a.label)),
              ],
            ),
        ],
      ),
      body: lines.isEmpty
          ? const Center(child: Text('Nothing ordered yet.'))
          : ListView(
              padding: const EdgeInsets.all(12),
              children: [
                for (final MapEntry(key: round, value: items) in rounds.entries) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 12, 4, 4),
                    child: Text(round == null ? 'New round' : 'Round $round', style: Theme.of(context).textTheme.titleMedium),
                  ),
                  for (final l in items) _LineTile(key: Key('line-${l.id}'), line: l, onTap: () => _lineActions(context, ref, l)),
                ],
              ],
            ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: FilledButton.icon(
            icon: const Icon(Icons.add),
            label: const Padding(padding: EdgeInsets.all(12), child: Text('Add items')),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => OrderScreen(tableId: tableId))),
          ),
        ),
      ),
    );
  }

  // ---------- one item ----------

  Future<void> _lineActions(BuildContext context, WidgetRef ref, OrderLine line) async {
    // What is possible depends on where the item is. The server checks again: these are only offers.
    final actions = switch ((line.sync, line.state)) {
      ('needs_attention', _) => [_LineAction.orderAgain, _LineAction.dismiss],
      ('sent', 'sent') => [_LineAction.cancel],
      ('sent', 'accepted' || 'ready') => [_LineAction.delivered, _LineAction.voidItem],
      _ => const <_LineAction>[], // on its way, or finished
    };
    if (actions.isEmpty) return;

    final chosen = await showModalBottomSheet<_LineAction>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(title: Text('${line.qty}× ${line.nameEn}', style: Theme.of(sheet).textTheme.titleMedium)),
            for (final a in actions)
              ListTile(minTileHeight: 56, leading: Icon(a.icon), title: Text(a.label), onTap: () => Navigator.of(sheet).pop(a)),
          ],
        ),
      ),
    );
    if (chosen == null || !context.mounted) return;

    switch (chosen) {
      case _LineAction.delivered:
        await _run(context, ref, (c) => c.delivered(line.id));
      case _LineAction.cancel:
        await _run(context, ref, (c) => c.cancel(line.id));
      case _LineAction.voidItem:
        await _void(context, ref, line);
      case _LineAction.orderAgain:
        await _orderAgain(context, ref, line);
      case _LineAction.dismiss:
        final sure = await _confirm(context, 'Remove this round?', 'It never reached the kitchen. Its items will be removed from this table.', 'Remove');
        if (sure) await ref.read(databaseProvider).dismissRound(line.orderId);
    }
  }

  Future<void> _void(BuildContext context, WidgetRef ref, OrderLine line) async {
    final work = await ref.read(workSessionProvider.future);
    if (work == null || !context.mounted) return;
    final me = ref.read(currentUserProvider);
    await showVoidDialog(
      context,
      itemName: line.nameEn,
      signedInAsManager: me != null && _approverRoles.contains(me.role),
      managers: [for (final s in work.staff) if (_approverRoles.contains(s.role)) s],
      send: (reason, approval) => work.commands.voidItem(line.id, reason: reason, approval: approval),
    );
  }

  /// The whole refused round goes into a new draft (new ids); sending it replaces the old one.
  Future<void> _orderAgain(BuildContext context, WidgetRef ref, OrderLine line) async {
    final round = await ref.read(databaseProvider).linesOfRound(line.orderId);
    if (!context.mounted) return;
    final again = [
      for (final l in round)
        AgainLine(
          name: l.nameEn,
          menuItemId: l.menuItemId,
          qty: l.qty,
          note: l.note,
          optionIds: l.optionIds == null ? const [] : (jsonDecode(l.optionIds!) as List).cast<String>(),
        ),
    ];
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => OrderScreen(tableId: tableId, again: again, replacesOrderId: line.orderId),
    ));
  }

  // ---------- the whole table ----------

  Future<void> _tableAction(BuildContext context, WidgetRef ref, CafeTable table, String sessionId, _TableAction action) async {
    final db = ref.read(databaseProvider);
    final Future<ActionResult> Function(TableCommands)? command;
    switch (action) {
      case _TableAction.move:
        final free = [for (final t in await db.watchTables().first) if (t.state == 'free') (t.id, t.name)];
        final to = context.mounted ? await _pick(context, 'Move ${table.name} to', free) : null;
        command = to == null ? null : (c) => c.move(sessionId, toTableId: to);
      case _TableAction.merge:
        final open = [
          for (final t in await db.watchTables().first)
            if (t.id != table.id && t.sessionId != null && t.state != 'free') (t.sessionId!, t.name),
        ];
        final into = context.mounted ? await _pick(context, 'Merge ${table.name} into', open) : null;
        command = into == null ? null : (c) => c.merge(sessionId, intoSessionId: into);
      case _TableAction.handOver:
        final work = await ref.read(workSessionProvider.future);
        final me = ref.read(currentUserProvider);
        final waiters = [
          if (work != null)
            for (final s in work.staff)
              if (s.role == 'waiter' && s.id != me?.id) (s.id, s.name),
        ];
        final to = context.mounted ? await _pick(context, 'Hand ${table.name} over to', waiters) : null;
        command = to == null ? null : (c) => c.handOver(sessionId, toWaiterId: to);
      case _TableAction.close:
        final sure = await _confirm(context, 'Close ${table.name}?', 'The table becomes free for the next guests.', 'Close');
        command = sure ? (c) => c.close(sessionId) : null;
    }
    if (command == null || !context.mounted) return;
    // The visit is no longer this waiter's table here (closed, moved, merged or handed over).
    if (await _run(context, ref, command) && context.mounted) Navigator.of(context).pop();
  }

  // ---------- helpers ----------

  /// Send one action; a refusal or "needs internet" is shown at once. True when done.
  static Future<bool> _run(BuildContext context, WidgetRef ref, Future<ActionResult> Function(TableCommands) action) async {
    final work = await ref.read(workSessionProvider.future);
    final result = work == null ? const ActionResult.failed('NEEDS_CONNECTION') : await action(work.commands);
    if (!result.ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(result.error!, retryAfter: result.retryAfter))));
    }
    return result.ok;
  }

  static Future<String?> _pick(BuildContext context, String title, List<(String, String)> choices) => showModalBottomSheet<String>(
        context: context,
        builder: (sheet) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              ListTile(title: Text(title, style: Theme.of(sheet).textTheme.titleMedium)),
              if (choices.isEmpty) const ListTile(title: Text('None available right now.')),
              for (final (id, name) in choices) ListTile(minTileHeight: 56, title: Text(name), onTap: () => Navigator.of(sheet).pop(id)),
            ],
          ),
        ),
      );

  static Future<bool> _confirm(BuildContext context, String title, String body, String yes) async =>
      await showDialog<bool>(
        context: context,
        builder: (dialog) => AlertDialog(
          title: Text(title),
          content: Text(body),
          actions: [
            TextButton(onPressed: () => Navigator.of(dialog).pop(false), child: const Text('Back')),
            FilledButton(onPressed: () => Navigator.of(dialog).pop(true), child: Text(yes)),
          ],
        ),
      ) ??
      false;
}

enum _LineAction {
  delivered('Delivered', Icons.check_circle),
  cancel('Cancel item', Icons.cancel),
  voidItem('Void…', Icons.block),
  orderAgain('Order again', Icons.replay),
  dismiss('Dismiss', Icons.delete_outline);

  const _LineAction(this.label, this.icon);
  final String label;
  final IconData icon;
}

enum _TableAction {
  move('Move to another table'),
  merge('Merge into another table'),
  handOver('Hand over to…'),
  close('Close table');

  const _TableAction(this.label);
  final String label;
}

class _LineTile extends StatelessWidget {
  const _LineTile({super.key, required this.line, required this.onTap});
  final OrderLine line;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final struck = line.state == 'cancelled' || line.state == 'voided';
    final details = [?line.optionsText, ?line.note];

    // The server hasn't confirmed it: show where it is on its way. Otherwise the kitchen's state.
    final (label, color) = switch (line.sync) {
      'queued' => ('Waiting for internet', scheme.error),
      'sending' => ('Sending…', scheme.outline),
      'needs_attention' => ('Not sent: ${errorText(line.error ?? 'UNKNOWN')}', scheme.error),
      _ => (_stateLabels[line.state] ?? line.state, line.state == 'ready' ? Colors.orange.shade800 : scheme.primary),
    };

    return Card(
      child: ListTile(
        minTileHeight: 56,
        onTap: onTap,
        leading: Text('${line.qty}×', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        title: Text(line.nameEn, style: struck ? const TextStyle(decoration: TextDecoration.lineThrough) : null),
        subtitle: details.isEmpty ? null : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [for (final d in details) Text(d)]),
        trailing: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 180),
          child: Text(label, textAlign: TextAlign.right, style: TextStyle(color: color, fontWeight: line.state == 'ready' ? FontWeight.w900 : FontWeight.w600)),
        ),
      ),
    );
  }
}
