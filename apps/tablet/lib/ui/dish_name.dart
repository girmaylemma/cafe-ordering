/// A dish name in both languages: the current one big, the other small under it (F4a).
library;

import 'package:flutter/material.dart';

import '../l10n/names.dart';

/// A dish name as shown everywhere: "2× Tibs" with "ጥብስ" small under it.
class DishName extends StatelessWidget {
  const DishName({super.key, required this.en, this.am, this.qty, this.style, this.struck = false});

  final String en;
  final String? am;
  final int? qty;
  final TextStyle? style;

  /// Crossed out (a cancelled or voided line).
  final bool struck;

  @override
  Widget build(BuildContext context) {
    final lang = Localizations.localeOf(context).languageCode;
    final primary = primaryName(en, am, lang);
    final secondary = secondaryName(en, am, lang);
    final strike = struck ? const TextStyle(decoration: TextDecoration.lineThrough) : const TextStyle();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(qty == null ? primary : '$qty× $primary', style: (style ?? const TextStyle()).merge(strike)),
        if (secondary != null) Text(secondary, style: TextStyle(color: Theme.of(context).colorScheme.outline).merge(strike)),
      ],
    );
  }
}
