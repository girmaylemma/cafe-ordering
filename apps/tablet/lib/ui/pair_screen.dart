import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_controller.dart';
import '../texts.dart';

/// First start: the manager adds the tablet in the dashboard and reads out a 6-digit code.
class PairScreen extends ConsumerStatefulWidget {
  const PairScreen({super.key, this.error});
  final String? error;

  @override
  ConsumerState<PairScreen> createState() => _PairScreenState();
}

class _PairScreenState extends ConsumerState<PairScreen> {
  final _code = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _pair() async {
    if (_busy) return;
    setState(() => _busy = true);
    await ref.read(authControllerProvider.notifier).pair(_code.text);
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Pair this tablet', style: Theme.of(context).textTheme.headlineMedium, textAlign: TextAlign.center),
                const SizedBox(height: 8),
                const Text('Ask the manager to add it in the dashboard, then type the 6-digit code.', textAlign: TextAlign.center),
                const SizedBox(height: 24),
                TextField(
                  key: const Key('pairing-code'),
                  controller: _code,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 32, letterSpacing: 8),
                  decoration: const InputDecoration(border: OutlineInputBorder(), hintText: '000000'),
                  onSubmitted: (_) => _pair(),
                ),
                if (widget.error != null) ...[
                  const SizedBox(height: 12),
                  Text(errorText(widget.error!), style: TextStyle(color: Theme.of(context).colorScheme.error), textAlign: TextAlign.center),
                ],
                const SizedBox(height: 24),
                FilledButton(onPressed: _busy ? null : _pair, child: const Padding(padding: EdgeInsets.all(12), child: Text('Pair'))),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
