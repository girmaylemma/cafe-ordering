/// F4a: the app has English and Amharic texts, Flutter's own widgets speak Amharic too, and
/// Ethiopic letters always use the bundled font (no □□□ on tablets without one).
library;

import 'package:cafe_tablet/app.dart';
import 'package:cafe_tablet/l10n/l10n.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  test('the app offers English, Amharic, Afaan Oromoo and Tigrinya', () {
    expect(AppLocalizations.supportedLocales.map((l) => l.languageCode), unorderedEquals(['en', 'am', 'om', 'ti']));
  });

  test('Amharic texts exist for the app title', () {
    expect(lookupAppLocalizations(const Locale('am')).appTitle, isNot(lookupAppLocalizations(const Locale('en')).appTitle));
  });

  test('the theme falls back to the bundled Ethiopic font', () {
    expect(appTheme().textTheme.bodyMedium!.fontFamilyFallback, contains('NotoSansEthiopic'));
  });

  testWidgets('Flutter widgets speak Amharic too', (tester) async {
    late String ok;
    await tester.pumpWidget(localizedApp(
      locale: const Locale('am'),
      home: Builder(builder: (context) {
        ok = MaterialLocalizations.of(context).okButtonLabel;
        return const SizedBox();
      }),
    ));
    expect(ok, isNot('OK'));
  });

  // F4e: Flutter ships no texts of its own for Afaan Oromoo or Tigrinya. Without a fallback, the
  // first built-in button or date picker would fail ("No MaterialLocalizations found").
  for (final language in ['om', 'ti']) {
    testWidgets("in '$language': our texts in $language, Flutter's own widgets in English", (tester) async {
      late String ours, material, cupertino;
      late TextDirection direction;
      await tester.pumpWidget(MaterialApp(
        locale: Locale(language),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: appLocalizationsDelegates,
        home: Builder(builder: (context) {
          ours = context.l10n.appTitle;
          material = MaterialLocalizations.of(context).okButtonLabel;
          cupertino = CupertinoLocalizations.of(context).cutButtonLabel;
          direction = Directionality.of(context);
          return const SizedBox();
        }),
      ));

      expect(tester.takeException(), isNull);
      expect(ours, lookupAppLocalizations(Locale(language)).appTitle);
      expect(ours, isNot('Café'));
      expect(material, 'OK');
      expect(cupertino, 'Cut');
      expect(direction, TextDirection.ltr); // Ge'ez and Qubee are both written left to right
    });
  }
}
