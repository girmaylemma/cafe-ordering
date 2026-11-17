import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../alerts/kitchen_alerts.dart';
import '../api/api_client.dart';
import '../data/database.dart';
import '../session/providers.dart';
import '../sync/commands.dart';
import '../sync/connection.dart';
import '../l10n/l10n.dart';
import '../texts.dart';
import 'screen_awake.dart';
import 'sold_out_screen.dart';
import 'dish_name.dart';

/// How long the kitchen can undo its last tap (K-06; the server checks it, D-05).
const undoWindow = Duration(seconds: 10);

/// The kitchen or bar tablet's only screen (F3a): one card per round, oldest first, with a big
/// Accept / Ready button per item (K-01, K-03). The card changes ONLY when the server's event
/// arrives, so the screen always shows what the waiters see.
class KitchenScreen extends ConsumerStatefulWidget {
  const KitchenScreen({super.key, required this.device});
  final DeviceInfo device;

  @override
  ConsumerState<KitchenScreen> createState() => _KitchenScreenState();
}

class _KitchenScreenState extends ConsumerState<KitchenScreen> {
  /// Items with a tap on its way to the server (their button is disabled meanwhile).
  final _busy = <String>{};

  /// The item whose last tap can still be undone, and the timer that ends that chance.
  String? _undoItemId;
  Timer? _undoTimer;

  /// Redraws the ticket timers. Every 30 s is plenty for "minutes" and costs almost nothing.
  late final Timer _ticker = Timer.periodic(const Duration(seconds: 30), (_) => setState(() {}));

  /// The flash in progress (K-02): blinks [_flashBlinks] times, then ends.
  KitchenFlash? _flash;
  bool _flashOn = false;
  Timer? _flashTimer;
  static const _flashBlinks = 3;
  static const _flashStep = Duration(milliseconds: 300);

  /// Read once: `ref` may not be used any more in dispose().
  late final ScreenAwake _awake = ref.read(screenAwakeProvider);

  @override
  void initState() {
    super.initState();
    _ticker; // start it
    unawaited(_awake.keepOn()); // K-07: the kitchen screen never sleeps
  }

  @override
  void dispose() {
    unawaited(_awake.allowSleep());
    _ticker.cancel();
    _undoTimer?.cancel();
    _flashTimer?.cancel();
    super.dispose();
  }

