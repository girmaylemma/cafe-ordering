import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth/auth_controller.dart';
import 'texts.dart';
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
      home: switch (auth) {
        AsyncData(:final value) => switch (value) {
            Unpaired(:final error) => PairScreen(error: error),
            NeedsSignIn() => PinScreen(key: ValueKey(value.device.id), state: value),
            SignedIn(:final user) => _Placeholder(title: 'Signed in as ${user.name}', signOut: true),
            StationReady(:final device) => _Placeholder(title: '${stationNames[device.stationId] ?? device.stationId} station'),
          },
        AsyncError() => const _Placeholder(title: 'Something went wrong. Restart the app.'),
        _ => const Scaffold(body: Center(child: CircularProgressIndicator())),
      },
    );
  }
}

/// F1a placeholder for the waiter and kitchen home screens (built in F2 and F3).
class _Placeholder extends ConsumerWidget {
  const _Placeholder({required this.title, this.signOut = false});
  final String title;
  final bool signOut;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title, style: Theme.of(context).textTheme.headlineMedium),
            if (signOut) ...[
              const SizedBox(height: 24),
              OutlinedButton(onPressed: () => ref.read(authControllerProvider.notifier).signOut(), child: const Text('Sign out')),
            ],
          ],
        ),
      ),
    );
  }
}
