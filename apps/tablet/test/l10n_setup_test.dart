/// F4a: the app has English and Amharic texts, Flutter's own widgets speak Amharic too, and
/// Ethiopic letters always use the bundled font (no □□□ on tablets without one).
library;

import 'package:cafe_tablet/app.dart';
import 'package:cafe_tablet/l10n/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  test('the app offers English and Amharic', () {
    expect(AppLocalizations.supportedLocales.map((l) => l.languageCode), containsAll(['en', 'am']));
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
}
