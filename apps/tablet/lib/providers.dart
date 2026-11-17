/// App-wide singletons (overridden in tests).
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'data/database.dart';

/// The tablet's one local database. Closed when the app's ProviderScope is disposed.
final databaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
});
