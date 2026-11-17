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
import '../l10n/l10n.dart';
import '../texts.dart';
import 'table_screen.dart';

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
      areas.putIfAbsent(t.area ?? context.l10n.floorDefaultArea, () => []).add(t);
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.user.name),
        actions: [
          FilterChip(
            key: const Key('filter-mine'),
            label: Text(context.l10n.floorMine),
            selected: _mineOnly,
            onSelected: (v) => setState(() => _mineOnly = v),
          ),
          IconButton(
            tooltip: context.l10n.floorSignOut,
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authControllerProvider.notifier).signOut(),
          ),
        ],
      ),
      body: Column(
        children: [
          _ConnectionBanner(link: link, unsent: unsent),
          if (signOutError != null) _Warning(errorText(context.l10n, signOutError)),
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
      await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => TableScreen(tableId: t.id)));
      return;
    }
    final holder = ref.read(workSessionProvider).value?.staffName(t.waiterId) ?? context.l10n.floorAnotherWaiter;
    messenger.showSnackBar(SnackBar(content: Text(context.l10n.floorTableOfOther(t.name, holder))));
  }

  Future<void> _openTable(CafeTable t) async {
    final guests = await showDialog<_Guests>(context: context, builder: (_) => _GuestsDialog(table: t));
    if (guests == null || !mounted) return;
    final work = await ref.read(workSessionProvider.future); // wait if it is still loading
    final db = ref.read(databaseProvider);
    if (work == null || !mounted) return;

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
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(context.l10n, '${result['error']}'))));
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
      title: Text(context.l10n.floorOpenTitle(widget.table.name)),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(context.l10n.floorGuests),
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
        TextButton(onPressed: () => Navigator.pop(context), child: Text(context.l10n.commonCancel)),
        FilledButton(onPressed: () => Navigator.pop(context, _Guests(_count)), child: Text(context.l10n.floorOpenButton)),
      ],
    );
  }
}

/// A table card's state in the user's language; an unknown state shows as it is.
String _stateLabel(AppLocalizations t, String state) => switch (state) {
      'free' => t.tableStateFree,
      'seated' => t.tableStateSeated,
      'ordered' => t.tableStateOrdered,
      'accepted' => t.tableStateAccepted,
      'ready' => t.tableStateReady,
      'delivered' => t.tableStateDelivered,
      _ => state,
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
    // At least 110 tall; taller when large text needs it (Ethiopic letters need more line height).
    return ConstrainedBox(
      constraints: const BoxConstraints.tightFor(width: 150).copyWith(minHeight: 110),
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
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(table.name, style: TextStyle(color: foreground, fontSize: 18, fontWeight: FontWeight.bold)),
                Text(
                  _stateLabel(context.l10n, table.state),
                  style: TextStyle(color: foreground, fontWeight: ready ? FontWeight.w900 : FontWeight.w500, fontSize: ready ? 18 : 14),
                ),
                if (table.waiterId != null)
                  Text(mine ? context.l10n.floorMine : (waiterName ?? ''), style: TextStyle(color: foreground, fontSize: 12)),
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
    final t = context.l10n;
    final text = link == LinkState.online
        ? t.floorSending(unsent)
        : (unsent > 0 ? t.floorOfflineWaiting(unsent) : t.floorOffline);
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
