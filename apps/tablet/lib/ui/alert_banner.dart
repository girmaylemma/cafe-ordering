import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../alerts/waiter_alerts.dart';
import '../session/providers.dart';

/// Shows the waiter's alerts as a banner at the top, over every screen (placed in
/// MaterialApp.builder). The newest alert replaces the one shown; a tap hides it.
class AlertBanner extends ConsumerStatefulWidget {
  const AlertBanner({super.key, required this.child});
  final Widget child;

  @override
  ConsumerState<AlertBanner> createState() => _AlertBannerState();
}

class _AlertBannerState extends ConsumerState<AlertBanner> {
  Alert? _shown;
  Timer? _hide;

  void _show(Alert alert) {
    _hide?.cancel();
    // Ready matters most: it stays longer. The table screen shows every state anyway.
    _hide = Timer(alert.sound == AlertSound.loud ? const Duration(seconds: 15) : const Duration(seconds: 6), _dismiss);
    setState(() => _shown = alert);
  }

  void _dismiss() {
    _hide?.cancel();
    if (mounted) setState(() => _shown = null);
  }

  @override
  void dispose() {
    _hide?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(alertsProvider, (_, next) {
      final alert = next.value;
      if (alert != null) _show(alert);
    });
    final alert = _shown;
    final scheme = Theme.of(context).colorScheme;
    final (background, foreground) = switch (alert?.sound) {
      AlertSound.loud => (Colors.orange.shade800, Colors.white),
      AlertSound.soft => (scheme.primaryContainer, scheme.onPrimaryContainer),
      _ => (scheme.secondaryContainer, scheme.onSecondaryContainer),
    };

    return Stack(
      children: [
        widget.child,
        if (alert != null)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Material(
              key: const Key('alert-banner'),
              color: background,
              elevation: 6,
              child: InkWell(
                onTap: _dismiss,
                child: SafeArea(
                  bottom: false,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    child: Row(
                      children: [
                        Icon(alert.sound == AlertSound.loud ? Icons.notifications_active : Icons.info_outline, color: foreground),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            alert.text,
                            style: TextStyle(color: foreground, fontSize: 18, fontWeight: alert.sound == AlertSound.loud ? FontWeight.w900 : FontWeight.w600),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
