import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/api_client.dart';
import '../sync/commands.dart';
import '../texts.dart';

/// Void an item the kitchen already accepted (D-57): a reason, and a manager's approval.
/// A signed-in manager approves it themselves; a waiter picks a manager who types their PIN.
///
/// The dialog sends the command itself, so a wrong PIN keeps it open (the reason stays typed).
/// Returns true when the item was voided.
Future<bool> showVoidDialog(
  BuildContext context, {
  required String itemName,
  required bool signedInAsManager,
  required List<StaffMember> managers,
  required Future<ActionResult> Function(String reason, ManagerApproval? approval) send,
}) async =>
    await showDialog<bool>(
      context: context,
      builder: (_) => _VoidDialog(itemName: itemName, signedInAsManager: signedInAsManager, managers: managers, send: send),
    ) ??
    false;

class _VoidDialog extends StatefulWidget {
  const _VoidDialog({required this.itemName, required this.signedInAsManager, required this.managers, required this.send});
  final String itemName;
  final bool signedInAsManager;
  final List<StaffMember> managers;
  final Future<ActionResult> Function(String reason, ManagerApproval? approval) send;

  @override
  State<_VoidDialog> createState() => _VoidDialogState();
}

class _VoidDialogState extends State<_VoidDialog> {
  final _reason = TextEditingController();
  final _pin = TextEditingController();
  String? _managerId;
  String? _error;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _reason.addListener(() => setState(() {}));
    _pin.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _reason.dispose();
    _pin.dispose();
    super.dispose();
  }

  bool get _ready =>
      !_sending && _reason.text.trim().isNotEmpty && (widget.signedInAsManager || (_managerId != null && RegExp(r'^\d{6}$').hasMatch(_pin.text)));

  Future<void> _submit() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    final approval = widget.signedInAsManager ? null : ManagerApproval(managerId: _managerId!, managerPin: _pin.text);
    final result = await widget.send(_reason.text.trim(), approval);
    if (!mounted) return;
    if (result.ok) {
      Navigator.of(context).pop(true);
      return;
    }
    setState(() {
      _sending = false;
      _error = errorText(result.error!, retryAfter: result.retryAfter);
      _pin.clear(); // never leave a PIN on screen after a refusal
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Void ${widget.itemName}'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              key: const Key('void-reason'),
              controller: _reason,
              maxLength: 200,
              decoration: const InputDecoration(labelText: 'Reason (e.g. customer left, wrong item)'),
            ),
            if (!widget.signedInAsManager) ...[
              const SizedBox(height: 8),
              const Text('Manager'),
              Wrap(
                spacing: 8,
                children: [
                  for (final m in widget.managers)
                    ChoiceChip(label: Text(m.name), selected: _managerId == m.id, onSelected: (_) => setState(() => _managerId = m.id)),
                ],
              ),
              if (widget.managers.isEmpty) const Text('No manager found. Connect to the internet and try again.'),
              TextField(
                key: const Key('void-pin'),
                controller: _pin,
                obscureText: true,
                keyboardType: TextInputType.number,
                maxLength: 6,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(labelText: "Manager's 6-digit PIN"),
              ),
            ],
            if (_error != null) Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _sending ? null : () => Navigator.of(context).pop(false), child: const Text('Back')),
        FilledButton(onPressed: _ready ? _submit : null, child: const Text('Void item')),
      ],
    );
  }
}