  /// "Kitchen" or "Bar" in the user's language; a station the app doesn't know shows the device's name.
  String _title(BuildContext context) {
    final id = widget.device.stationId ?? '';
    final name = stationName(context.l10n, id);
    return name == id ? widget.device.name : name;
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(kitchenFlashProvider, (_, next) {
      if (next case AsyncData(:final value)) _startFlash(value);
    });
    final items = ref.watch(ticketsProvider).value ?? const <TicketItem>[];
    final link = ref.watch(linkStateProvider).value ?? LinkState.connecting;
    final nowMs = ref.watch(workSessionProvider).value?.clock.nowMs() ?? DateTime.now().millisecondsSinceEpoch;

    // One card per round, in the order the database gives (oldest round first).
    final rounds = <String, List<TicketItem>>{};
    for (final item in items) {
      rounds.putIfAbsent(item.orderId, () => []).add(item);
    }

    final flash = _flash;
    // K-07: read from 2 m. Text is at least 1.3x normal; a tablet set even larger keeps its size.
    return MediaQuery.withClampedTextScaling(minScaleFactor: 1.3, child: Scaffold(
      appBar: AppBar(
        title: Text(_title(context)),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: FilledButton.tonalIcon(
              key: const Key('open-sold-out'),
              icon: const Icon(Icons.block),
              label: Text(context.l10n.kitchenSoldOutButton),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => SoldOutScreen(stationId: widget.device.stationId ?? '')),
              ),
            ),
          ),
        ],
      ),
      body: Stack(
        children: [
          Column(
            children: [
              if (link != LinkState.online) const _NoConnection(),
              Expanded(
                child: rounds.isEmpty
                    ? Center(child: Text(context.l10n.kitchenNoOrders, style: Theme.of(context).textTheme.titleLarge))
                    : SingleChildScrollView(
                        padding: const EdgeInsets.all(12),
                        child: Wrap(
                          spacing: 12,
                          runSpacing: 12,
                          children: [
                            for (final round in rounds.values)
                              _TicketCard(
                                key: Key('ticket-${round.first.orderId}'),
                                items: round,
                                nowMs: nowMs,
                                busy: _busy,
                                undoItemId: _undoItemId,
                                onTap: _tap,
                                onUndo: _undo,
                              ),
                          ],
                        ),
                      ),
              ),
            ],
          ),
          // Over everything, but taps go through: the cook must never lose a tap to a flash.
          if (flash != null)
            Positioned.fill(
              child: IgnorePointer(
                child: AnimatedOpacity(
                  key: Key('flash-${flash.name}'),
                  opacity: _flashOn ? 0.55 : 0,
                  duration: const Duration(milliseconds: 120),
                  child: ColoredBox(color: flash == KitchenFlash.voided ? Colors.red : Colors.orange),
                ),
              ),
            ),
        ],
      ),
    ));
  }

  void _startFlash(KitchenFlash kind) {
    _flashTimer?.cancel();
    var steps = 0;
    setState(() {
      _flash = kind;
      _flashOn = true;
    });
    _flashTimer = Timer.periodic(_flashStep, (timer) {
      if (!mounted) return timer.cancel();
      steps++;
      setState(() {
        if (steps >= _flashBlinks * 2) {
          timer.cancel();
          _flash = null;
          _flashOn = false;
        } else {
          _flashOn = !_flashOn;
        }
      });
    });
  }

  Future<void> _tap(TicketItem item) async {
    final commands = ref.read(workSessionProvider).value?.stationCommands;
    if (commands == null) return;
    final action = item.state == 'sent' ? commands.accept : commands.ready;
    final result = await _run(item.id, () => action(item.id));
    if (result.ok) _offerUndo(item.id);
  }

  Future<void> _undo(String itemId) async {
    final commands = ref.read(workSessionProvider).value?.stationCommands;
    if (commands == null) return;
    _clearUndo(); // one undo per tap, whatever the answer
    await _run(itemId, () => commands.undo(itemId));
  }

  /// Send one tap, keep its button disabled meanwhile, and say why if it was refused.
  Future<ActionResult> _run(String itemId, Future<ActionResult> Function() send) async {
    setState(() => _busy.add(itemId));
    final result = await send();
    if (!mounted) return result;
    setState(() => _busy.remove(itemId));
    if (!result.ok) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(context.l10n, result.error!, retryAfter: result.retryAfter))));
    }
    return result;
  }

  void _offerUndo(String itemId) {
    _undoTimer?.cancel();
    setState(() => _undoItemId = itemId);
    _undoTimer = Timer(undoWindow, () {
      if (mounted) setState(_clearUndo);
    });
  }

  void _clearUndo() {
    _undoTimer?.cancel();
    _undoItemId = null;
  }
}

/// Ticket age colours (K-04, D-84): fixed for now; a café setting later if clients ask.
const amberAfter = Duration(minutes: 10);
const redAfter = Duration(minutes: 15);

class _TicketCard extends StatelessWidget {
  const _TicketCard({
    super.key,
    required this.items,
    required this.nowMs,
    required this.busy,
    required this.undoItemId,
    required this.onTap,
    required this.onUndo,
  });
  final List<TicketItem> items;
  final int nowMs;
  final Set<String> busy;
  final String? undoItemId;
  final void Function(TicketItem) onTap;
  final void Function(String) onUndo;

  @override
  Widget build(BuildContext context) {
    final first = items.first;
    final theme = Theme.of(context);
    final round = first.round;
    final offline = items.any((i) => i.sentWhileOffline);
    // The timer counts while something is still to cook; when all that is left is ready, it rests.
    final cooking = items.any((i) => i.state == 'sent' || i.state == 'accepted');
    final age = Duration(milliseconds: nowMs - first.receivedAt);
    final (level, colour) = !cooking
        ? ('done', null)
        : age >= redAfter
        ? ('red', Colors.red.shade700)
        : age >= amberAfter
        ? ('amber', Colors.amber.shade700)
        : ('normal', null);
    return SizedBox(
      width: 440, // with 1.3x text (K-07): two cards side by side on a 10-inch tablet
      child: Card(
        margin: EdgeInsets.zero,
        // A late ticket is seen from across the kitchen: its whole border takes the colour.
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: colour == null ? BorderSide.none : BorderSide(color: colour, width: 5),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(first.tableLabel, style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
                  ),
                  Text(_clock(first.receivedAt), style: theme.textTheme.titleMedium),
                  const SizedBox(width: 8),
                  Container(
                    key: Key('age-$level'),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(color: colour ?? theme.colorScheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(8)),
                    child: Text(
                      _ageLabel(context.l10n, age),
                      style: theme.textTheme.titleMedium?.copyWith(color: colour == null ? null : Colors.white, fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
              Text(
                [if (first.waiterName != null) first.waiterName!, if (round != null && round > 1) context.l10n.commonRound(round)].join(' · '),
                style: theme.textTheme.titleMedium,
              ),
              if (offline) _Flag(context.l10n.kitchenSentOffline, color: Colors.orange.shade800),
              const Divider(height: 20),
              for (final item in items)
                _ItemRow(item: item, busy: busy.contains(item.id), canUndo: undoItemId == item.id, onTap: () => onTap(item), onUndo: () => onUndo(item.id)),
            ],
          ),
        ),
      ),
    );
  }

