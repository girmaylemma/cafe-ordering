import 'package:uuid/uuid.dart';

/// A new id made on the tablet: UUID v7 (time-ordered), as the data rules require.
String newId() => const Uuid().v7();
