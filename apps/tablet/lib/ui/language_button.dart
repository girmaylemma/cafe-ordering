/// The one-tap language switch (F4b): it names the OTHER language, the one a tap switches to.
library;

import 'package:flutter/material.dart';

import '../l10n/l10n.dart';

class LanguageButton extends StatelessWidget {
  const LanguageButton({super.key = const Key('language-button'), required this.current, required this.onChanged});

  /// The language shown now: 'am' or 'en'.
  final String current;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final other = current == 'am' ? 'en' : 'am';
    return Tooltip(
      message: context.l10n.languageSwitch,
      child: TextButton(
        style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
        onPressed: () => onChanged(other),
        // Each language's own short name, the same in both languages.
        child: Text(other == 'am' ? 'አማ' : 'EN', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
      ),
    );
  }
}