  /// "7 min"; capped at "99+ min" (long past red), so the label always fits the card.
  static String _ageLabel(AppLocalizations t, Duration age) {
    final minutes = age.inMinutes < 0 ? 0 : age.inMinutes;
    return minutes > 99 ? t.kitchenAgeOver99 : t.kitchenAgeMinutes(minutes);
  }

  /// The server's time on this tablet's clock, e.g. 14:05.
  static String _clock(int ms) {
    final t = DateTime.fromMillisecondsSinceEpoch(ms);
    return '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({required this.item, required this.busy, required this.canUndo, required this.onTap, required this.onUndo});
  final TicketItem item;
  final bool busy;
  final bool canUndo;
  final VoidCallback onTap;
  final VoidCallback onUndo;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final gone = item.state == 'cancelled' || item.state == 'voided';
    final nameStyle = theme.textTheme.titleLarge?.copyWith(
      fontWeight: FontWeight.w600,
      decoration: gone ? TextDecoration.lineThrough : null,
      color: gone ? theme.disabledColor : null,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                DishName(en: item.nameEn, am: item.nameAm, qty: item.qty, style: nameStyle),
                if (item.optionsText != null) Text(item.optionsText!, style: theme.textTheme.titleMedium),
                if (item.note != null) Text('“${item.note}”', style: theme.textTheme.titleMedium?.copyWith(fontStyle: FontStyle.italic)),
                if (item.flag == 'sold_out') _Flag(context.l10n.kitchenFlagSoldOut, color: theme.colorScheme.error),
                if (item.flag == 'unavailable') _Flag(context.l10n.kitchenFlagUnavailable, color: theme.colorScheme.error),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              _action(context, theme),
              if (canUndo && (item.state == 'accepted' || item.state == 'ready')) TextButton(onPressed: busy ? null : onUndo, child: Text(context.l10n.commonUndo)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _action(BuildContext context, ThemeData theme) {
    const size = Size(130, 56); // big enough for wet or gloved hands (NFR usability)
    switch (item.state) {
      case 'sent':
        return FilledButton(
          style: FilledButton.styleFrom(minimumSize: size),
          onPressed: busy ? null : onTap,
          child: Text(context.l10n.kitchenAccept),
        );
      case 'accepted':
        return FilledButton(
          style: FilledButton.styleFrom(minimumSize: size, backgroundColor: Colors.green.shade700),
          onPressed: busy ? null : onTap,
          child: Text(context.l10n.kitchenReady),
        );
      case 'ready':
        return _Status(context.l10n.kitchenWaitingPickup);
      case 'delivered':
        return _Status(context.l10n.kitchenDelivered);
      case 'cancelled':
        return _Status(context.l10n.kitchenCancelled, color: theme.colorScheme.error);
      case 'voided':
        return _Status(context.l10n.kitchenVoided, color: theme.colorScheme.error);
      default:
        return _Status(item.state);
    }
  }
}

class _Status extends StatelessWidget {
  const _Status(this.text, {this.color});
  final String text;
  final Color? color;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: 130,
    child: Text(
      text,
      textAlign: TextAlign.end,
      style: Theme.of(context).textTheme.titleMedium?.copyWith(color: color, fontWeight: FontWeight.bold),
    ),
  );
}

class _Flag extends StatelessWidget {
  const _Flag(this.text, {required this.color});
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 4),
    child: Text(
      text,
      style: TextStyle(color: color, fontWeight: FontWeight.bold),
    ),
  );
}

/// K-03 / design §9: without a connection the kitchen sees nothing new, so staff must talk.
class _NoConnection extends StatelessWidget {
  const _NoConnection();
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    color: Colors.red.shade700,
    padding: const EdgeInsets.all(14),
    child: Text(
      context.l10n.kitchenNoConnection,
      style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
    ),
  );
}
