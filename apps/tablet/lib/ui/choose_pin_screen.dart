/// M1a: choosing your own PIN. After signing in with a PIN someone else set (a new person, or a
/// reset), the person must choose one only they know before anything else (ChoosePinScreen).
/// Anyone can also change their own PIN from the floor map (showChangePinDialog).
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../auth/auth_controller.dart';
import '../l10n/l10n.dart';
import '../texts.dart';

/// Waiters: 4–6 digits; managers: exactly 6 (their PIN approves voids, D-11). The server checks again.
bool _followsRule(String role, String pin) => role == 'waiter' ? RegExp(r'^\d{4,6}$').hasMatch(pin) : RegExp(r'^\d{6}$').hasMatch(pin);

String _ruleText(AppLocalizations t, String role) => role == 'waiter' ? t.pinRuleWaiter : t.pinRuleManager;

/// The screen after a temporary PIN: new PIN twice, then Save. Nothing else is reachable.
class ChoosePinScreen extends ConsumerStatefulWidget {
  const ChoosePinScreen({super.key, required this.state});
  final MustChangePin state;

  @override
  ConsumerState<ChoosePinScreen> createState() => _ChoosePinScreenState();
}

class _ChoosePinScreenState extends ConsumerState<ChoosePinScreen> {
  final _fields = _NewPinFields();
  String? _mismatch;
  bool _busy = false;

  @override
  void didUpdateWidget(ChoosePinScreen old) {
    super.didUpdateWidget(old);
    // A refused choice: clear both fields, so nobody types after a half-kept PIN.
    if (widget.state.error != null && widget.state != old.state) _fields.clear();
  }

  @override
  void dispose() {
    _fields.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_fields.newPin != _fields.again) {
      setState(() => _mismatch = context.l10n.pinMismatch);
      return;
    }
    setState(() {
      _mismatch = null;
      _busy = true;
    });
    await ref.read(authControllerProvider.notifier).choosePin(_fields.newPin);
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.l10n;
    final role = widget.state.user.role;
    final error = _mismatch ?? (widget.state.error == null ? null : errorText(t, widget.state.error!));
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: ListView(
              padding: const EdgeInsets.all(24),
              shrinkWrap: true,
              children: [
                Text(t.pinChooseTitle, style: Theme.of(context).textTheme.headlineMedium, textAlign: TextAlign.center),
                const SizedBox(height: 8),
                Text(widget.state.user.name, style: Theme.of(context).textTheme.titleLarge, textAlign: TextAlign.center),
                const SizedBox(height: 12),
                Text(t.pinChooseHelp, textAlign: TextAlign.center),
                const SizedBox(height: 24),
                _fields.build(context, role, onChanged: () => setState(() => _mismatch = null)),
                if (error != null) ...[
                  const SizedBox(height: 12),
                  Text(error, style: TextStyle(color: Theme.of(context).colorScheme.error), textAlign: TextAlign.center),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  key: const Key('pin-save'),
                  onPressed: _busy || !_fields.ready(role) ? null : _save,
                  child: Padding(padding: const EdgeInsets.all(12), child: Text(t.pinSave)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// "Change my PIN" from the floor map: current PIN, then the new one twice.
Future<void> showChangePinDialog(BuildContext context, StaffMember user) async {
  final changed = await showDialog<bool>(context: context, builder: (_) => _ChangePinDialog(user: user));
  if (changed == true && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.pinChanged)));
  }
}

class _ChangePinDialog extends ConsumerStatefulWidget {
  const _ChangePinDialog({required this.user});
  final StaffMember user;
  @override
  ConsumerState<_ChangePinDialog> createState() => _ChangePinDialogState();
}

class _ChangePinDialogState extends ConsumerState<_ChangePinDialog> {
  final _current = TextEditingController();
  final _fields = _NewPinFields();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _current.dispose();
    _fields.dispose();
    super.dispose();
  }

  bool get _ready => _current.text.isNotEmpty && _fields.ready(widget.user.role);

  Future<void> _save() async {
    final t = context.l10n;
    if (_fields.newPin != _fields.again) {
      setState(() => _error = t.pinMismatch);
      return;
    }
    setState(() {
      _error = null;
      _busy = true;
    });
    final code = await ref.read(authControllerProvider.notifier).changeMyPin(_current.text, _fields.newPin);
    if (!mounted) return;
    if (code == null) {
      Navigator.of(context).pop(true);
      return;
    }
    setState(() {
      _busy = false;
      _error = errorText(context.l10n, code);
      _current.clear();
      _fields.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = context.l10n;
    return AlertDialog(
      title: Text(t.floorChangePin),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _pinField(const Key('current-pin'), _current, t.pinCurrent, onChanged: () => setState(() => _error = null)),
            const SizedBox(height: 12),
            _fields.build(context, widget.user.role, onChanged: () => setState(() => _error = null)),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(t.commonCancel)),
        FilledButton(key: const Key('pin-save'), onPressed: _busy || !_ready ? null : _save, child: Text(t.pinSave)),
      ],
    );
  }
}

/// The new PIN, typed twice, with the role's rule under it.
class _NewPinFields {
  final _new = TextEditingController();
  final _again = TextEditingController();

  String get newPin => _new.text;
  String get again => _again.text;
  bool ready(String role) => _followsRule(role, newPin) && _followsRule(role, again);

  void clear() {
    _new.clear();
    _again.clear();
  }

  void dispose() {
    _new.dispose();
    _again.dispose();
  }

  Widget build(BuildContext context, String role, {required VoidCallback onChanged}) {
    final t = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _pinField(const Key('new-pin'), _new, t.pinNew, onChanged: onChanged),
        const SizedBox(height: 12),
        _pinField(const Key('new-pin-again'), _again, t.pinNewAgain, onChanged: onChanged),
        const SizedBox(height: 6),
        Text(_ruleText(t, role), style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

Widget _pinField(Key key, TextEditingController controller, String label, {required VoidCallback onChanged}) => TextField(
      key: key,
      controller: controller,
      obscureText: true,
      keyboardType: TextInputType.number,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
      textAlign: TextAlign.center,
      style: const TextStyle(fontSize: 24, letterSpacing: 8),
      decoration: InputDecoration(border: const OutlineInputBorder(), labelText: label),
      onChanged: (_) => onChanged(),
    );
