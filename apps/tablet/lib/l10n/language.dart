/// Which language the app speaks (F4b, design 5.1):
///
///   Waiter tablet, signed in:  the waiter's own choice ?? the café's ?? English
///   Waiter tablet, PIN screen: the café's ?? English (nobody is signed in)
///   Kitchen/bar tablet:        the tablet's own choice ?? the café's ?? English
///   Unpaired tablet:           English (the café is not known yet)
///
/// The values live in the tablet's database (see AppDatabase "languages"), so switching never
/// waits for the network.
library;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_controller.dart';
import '../providers.dart';
import 'app_localizations.dart';

const supportedLanguages = {'en', 'am', 'om', 'ti'};

/// Each language in its own name (the same whatever language the app shows), in list order (F4e).
const languageNames = {'en': 'English', 'am': 'አማርኛ', 'om': 'Afaan Oromoo', 'ti': 'ትግርኛ'};

/// Short names for the button that shows the current language.
const languageShortNames = {'en': 'EN', 'am': 'አማ', 'om': 'OM', 'ti': 'ትግ'};

String? _known(String? language) => supportedLanguages.contains(language) ? language : null;

/// The rule above, as one pure function (unknown values count as "no choice").
String resolveLanguage({
  required bool paired,
  required bool isKitchen,
  required String? signedInUserId,
  required String? myLanguage,
  required String? kitchenLanguage,
  required String? cafeLanguage,
}) {
  if (!paired) return 'en';
  final cafe = _known(cafeLanguage);
  if (isKitchen) return _known(kitchenLanguage) ?? cafe ?? 'en';
  if (signedInUserId != null) return _known(myLanguage) ?? cafe ?? 'en';
  return cafe ?? 'en';
}

/// The texts of one language, for code without a screen (alerts, the notification).
AppLocalizations languageTexts(String language) => lookupAppLocalizations(Locale(_known(language) ?? 'en'));

final _cafeLanguageProvider = StreamProvider<String?>((ref) => ref.watch(databaseProvider).watchCafeLanguage());
final _kitchenLanguageProvider = StreamProvider<String?>((ref) => ref.watch(databaseProvider).watchKitchenLanguage());
final _myLanguageProvider = StreamProvider.family<({String? language, bool pending}), String>(
  (ref, userId) => ref.watch(databaseProvider).watchMyLanguage(userId),
);

/// "The texts in the app's language right now", for code without a screen that rings later
/// (alerts, the background notification). A long-lived provider, so the function never uses a
/// disposed Ref; it reads the current language each time it is called.
final appTextsProvider = Provider<AppLocalizations Function()>(
  (ref) => () => languageTexts(ref.read(appLocaleProvider).languageCode),
);

/// The app's language now. Recomputed when someone signs in or out, or a stored value changes.
final appLocaleProvider = Provider<Locale>((ref) {
  final auth = ref.watch(authControllerProvider).value;
  final cafe = ref.watch(_cafeLanguageProvider).value;
  final language = switch (auth) {
    null || Unpaired() => resolveLanguage(paired: false, isKitchen: false, signedInUserId: null, myLanguage: null, kitchenLanguage: null, cafeLanguage: cafe),
    StationReady() => resolveLanguage(
        paired: true,
        isKitchen: true,
        signedInUserId: null,
        myLanguage: null,
        kitchenLanguage: ref.watch(_kitchenLanguageProvider).value,
        cafeLanguage: cafe,
      ),
    NeedsSignIn() => resolveLanguage(paired: true, isKitchen: false, signedInUserId: null, myLanguage: null, kitchenLanguage: null, cafeLanguage: cafe),
    SignedIn(:final user) => resolveLanguage(
        paired: true,
        isKitchen: false,
        signedInUserId: user.id,
        myLanguage: ref.watch(_myLanguageProvider(user.id)).value?.language,
        kitchenLanguage: null,
        cafeLanguage: cafe,
      ),
  };
  return Locale(language);
});
