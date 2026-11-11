import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../auth/auth_controller.dart';
import '../texts.dart';

/// Waiter sign-in: tap your name, type your PIN (checked only by the server, D-10).
class PinScreen extends ConsumerStatefulWidget {
  const PinScreen({super.key, required this.state});
  final NeedsSignIn state;

  @override
  ConsumerState<PinScreen> createState() => _PinScreenState();
}

class _PinScreenState extends ConsumerState<PinScreen> {
  late Future<List<StaffMember>> _staff;
  StaffMember? _selected;
  final _pin = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _staff = ref.read(authControllerProvider.notifier).staff();
  }

  @override
  void dispose() {
    _pin.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    final user = _selected;
    if (user == null || _busy) return;
    setState(() => _busy = true);
    final pin = _pin.text;
    _pin.clear(); // never leave a PIN on screen, whatever happens
    await ref.read(authControllerProvider.notifier).signIn(user.id, pin);
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final error = widget.state.error;
    return Scaffold(
      appBar: AppBar(title: Text(widget.state.device.name)),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: _selected == null ? _whoAreYou(context) : _enterPin(context, error),
          ),
        ),
      ),
    );
  }

  Widget _whoAreYou(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Who are you?', style: Theme.of(context).textTheme.headlineMedium, textAlign: TextAlign.center),
        const SizedBox(height: 16),
        Expanded(
          child: FutureBuilder<List<StaffMember>>(
            future: _staff,
            builder: (context, snapshot) {
              if (snapshot.hasError) return Center(child: Text(errorText('NETWORK')));
              final staff = snapshot.data;
              if (staff == null) return const Center(child: CircularProgressIndicator());
              return ListView(
                children: [
                  for (final s in staff)
                    Card(
                      child: ListTile(
                        title: Text(s.name, style: const TextStyle(fontSize: 22)),
                        minTileHeight: 64, // big touch targets (design §5)
                        onTap: () => setState(() => _selected = s),
                      ),
                    ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _enterPin(BuildContext context, String? error) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(_selected!.name, style: Theme.of(context).textTheme.headlineMedium, textAlign: TextAlign.center),
        const SizedBox(height: 16),
        TextField(
          key: const Key('pin'),
          controller: _pin,
          autofocus: true,
          obscureText: true,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 32, letterSpacing: 12),
          decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'PIN'),
          onSubmitted: (_) => _signIn(),
        ),
        if (error != null) ...[
          const SizedBox(height: 12),
          Text(errorText(error, retryAfter: widget.state.retryAfter), style: TextStyle(color: Theme.of(context).colorScheme.error), textAlign: TextAlign.center),
        ],
        const SizedBox(height: 24),
        FilledButton(onPressed: _busy ? null : _signIn, child: const Padding(padding: EdgeInsets.all(12), child: Text('Sign in'))),
        TextButton(onPressed: () => setState(() => _selected = null), child: const Text('Not you? Choose another name')),
      ],
    );
  }
}
