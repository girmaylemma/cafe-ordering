// The kitchen screen (F3a): tickets, Accept / Ready per item, 10 s undo, "No connection".
import 'dart:convert';

import 'package:cafe_tablet/api/api_client.dart';
import 'package:cafe_tablet/data/database.dart';
import 'package:cafe_tablet/providers.dart';
import 'package:cafe_tablet/session/providers.dart';
import 'package:cafe_tablet/session/work_session.dart';
import 'package:cafe_tablet/sync/server_clock.dart';
import 'package:cafe_tablet/ui/kitchen_screen.dart';
import 'package:cafe_tablet/ui/screen_awake.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'alerts_test.dart' show FakeOutput;
import 'fakes.dart';
import 'tickets_db_test.dart' show sent;

const kitchen = DeviceInfo(id: 'k1', name: 'Kitchen tablet', kind: DeviceKind.station, stationId: 'kitchen');

ApiClient api() => ApiClient(
      MockClient((r) async => switch (r.url.path) {
            '/menu' => http.Response(jsonEncode({'categories': <Object>[], 'items': <Object>[], 'optionGroups': <Object>[]}), 200),
            '/tables' => http.Response(jsonEncode({'tables': <Object>[]}), 200),
            '/staff' => http.Response(jsonEncode({'staff': <Object>[]}), 200),
            _ => http.Response('{}', 404),
          }),
      Uri.parse('http://server'),
    );

Future<void> settled(WidgetTester tester) async {
  await tester.runAsync(settle);
  await tester.pump();
}

/// Records whether the kitchen screen asked to stay on (the real one is the wakelock plugin).
class FakeScreenAwake implements ScreenAwake {
  bool on = false;
  final calls = <String>[];
  @override
  Future<void> keepOn() async {
    on = true;
    calls.add('on');
  }

  @override
  Future<void> allowSleep() async {
    on = false;
    calls.add('off');
  }
}

late FakeScreenAwake screenAwake;

/// The tablet's clock in these tests (the server clock offset stays 0: no catch-up says otherwise).
var clockNow = DateTime(2026, 11, 17, 12);
int minutesAgo(num m) => clockNow.subtract(Duration(seconds: (m * 60).round())).millisecondsSinceEpoch;

/// The kitchen screen with these events already received. Online unless [online] is false.
Future<(AppDatabase, FakeSocket?)> pumpKitchen(WidgetTester tester, List<Map<String, dynamic>> events, {bool online = true}) async {
  final db = memoryDb();
  final socket = online ? FakeSocket() : null;
  final session = WorkSession(
    api: api(),
    db: db,
    device: kitchen,
    deviceToken: 't',
    connect: FakeServer([?socket]).connect,
    delay: (_) async {},
    alertOutput: FakeOutput(),
    clock: ServerClock(now: () => clockNow),
  );
  await tester.runAsync(() async {
    for (final e in events) {
      await db.applyTicketEvent(e);
    }
    await session.start();
    await settle();
  });
  addTearDown(() async {
    await session.stop();
    await db.close();
  });
  await tester.pumpWidget(ProviderScope(
    overrides: [
      databaseProvider.overrideWithValue(db),
      workSessionProvider.overrideWith((ref) async => session),
      screenAwakeProvider.overrideWithValue(screenAwake),
    ],
    child: localizedApp(home: const KitchenScreen(device: kitchen)),
  ));
  await settled(tester);
  return (db, socket);
}

/// The server's event for a tap, as the kitchen receives it back.
void push(FakeSocket socket, String itemId, String type, String to) => socket.receive({
      'type': 'event',
      'event': {'seq': 9, 'orderId': 'o1', 'itemId': itemId, 'stationId': 'kitchen', 'type': type, 'to': to, 'at': 2000},
    });

Map<String, dynamic> lastCommand(FakeSocket socket) => socket.sent.lastWhere((m) => m['type'] != 'sync');

