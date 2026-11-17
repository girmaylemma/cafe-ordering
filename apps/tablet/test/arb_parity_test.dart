/// F4a: the Amharic file has every text of the English one, with the same {placeholders}, and
/// really in Amharic. Flutter's gen-l10n does NOT fail on a missing translation: it silently
/// shows the English text (one console line). This test is what stops a half-English screen.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

Map<String, String> _texts(String file) {
  final json = jsonDecode(File('lib/l10n/$file').readAsStringSync()) as Map<String, dynamic>;
  return {for (final e in json.entries) if (!e.key.startsWith('@')) e.key: e.value as String};
}

final _placeholder = RegExp(r'\{(\w+)');
Set<String> _placeholders(String text) => {for (final m in _placeholder.allMatches(text)) m.group(1)!};
final _ethiopic = RegExp(r'[ሀ-፿]');

void main() {
  final en = _texts('app_en.arb');
  final am = _texts('app_am.arb');

  test('Amharic has every English text, and nothing extra', () {
    expect(en.keys.toSet().difference(am.keys.toSet()), isEmpty, reason: 'missing in app_am.arb');
    expect(am.keys.toSet().difference(en.keys.toSet()), isEmpty, reason: 'only in app_am.arb');
  });

  test('every Amharic text keeps the same {placeholders}', () {
    final wrong = [
      for (final key in en.keys)
        if (am[key] != null && !_setEquals(_placeholders(en[key]!), _placeholders(am[key]!))) '$key: ${en[key]}  →  ${am[key]}',
    ];
    expect(wrong, isEmpty, reason: wrong.join('\n'));
  });

  test('every Amharic text is written in Amharic', () {
    final english = [for (final key in am.keys) if (!_ethiopic.hasMatch(am[key]!)) '$key: ${am[key]}'];
    expect(english, isEmpty, reason: english.join('\n'));
  });
}

bool _setEquals(Set<String> a, Set<String> b) => a.length == b.length && a.containsAll(b);
