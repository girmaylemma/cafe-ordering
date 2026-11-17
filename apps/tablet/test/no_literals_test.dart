/// F4a guard: screens take every visible text from the ARB files (context.l10n), so no screen can
/// show English to someone who chose Amharic. Fails, listing file:line, when a screen file holds a
/// string literal with words in it that is not a data key or an error code.
///
/// Why every literal and not only `Text('...')`: visible texts also hide in maps
/// (`'ready': 'READY'`), enum labels, helper widgets (`_Status('Delivered')`) and ternaries.
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// A string literal, single or double quoted (no raw or multi-line strings are used in screens).
final _literal = RegExp(r'''(['"])((?:\\.|(?!\1).)*)\1''');

/// Interpolations: `${...}` and `$name` are values, not words.
final _interpolation = RegExp(r'\$\{[^}]*\}|\$[A-Za-z_]\w*');

final _word = RegExp(r'[A-Za-z]{2,}');

/// Data, not text: a single lowercase key ('seated', 'fav', 'open-sold-out', 'line-'), or a
/// server/connection error code ('NEEDS_CONNECTION').
final _key = RegExp(r'^[a-z][A-Za-z0-9_.\-]*$');
final _code = RegExp(r'^[A-Z][A-Z0-9]*_[A-Z0-9_]*$');
const _codesWithoutUnderscore = {'NETWORK', 'UNKNOWN'};

/// Texts that are the same in every language.
const _allowed = {'EN'};

String _withoutComment(String line) {
  final i = line.indexOf(RegExp(r'\s//\s'));
  return i < 0 ? line : line.substring(0, i);
}

void main() {
  test('screens contain no English text literals', () {
    final files = [
      ...Directory('lib/ui').listSync().whereType<File>().where((f) => f.path.endsWith('.dart')),
      File('lib/app.dart'),
    ];
    final found = <String>[];
    for (final file in files) {
      final lines = file.readAsLinesSync();
      for (var i = 0; i < lines.length; i++) {
        final line = lines[i].trim();
        if (line.startsWith('//') || line.startsWith('///') || line.startsWith('import ') || line.startsWith('export ')) continue;
        // Values inside ${...} are code (they may hold quoted keys like result['error']).
        for (final m in _literal.allMatches(_withoutComment(line).replaceAll(_interpolation, ''))) {
          final text = m.group(2)!;
          final words = text.replaceAll(_interpolation, '');
          if (_allowed.contains(text) || !_word.hasMatch(words)) continue;
          if (_key.hasMatch(words) || _code.hasMatch(words) || _codesWithoutUnderscore.contains(words)) continue;
          found.add('${file.path}:${i + 1}: $text');
        }
      }
    }
    expect(found, isEmpty, reason: '${found.length} English texts still in screens:\n${found.join('\n')}');
  });
}
