import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../auth/auth_controller.dart';
import '../data/database.dart';
import '../ids.dart';
import '../providers.dart';
import '../session/providers.dart';
import '../sync/connection.dart';
import '../sync/outbox.dart';
import '../texts.dart';

/// The waiter's home: every table with its live state (W-02), grouped by area.
class FloorMapScreen extends ConsumerStatefulWidget {
  const FloorMapScreen({super.key, required this.user});
  final StaffMember user;

  @override
  ConsumerState<FloorMapScreen> createState() => _FloorMapScreenState();
}

class _FloorMapScreenState extends ConsumerState<FloorMapScreen> {
  bool _mineOnly = false;

  @override
  Widget build(BuildContext context) {
    final tables = ref.watch(tablesProvider).value ?? const <CafeTable>[];
    final link = ref.watch(linkStateProvider).value ?? LinkState.connecting;
    final unsent = ref.watch(unsentCountProvider).value ?? 0;
    final work = ref.watch(workSessionProvider).value;
    final auth = ref.watch(authControllerProvider).value;
    final signOutError = auth is SignedIn ? auth.error : null;

    final shown = _mineOnly ? tables.where((t) => t.waiterId == widget.user.id).toList() : tables;
    // Areas in the manager's table order; tables without an area go under "Tables".
    final areas = <String, List<CafeTable>>{};
    for (final t in shown) {
      areas.putIfAbsent(t.area ?? 'Tables', () => []).add(t);
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.user.name),
        actions: [
          FilterChip(
            key: const Key('filter-mine'),
            label: const Text('Mine'),
            selected: _mineOnly,
            onSelected: (v) => setState(() => _mineOnly = v),
          ),
          IconButton(
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authControllerProvider.notifier).signOut(),
          ),
        ],
      ),
      body: Column(
        children: [
          _ConnectionBanner(link: link, unsent: unsent),
          if (signOutError != null) _Warning(errorText(signOutError)),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(12),
              children: [
                for (final MapEntry(key: area, value: list) in areas.entries) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 12, 4, 8),
                    child: Text(area, style: Theme.of(context).textTheme.titleMedium),
                  ),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      for (final t in list)
                        _TableCard(
                          key: Key('table-${t.id}'),
                          table: t,
                          mine: t.waiterId == widget.user.id,
                          waiterName: work?.staffName(t.waiterId) ?? t.waiterId,
                          onTap: () => _onTap(t),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _onTap(CafeTable t) async {
    final messenger = ScaffoldMessenger.of(context);
    if (t.state == 'free') return _openTable(t);
    if (t.waiterId == widget.user.id) {
      messenger.showSnackBar(SnackBar(content: Text('${t.name}: ordering comes in the next step (F2b).')));
      return;
    }
    final holder = ref.read(workSessionProvider).value?.staffName(t.waiterId) ?? 'another waiter';
    messenger.showSnackBar(SnackBar(content: Text("${t.name} is $holder's table.")));
  }

  Future<void> _openTable(CafeTable t) async {
    final guests = await showDialog<_Guests>(context: context, builder: (_) => _GuestsDialog(table: t));
    if (guests == null || !mounted) return;
    final work = ref.read(workSessionProvider).value;
    final db = ref.read(databaseProvider);
    if (work == null) return;

    final sessionId = newId();
    // Show it as seated at once (any tap < 100 ms); the server's push confirms or corrects it.
    await db.setTableState(t.id, 'seated', sessionId, widget.user.id);
    final result = await work.outbox.submit({
      'type': 'session.open',
      'idempotencyKey': newId(),
      'sessionId': sessionId,
      'tableId': t.id,
      'guests': guests.count,
    });
    if (result case Sent(:final result) when result['ok'] == false) {
      await work.refresh(); // undo the optimistic "seated"
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText('${result['error']}'))));
      }
    }
  }
}

class _Guests {
  const _Guests(this.count);
  final int? count;
}

class _GuestsDialog extends StatefulWidget {
  const _GuestsDialog({required this.table});
  final CafeTable table;
  @override
  State<_GuestsDialog> createState() => _GuestsDialogState();
}

class _GuestsDialogState extends State<_GuestsDialog> {
  int? _count;
  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Open ${widget.table.name}'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Guests (optional)'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (var n = 1; n <= 8; n++)
                ChoiceChip(label: Text('$n'), selected: _count == n, onSelected: (on) => setState(() => _count = on ? n : null)),
            ],
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(context, _Guests(_count)), child: const Text('Open table')),
      ],
    );
  }
}

const _stateLabels = {
  'free': 'Free',
  'seated': 'Seated',
  'ordered': 'Ordered',
  'accepted': 'Accepted',
  'ready': 'READY',
  'delivered': 'Delivered',
};

class _TableCard extends StatelessWidget {
  const _TableCard({super.key, required this.table, required this.mine, required this.waiterName, required this.onTap});
  final CafeTable table;
  final bool mine;
  final String? waiterName;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final ready = table.state == 'ready';
    final (background, foreground) = switch (table.state) {
      'free' => (scheme.surfaceContainerHighest, scheme.onSurface),
      'ready' => (Colors.orange.shade700, Colors.white), // something to pick up: impossible to miss
      'delivered' => (scheme.secondaryContainer, scheme.onSecondaryContainer),
      _ => (scheme.primaryContainer, scheme.onPrimaryContainer),
    };
    return SizedBox(
      width: 150,
      height: 110,
      child: Material(
        color: background,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: mine ? BorderSide(color: scheme.primary, width: 3) : BorderSide.none,
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(table.name, style: TextStyle(color: foreground, fontSize: 18, fontWeight: FontWeight.bold)),
                const Spacer(),
                Text(
                  _stateLabels[table.state] ?? table.state,
                  style: TextStyle(color: foreground, fontWeight: ready ? FontWeight.w900 : FontWeight.w500, fontSize: ready ? 18 : 14),
                ),
                if (table.waiterId != null)
                  Text(mine ? 'Mine' : (waiterName ?? ''), style: TextStyle(color: foreground, fontSize: 12)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ConnectionBanner extends StatelessWidget {
  const _ConnectionBanner({required this.link, required this.unsent});
  final LinkState link;
  final int unsent;

  @override
  Widget build(BuildContext context) {
    if (link == LinkState.online && unsent == 0) return const SizedBox.shrink();
    final text = link == LinkState.online
        ? 'Sending $unsent waiting order(s)…'
        : 'Waiting for internet. Orders are kept on this tablet and sent automatically.${unsent > 0 ? ' ($unsent waiting)' : ''}';
    return _Warning(text);
  }
}

class _Warning extends StatelessWidget {
  const _Warning(this.text);
  final String text;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      color: scheme.errorContainer,
      padding: const EdgeInsets.all(10),
      child: Text(text, style: TextStyle(color: scheme.onErrorContainer)),
    );
  }
}
