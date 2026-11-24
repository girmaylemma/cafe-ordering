/// Dish and option names in both languages (F4a, design 5.4): waiters and cooks call a dish by
/// either name, so both are shown (the widget: ui/dish_name.dart). Amharic
/// names are optional (D-67): without one, only English shows, never an empty line.
library;

bool _has(String? name) => name != null && name.isNotEmpty;

/// Dishes have English and Amharic names only (F4e, D-94). Languages written in Ge'ez letters show
/// the Amharic name first (Tigrinya readers read it); the others (English, Afaan Oromoo in Latin
/// letters) show the English name first.
const _amharicFirst = {'am', 'ti'};

/// The name to show first in the current language, English when there is no Amharic.
String primaryName(String en, String? am, String lang) => _amharicFirst.contains(lang) && _has(am) ? am! : en;

/// The name to show second, or null when the dish has no Amharic name.
String? secondaryName(String en, String? am, String lang) => !_has(am) ? null : (_amharicFirst.contains(lang) ? en : am);

/// One option for a line's option text: "Large · ትልቅ" (stored on the line, so English first).
/// A missing English name (never sent today) shows the Amharic one alone, never a crash.
String optionLabel(String en, String? am) => !_has(am) ? en : (en.isEmpty ? am! : '$en · $am');
