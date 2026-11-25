import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth/auth_controller.dart';
import 'l10n/l10n.dart';
import 'ui/alert_banner.dart';
import 'ui/floor_map_screen.dart';
import 'ui/kitchen_screen.dart';
import 'ui/pair_screen.dart';
import 'ui/pin_screen.dart';

/// The app's look. Ethiopic letters fall back to the bundled font, whatever the device has.
ThemeData appTheme() => ThemeData(colorSchemeSeed: const Color(0xFF0B6E4F), useMaterial3: true, fontFamilyFallback: const [ethiopicFont]);

/// Root widget: shows the right screen for who is using this tablet.
class CafeApp extends ConsumerWidget {
  const CafeApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    return MaterialApp(
      onGenerateTitle: (context) => context.l10n.appTitle,
      // The café's, the waiter's or the kitchen tablet's language (F4b, l10n/language.dart).
      locale: ref.watch(appLocaleProvider),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: appLocalizationsDelegates,
      theme: appTheme(),
      builder: (context, child) => AlertBanner(child: child!), // over every screen (F2c2)
      home: switch (auth) {
        AsyncData(:final value) => switch (value) {
            Unpaired(:final error) => PairScreen(error: error),
            NeedsSignIn() => PinScreen(key: ValueKey(value.device.id), state: value),
            SignedIn(:final user) => FloorMapScreen(user: user),
            MustChangePin() => const _Placeholder(), // the "choose your own PIN" screen comes next (M1a Task 3)
            StationReady(:final device) => KitchenScreen(device: device),
          },
        AsyncError() => const _Placeholder(),
        _ => const Scaffold(body: Center(child: CircularProgressIndicator())),
      },
    );
  }
}

/// Shown when something went wrong.
class _Placeholder extends ConsumerWidget {
  const _Placeholder();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(context.l10n.appError, style: Theme.of(context).textTheme.headlineMedium),
          ],
        ),
      ),
    );
  }
}
