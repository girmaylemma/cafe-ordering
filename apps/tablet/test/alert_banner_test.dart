import 'dart:async';

import 'package:cafe_tablet/alerts/waiter_alerts.dart';
import 'package:cafe_tablet/session/providers.dart';
import 'package:cafe_tablet/ui/alert_banner.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

Future<StreamController<Alert>> pumpBanner(WidgetTester tester) async {
  final alerts = StreamController<Alert>();
  addTearDown(alerts.close);
  await tester.pumpWidget(ProviderScope(
    overrides: [alertsProvider.overrideWith((ref) => alerts.stream)],
    child: MaterialApp(
      builder: (context, child) => AlertBanner(child: child!),
      home: const Scaffold(body: Text('any screen')),
    ),
  ));
  return alerts;
}

/// The stream event reaches the listener in one frame; its setState draws in the next.
Future<void> shown(WidgetTester tester) async {
  await tester.pump();
  await tester.pump();
}

void main() {
  testWidgets('an alert shows on top of whatever screen is open', (tester) async {
    final alerts = await pumpBanner(tester);

    alerts.add(const Alert(AlertSound.loud, 'Table 7 — ready: 2× Shiro', tableId: 't7'));
    await shown(tester);

    expect(find.text('Table 7 — ready: 2× Shiro'), findsOneWidget);
    expect(find.text('any screen'), findsOneWidget);
    await tester.pump(const Duration(minutes: 1)); // let the hide timer finish
  });

  testWidgets('a newer alert replaces the one shown', (tester) async {
    final alerts = await pumpBanner(tester);

    alerts.add(const Alert(AlertSound.soft, 'Table 7 — kitchen accepted: 1× Tibs'));
    await shown(tester);
    alerts.add(const Alert(AlertSound.loud, 'Table 8 — ready: 1× Shiro'));
    await shown(tester);

    expect(find.text('Table 7 — kitchen accepted: 1× Tibs'), findsNothing);
    expect(find.text('Table 8 — ready: 1× Shiro'), findsOneWidget);
    await tester.pump(const Duration(minutes: 1));
  });

  testWidgets('tapping the banner hides it', (tester) async {
    final alerts = await pumpBanner(tester);
    alerts.add(const Alert(AlertSound.loud, 'Table 7 — ready: 2× Shiro'));
    await shown(tester);

    await tester.tap(find.byKey(const Key('alert-banner')));
    await tester.pump();

    expect(find.byKey(const Key('alert-banner')), findsNothing);
  });

  testWidgets('it hides by itself: Ready after 15 s, others after 6 s', (tester) async {
    final alerts = await pumpBanner(tester);
    alerts.add(const Alert(AlertSound.soft, 'Table 7 — kitchen accepted: 1× Tibs'));
    await shown(tester);
    await tester.pump(const Duration(seconds: 6));
    expect(find.byKey(const Key('alert-banner')), findsNothing);

    alerts.add(const Alert(AlertSound.loud, 'Table 7 — ready: 1× Tibs'));
    await shown(tester);
    await tester.pump(const Duration(seconds: 6));
    expect(find.byKey(const Key('alert-banner')), findsOneWidget); // Ready stays longer
    await tester.pump(const Duration(seconds: 9));
    expect(find.byKey(const Key('alert-banner')), findsNothing);
  });
}
