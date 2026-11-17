/// Dish and option names in both languages (F4a, design 5.4): waiters and cooks call a dish by
/// either name, so both are shown (the widget: ui/dish_name.dart). Amharic
/// names are optional (D-67): without one, only English shows, never an empty line.
library;

bool _has(String? name) => name != null && name.isNotEmpty;

/// The name in the current language (`lang` is 'am' or 'en'), English when there is no Amharic.
String primaryName(String en, String? am, String lang) => lang == 'am' && _has(am) ? am! : en;

/// The name in the other language, or null when the dish has no Amharic name.
String? secondaryName(String en, String? am, String lang) => !_has(am) ? null : (lang == 'am' ? en : am);

/// One option for a line's option text: "Large · ትልቅ" (stored on the line, so English first).
String optionLabel(String en, String? am) => _has(am) ? '$en · $am' : en;
