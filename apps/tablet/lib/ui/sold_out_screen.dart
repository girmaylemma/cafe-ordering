import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import '../session/providers.dart';
import '../texts.dart';

/// This station's items, each with a big switch: available or SOLD OUT (K-05, F3c). Waiters see
/// the item greyed out within a second. The switch moves only when the server's push arrives,
/// so it always shows what the waiters see. Switching back is also the undo of a wrong tap.
class SoldOutScreen extends ConsumerStatefulWidget {
  const SoldOutScreen({super.key, required this.stationId});
  final String stationId;

  @override
  ConsumerState<SoldOutScreen> createState() => _SoldOutScreenState();
}

class _SoldOutScreenState extends ConsumerState<SoldOutScreen> {
  /// Items whose switch was tapped and whose answer is still on its way.
  final _busy = <String>{};

  @override
  Widget build(BuildContext context) {
    final rows = ref.watch(_stationMenuProvider(widget.stationId)).value ?? const [];
    final theme = Theme.of(context);
    final children = <Widget>[];
    String? heading; // the category heading shown last
    for (final r in rows) {
      final category = r.category?.nameEn;
      if (category != null && category != heading) {
        children.add(Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
          child: Text(category, style: theme.textTheme.titleMedium),
        ));
      }
      heading = category;
      children.add(_row(r.item.id, r.item.nameEn, r.item.soldOut, theme));
    }
    return Scaffold(
      appBar: AppBar(title: Text('Sold out: ${stationNames[widget.stationId] ?? widget.stationId}')),
      body: ListView(padding: const EdgeInsets.symmetric(vertical: 8), children: children),
    );
  }

  Widget _row(String id, String name, bool soldOut, ThemeData theme) => ListTile(
        title: Text(name, style: theme.textTheme.titleLarge),
        subtitle: soldOut ? Text('SOLD OUT', style: TextStyle(color: theme.colorScheme.error, fontWeight: FontWeight.bold)) : null,
        trailing: Transform.scale(
          scale: 1.4, // big enough for wet or gloved hands
          child: Switch(
            key: Key('sold-out-$id'),
            value: soldOut,
            activeThumbColor: theme.colorScheme.error,
            onChanged: _busy.contains(id) ? null : (value) => _toggle(id, value),
          ),
        ),
      );

  Future<void> _toggle(String menuItemId, bool soldOut) async {
    final commands = ref.read(workSessionProvider).value?.stationCommands;
    if (commands == null) return;
    setState(() => _busy.add(menuItemId));
    final result = await commands.soldOut(menuItemId, soldOut: soldOut);
    if (!mounted) return;
    setState(() => _busy.remove(menuItemId));
    if (!result.ok) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(result.error!, retryAfter: result.retryAfter))));
    }
  }
}

final _stationMenuProvider = StreamProvider.family((ref, String stationId) => ref.watch(databaseProvider).watchStationMenu(stationId));
