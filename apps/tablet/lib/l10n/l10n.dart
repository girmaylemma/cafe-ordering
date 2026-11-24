/// Texts in the user's language (F4a). Screens use `context.l10n.someText`; code without a
/// BuildContext (alerts, the background notification) is given an `AppLocalizations Function()`.
library;

import 'package:flutter/widgets.dart';

import 'app_localizations.dart';
import 'fallback_localizations.dart';

export 'app_localizations.dart';
export 'language.dart' show appLocaleProvider, appTextsProvider, languageTexts, resolveLanguage, supportedLanguages;

extension L10n on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);
}

/// Every translation the app loads: ours and Flutter's own (buttons, date pickers, text direction),
/// with English built-in texts for the languages Flutter does not ship (F4e).
const List<LocalizationsDelegate<dynamic>> appLocalizationsDelegates = [
  ...AppLocalizations.localizationsDelegates,
  ...englishFallbackDelegates,
];

/// English texts, for code that runs without a screen (until F4b chooses the language).
AppLocalizations englishTexts() => lookupAppLocalizations(const Locale('en'));

/// The bundled font for Ethiopic letters (pubspec.yaml `fonts:`), used as a fallback only.
const ethiopicFont = 'NotoSansEthiopic';
