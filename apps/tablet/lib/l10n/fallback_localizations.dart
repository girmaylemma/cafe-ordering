/// Flutter's own texts (OK, Cut, date pickers, text direction) for languages Flutter does not
/// ship: Afaan Oromoo and Tigrinya (F4e, D-94). Our own texts come from app_om.arb / app_ti.arb;
/// only Flutter's few built-in ones fall back to English, so nothing fails to load.
library;

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

/// The app's languages that Flutter has no built-in texts for.
const flutterFallbackLanguages = {'om', 'ti'};

/// Flutter's built-in texts in English, offered only for [flutterFallbackLanguages]. For every
/// other language Flutter's own delegate answers first (Localizations uses the first delegate
/// that supports the locale, per type).
const englishFallbackDelegates = <LocalizationsDelegate<dynamic>>[
  _EnglishFallback<MaterialLocalizations>(GlobalMaterialLocalizations.delegate),
  _EnglishFallback<CupertinoLocalizations>(GlobalCupertinoLocalizations.delegate),
  _EnglishFallback<WidgetsLocalizations>(GlobalWidgetsLocalizations.delegate),
];

class _EnglishFallback<T> extends LocalizationsDelegate<T> {
  const _EnglishFallback(this._flutters);
  final LocalizationsDelegate<T> _flutters;

  @override
  bool isSupported(Locale locale) => flutterFallbackLanguages.contains(locale.languageCode);

  @override
  Future<T> load(Locale locale) => _flutters.load(const Locale('en'));

  @override
  bool shouldReload(_EnglishFallback<T> old) => false;
}