void main() {
  setUp(() {
    clockNow = DateTime(2026, 11, 17, 12);
    screenAwake = FakeScreenAwake();
  });

  group('readable and always on (K-07)', () {
    testWidgets('the screen stays on while the kitchen screen is shown, and may sleep after', (tester) async {
      await pumpKitchen(tester, []);
      expect(screenAwake.on, isTrue);

      await unmountAndFlush(tester);
      expect(screenAwake.calls, ['on', 'off']);
    });

    testWidgets('text is at least 1.3x larger than normal, to be read from 2 m', (tester) async {
      await pumpKitchen(tester, [sent('i1')]);

      final scaler = MediaQuery.textScalerOf(tester.element(find.text('2× Shiro')));
      expect(scaler.scale(20), greaterThanOrEqualTo(26));
      await unmountAndFlush(tester);
    });

    testWidgets('a tablet already set to huge text keeps its own (larger) size', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2.0;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await pumpKitchen(tester, [sent('i1')]);

      final scaler = MediaQuery.textScalerOf(tester.element(find.text('2× Shiro')));
      expect(scaler.scale(20), 40);
      await unmountAndFlush(tester);
    });

    testWidgets('a full ticket still fits a 10-inch tablet without overflowing', (tester) async {
      tester.view.physicalSize = const Size(1280, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await pumpKitchen(tester, [
        sent('i1', extra: {'flag': 'sold_out', 'sentWhileOffline': true, 'note': 'no onion, extra spicy, well done please'}),
        sent('i2', extra: {'name': 'Special family tibs with injera'}),
      ]);

      expect(tester.takeException(), isNull); // a RenderFlex overflow would be thrown here
      await unmountAndFlush(tester);
    });
  });

  group('ticket timer (K-04)', () {
    for (final (minutes, level) in [(9.9, 'normal'), (10, 'amber'), (14.9, 'amber'), (15, 'red'), (42, 'red')]) {
      testWidgets('$minutes min since the server got it: $level', (tester) async {
        await pumpKitchen(tester, [sent('i1', at: minutesAgo(minutes))]);
        expect(find.byKey(Key('age-$level')), findsOneWidget);
        expect(find.text('${minutes.floor()} min'), findsOneWidget);
        await unmountAndFlush(tester);
      });
    }

    testWidgets('a very old ticket shows "99+ min" so the label always fits', (tester) async {
      await pumpKitchen(tester, [sent('i1', at: minutesAgo(600))]);
      expect(find.text('99+ min'), findsOneWidget);
      expect(find.byKey(const Key('age-red')), findsOneWidget);
      await unmountAndFlush(tester);
    });

    testWidgets('it moves on by itself: 9 min becomes amber without any new event', (tester) async {
      await pumpKitchen(tester, [sent('i1', at: minutesAgo(9.8))]);
      expect(find.byKey(const Key('age-normal')), findsOneWidget);

      clockNow = clockNow.add(const Duration(seconds: 30));
      await tester.pump(const Duration(seconds: 30));

      expect(find.byKey(const Key('age-amber')), findsOneWidget);
      await unmountAndFlush(tester);
    });

    testWidgets('when everything left on the ticket is ready, the timer stops colouring', (tester) async {
      final (_, socket) = await pumpKitchen(tester, [sent('i1', at: minutesAgo(20))]);
      push(socket!, 'i1', 'item.ready', 'ready');
      await settled(tester);

      expect(find.byKey(const Key('age-red')), findsNothing);
      expect(find.byKey(const Key('age-done')), findsOneWidget);
      await unmountAndFlush(tester);
    });
  });

  group('flash (K-02)', () {
    testWidgets('a live new ticket flashes the screen for about 2 s', (tester) async {
      final (_, socket) = await pumpKitchen(tester, []);
      socket!.receive({'type': 'event', 'event': sent('i1', at: minutesAgo(0))});
      await settled(tester);

      expect(find.byKey(const Key('flash-newTicket')), findsOneWidget);
      await tester.pump(const Duration(seconds: 3));
      expect(find.byKey(const Key('flash-newTicket')), findsNothing);
      await unmountAndFlush(tester);
    });

    testWidgets('a void flashes red', (tester) async {
      final (_, socket) = await pumpKitchen(tester, [sent('i1'), sent('i2')]);
      push(socket!, 'i1', 'item.voided', 'voided');
      await settled(tester);

      expect(find.byKey(const Key('flash-voided')), findsOneWidget);
      await tester.pump(const Duration(seconds: 3));
      await unmountAndFlush(tester);
    });

    testWidgets('the flash never blocks a tap underneath', (tester) async {
      final (_, socket) = await pumpKitchen(tester, [sent('i1')]);
      socket!.receive({'type': 'event', 'event': sent('i2', orderId: 'o2')});
      await settled(tester);

      await tester.tap(find.text('Accept').first);
      await settled(tester);
      expect(lastCommand(socket), containsPair('command', {'type': 'accept'}));
      socket.ackLast({'ok': true}); // answer it, or the app's 10 s answer timer outlives the test
      await settled(tester);
      await tester.pump(const Duration(seconds: 11));
      await unmountAndFlush(tester);
    });
  });

  testWidgets('no tickets: says that new orders appear by themselves', (tester) async {
    await pumpKitchen(tester, []);
    expect(find.textContaining('New orders appear here'), findsOneWidget);
    await unmountAndFlush(tester);
  });

  testWidgets('a ticket shows the table, waiter, round and every item with its note and options', (tester) async {
    await pumpKitchen(tester, [
      sent('i1', round: 2, extra: {'flag': 'sold_out'}),
      sent('i2', round: 2, extra: {'name': 'Tibs', 'qty': 1, 'note': null, 'options': <Object>[]}),
    ]);

    expect(find.text('Table 7'), findsOneWidget);
    expect(find.textContaining('Hana'), findsOneWidget);
    expect(find.textContaining('Round 2'), findsOneWidget);
    expect(find.text('2× Shiro'), findsOneWidget);
    expect(find.text('1× Tibs'), findsOneWidget);
    expect(find.textContaining('no onion'), findsOneWidget);
    expect(find.textContaining('Large'), findsOneWidget);
    expect(find.textContaining('SOLD OUT'), findsOneWidget); // K-03: flagged, never dropped
    expect(find.text('Accept'), findsNWidgets(2));
    await unmountAndFlush(tester);
  });

  testWidgets('a round queued offline warns that it may already be made', (tester) async {
    await pumpKitchen(tester, [sent('i1', extra: {'sentWhileOffline': true})]);
    expect(find.textContaining('Sent while offline'), findsOneWidget);
    await unmountAndFlush(tester);
  });

  testWidgets('Accept sends the command; the server event turns the button into Ready', (tester) async {
    final (_, socket) = await pumpKitchen(tester, [sent('i1')]);

    await tester.tap(find.text('Accept'));
    await settled(tester);
    expect(lastCommand(socket!), containsPair('command', {'type': 'accept'}));
    expect(lastCommand(socket)['itemId'], 'i1');

    socket.ackLast({'ok': true});
    push(socket, 'i1', 'item.accepted', 'accepted');
    await settled(tester);

    expect(find.text('Ready'), findsOneWidget);
    await tester.tap(find.text('Ready'));
    await settled(tester);
    expect(lastCommand(socket), containsPair('command', {'type': 'ready'}));
    socket.ackLast({'ok': true});
    push(socket, 'i1', 'item.ready', 'ready');
    await settled(tester);

    expect(find.textContaining('Waiting for pickup'), findsOneWidget);
    await unmountAndFlush(tester);
  });

  testWidgets('Undo is offered for 10 s after a tap, then disappears (K-06)', (tester) async {
    final (_, socket) = await pumpKitchen(tester, [sent('i1')]);
    await tester.tap(find.text('Accept'));
    await settled(tester);
    socket!.ackLast({'ok': true});
    push(socket, 'i1', 'item.accepted', 'accepted');
    await settled(tester);

    expect(find.text('Undo'), findsOneWidget);
    await tester.pump(const Duration(seconds: 9));
    expect(find.text('Undo'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
    expect(find.text('Undo'), findsNothing);
    await unmountAndFlush(tester);
  });

  testWidgets('tapping Undo sends undo for that item; the server event puts it back', (tester) async {
    final (_, socket) = await pumpKitchen(tester, [sent('i1')]);
    await tester.tap(find.text('Accept'));
    await settled(tester);
    socket!.ackLast({'ok': true});
    push(socket, 'i1', 'item.accepted', 'accepted');
    await settled(tester);

    await tester.tap(find.text('Undo'));
    await settled(tester);
    expect(lastCommand(socket), containsPair('command', {'type': 'undo'}));
    socket.ackLast({'ok': true});
    push(socket, 'i1', 'item.undone', 'sent');
    await settled(tester);

    expect(find.text('Accept'), findsOneWidget);
    expect(find.text('Undo'), findsNothing); // one undo per tap
    await unmountAndFlush(tester);
  });

  testWidgets('a refused tap says why, and the card keeps the true state', (tester) async {
    // Two items, so the round is not finished when one is cancelled (a finished round leaves the screen).
    final (_, socket) = await pumpKitchen(tester, [sent('i1'), sent('i2', extra: {'name': 'Tibs'})]);
    await tester.tap(find.text('Accept').first);
    await settled(tester);
    socket!.ackLast({'ok': false, 'error': 'NOT_ALLOWED_FROM_STATE'});
    push(socket, 'i1', 'item.cancelled', 'cancelled'); // the waiter cancelled first
    await settled(tester);

    expect(find.textContaining('Not possible any more'), findsOneWidget);
    expect(find.text('CANCELLED'), findsOneWidget);
    expect(find.text('Accept'), findsOneWidget); // only Tibs still has one
    expect(find.text('Undo'), findsNothing);
    await unmountAndFlush(tester);
  });

  testWidgets('offline: a red "No connection" bar, and a tap changes nothing', (tester) async {
    final (db, _) = await pumpKitchen(tester, [sent('i1')], online: false);

    expect(find.textContaining('No connection'), findsWidgets);
    await tester.tap(find.text('Accept'));
    await settled(tester);

    expect(find.textContaining('Needs internet'), findsOneWidget);
    expect(find.text('Accept'), findsOneWidget);
    expect(await tester.runAsync(db.pendingMessages), isEmpty);
    await unmountAndFlush(tester);
  });
}
