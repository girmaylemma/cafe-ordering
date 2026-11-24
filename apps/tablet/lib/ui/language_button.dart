/// The language button (F4b, four languages since F4e): it shows the current language; a tap opens
/// the list of all of them, each in its own name, so anyone can find theirs whatever is on screen.
library;

import 'package:flutter/material.dart';

import '../l10n/l10n.dart';

class LanguageButton extends StatelessWidget {
  const LanguageButton({super.key = const Key('language-button'), required this.current, required this.onChanged});

  /// The language shown now: 'en', 'am', 'om' or 'ti'.
  final String current;

  /// Called only when another language is chosen.
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      tooltip: context.l10n.languageSwitch,
      onSelected: (language) {
        if (language != current) onChanged(language);
      },
      itemBuilder: (_) => [
        for (final MapEntry(key: language, value: name) in languageNames.entries)
          CheckedPopupMenuItem(value: language, checked: language == current, child: Text(name)),
      ],
      // At least 48 dp: a quick tap with one hand.
      child: ConstrainedBox(
        constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
        child: Center(
          widthFactor: 1,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              languageShortNames[current] ?? current,
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Theme.of(context).colorScheme.primary),
            ),
          ),
        ),
      ),
    );
  }
}
