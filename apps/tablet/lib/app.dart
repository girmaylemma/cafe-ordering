import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth/auth_controller.dart';
import 'ui/alert_banner.dart';
import 'ui/floor_map_screen.dart';
import 'ui/kitchen_screen.dart';
import 'ui/pair_screen.dart';
import 'ui/pin_screen.dart';

/// Root widget: shows the right screen for who is using this tablet.
class CafeApp extends ConsumerWidget {
  const CafeApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    return MaterialApp(
      title: 'Café',
      theme: ThemeData(colorSchemeSeed: const Color(0xFF0B6E4F), useMaterial3: true),
      builder: (context, child) => AlertBanner(child: child!), // over every screen (F2c2)
      home: switch (auth) {
        AsyncData(:final value) => switch (value) {
            Unpaired(:final error) => PairScreen(error: error),
            NeedsSignIn() => PinScreen(key: ValueKey(value.device.id), state: value),
            SignedIn(:final user) => FloorMapScreen(user: user),
            StationReady(:final device) => KitchenScreen(device: device),
          },
        AsyncError() => const _Placeholder(title: 'Something went wrong. Restart the app.'),
        _ => const Scaffold(body: Center(child: CircularProgressIndicator())),
      },
    );
  }
}

/// Shown when something went wrong.
class _Placeholder extends ConsumerWidget {
  const _Placeholder({required this.title});
  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title, style: Theme.of(context).textTheme.headlineMedium),
          ],
        ),
      ),
    );
  }
}
