/// Makes the alert sounds in assets/sounds/ (our own tones: no licence questions).
/// Run from apps/tablet:  dart run tool/make_tones.dart
///
/// - soft.wav: "kitchen accepted": two short, gentle rising notes.
/// - loud.wav: "ready": three loud two-tone beeps, easy to hear in a noisy café.
/// - info.wav: "table handed to you", corrections: one mid note.
library;

import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

const rate = 22050;

/// A note: frequency (Hz), length (ms), loudness 0..1. Frequency 0 is silence.
typedef Note = (double hz, int ms, double volume);

void main() {
  final dir = Directory('assets/sounds')..createSync(recursive: true);
  write('${dir.path}/soft.wav', [(880, 110, 0.35), (0, 40, 0), (1320, 160, 0.35)]);
  write('${dir.path}/loud.wav', [
    for (var i = 0; i < 3; i++) ...<Note>[(1000, 140, 0.95), (1500, 140, 0.95), (0, 120, 0)],
  ]);
  write('${dir.path}/info.wav', [(660, 220, 0.5)]);
}

void write(String path, List<Note> notes) {
  final samples = <int>[];
  for (final (hz, ms, volume) in notes) {
    final count = rate * ms ~/ 1000;
    final fade = math.min(count ~/ 2, rate ~/ 200); // 5 ms in and out: no clicks
    for (var i = 0; i < count; i++) {
      final envelope = math.min(1.0, math.min(i, count - 1 - i) / math.max(1, fade));
      final value = hz == 0 ? 0.0 : math.sin(2 * math.pi * hz * i / rate) * volume * envelope;
      samples.add((value * 32767).round());
    }
  }
  // A plain 16-bit mono PCM WAV file.
  final data = ByteData(44 + samples.length * 2);
  void text(int at, String s) => s.codeUnits.asMap().forEach((i, c) => data.setUint8(at + i, c));
  text(0, 'RIFF');
  data.setUint32(4, 36 + samples.length * 2, Endian.little);
  text(8, 'WAVE');
  text(12, 'fmt ');
  data.setUint32(16, 16, Endian.little);
  data.setUint16(20, 1, Endian.little); // PCM
  data.setUint16(22, 1, Endian.little); // mono
  data.setUint32(24, rate, Endian.little);
  data.setUint32(28, rate * 2, Endian.little);
  data.setUint16(32, 2, Endian.little);
  data.setUint16(34, 16, Endian.little);
  text(36, 'data');
  data.setUint32(40, samples.length * 2, Endian.little);
  for (var i = 0; i < samples.length; i++) {
    data.setInt16(44 + i * 2, samples[i], Endian.little);
  }
  File(path).writeAsBytesSync(data.buffer.asUint8List());
  stdout.writeln('$path: ${samples.length * 1000 ~/ rate} ms');
}
