import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/database.dart';
import '../providers.dart';
import '../texts.dart';

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

/// One table's current visit: every item with its state, round by round.
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

    return Scaffold(
      appBar: AppBar(title: Text(table?.name ?? '')),
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
                  for (final l in items) _LineTile(key: Key('line-${l.id}'), line: l),
                ],
              ],
            ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: FilledButton.icon(
            icon: const Icon(Icons.add),
            label: const Padding(padding: EdgeInsets.all(12), child: Text('Add items')),
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('The order builder comes in the next step (F2b2).'))),
          ),
        ),
      ),
    );
  }
}

class _LineTile extends StatelessWidget {
  const _LineTile({super.key, required this.line});
  final OrderLine line;

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
