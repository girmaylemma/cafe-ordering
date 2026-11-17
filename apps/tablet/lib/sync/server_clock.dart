/// The server's time, as seen from this tablet (K-04). A cheap tablet's clock can be minutes
/// wrong (dead battery, automatic time off), and ticket ages are measured against the server's
/// `received_at`, so every catch-up tells us how far off this tablet is.
library;

class ServerClock {
  ServerClock({DateTime Function()? now}) : _now = now ?? DateTime.now;
  final DateTime Function() _now;

  /// Server time minus tablet time. Zero until the first catch-up: trust the tablet meanwhile.
  Duration _offset = Duration.zero;

  /// From a catch-up's `serverNow` (ms). Off by the message's travel time only (well under 1 s).
  void learn(int? serverNowMs) {
    if (serverNowMs == null) return; // an older server: keep what we have
    _offset = DateTime.fromMillisecondsSinceEpoch(serverNowMs).difference(_now());
  }

  /// The server's "now" in ms, to compare with a ticket's `receivedAt`.
  int nowMs() => _now().add(_offset).millisecondsSinceEpoch;
}
