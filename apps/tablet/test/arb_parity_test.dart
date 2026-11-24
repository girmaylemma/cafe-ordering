/// F4a/F4e: each translation (Amharic, Tigrinya, Afaan Oromoo) has every text of the English one,
/// with the same {placeholders}, and really translated. Flutter's gen-l10n does NOT fail on a missing translation: it silently
/// shows the English text (one console line). This test is what stops a half-English screen.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

Map<String, String> _texts(String file) {
  if (!File('lib/l10n/$file').existsSync()) return const {};
  final json = jsonDecode(File('lib/l10n/$file').readAsStringSync()) as Map<String, dynamic>;
  return {for (final e in json.entries) if (!e.key.startsWith('@')) e.key: e.value as String};
}

final _placeholder = RegExp(r'\{(\w+)');
Set<String> _placeholders(String text) => {for (final m in _placeholder.allMatches(text)) m.group(1)!};
final _ethiopic = RegExp(r'[ሀ-፿]');

void main() {
  final en = _texts('app_en.arb');

  // Each translation: its file, and how to tell it is really in that language (not English left in).
  final languages = <String, ({String file, String? Function(String key, String text) notTranslated})>{
    'Amharic': (file: 'app_am.arb', notTranslated: (key, text) => _ethiopic.hasMatch(text) ? null : 'no Ethiopic letters'),
    // Tigrinya is written in the same Ge'ez script as Amharic (F4e).
    'Tigrinya': (file: 'app_ti.arb', notTranslated: (key, text) => _ethiopic.hasMatch(text) ? null : 'no Ethiopic letters'),
    // Afaan Oromoo uses Latin letters (Qubee), so "not translated" means "the same as English".
    'Afaan Oromoo': (
      file: 'app_om.arb',
      notTranslated: (key, text) => _ethiopic.hasMatch(text)
          ? 'Ethiopic letters in an Oromo text'
          : (text == en[key] && !_sameInOromo.contains(key) ? 'the same as English' : null),
    ),
  };

  for (final MapEntry(key: language, value: (:file, :notTranslated)) in languages.entries) {
    group(language, () {
      final texts = _texts(file);

      test('has every English text, and nothing extra', () {
        expect(en.keys.toSet().difference(texts.keys.toSet()), isEmpty, reason: 'missing in $file');
        expect(texts.keys.toSet().difference(en.keys.toSet()), isEmpty, reason: 'only in $file');
      });

      test('every text keeps the same {placeholders}', () {
        final wrong = [
          for (final key in en.keys)
            if (texts[key] != null && !_setEquals(_placeholders(en[key]!), _placeholders(texts[key]!))) '$key: ${en[key]}  →  ${texts[key]}',
        ];
        expect(wrong, isEmpty, reason: wrong.join('\n'));
      });

      test('every text is really translated', () {
        final wrong = [
          for (final key in texts.keys)
            if (notTranslated(key, texts[key]!) case final why?) '$key ($why): ${texts[key]}',
        ];
        expect(wrong, isEmpty, reason: wrong.join('\n'));
      });
    });
  }
}

/// Oromo texts that are rightly the same word as in English.
const _sameInOromo = {'pinLabel'};

bool _setEquals(Set<String> a, Set<String> b) => a.length == b.length && a.containsAll(b);
