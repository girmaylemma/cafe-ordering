/// Build-time settings. Pass with `flutter run --dart-define=API_URL=http://192.168.1.20:8787`.
///
/// The default reaches `wrangler dev` on your PC from the Android EMULATOR (10.0.2.2 is the
/// emulator's name for the host). A real phone needs your PC's Wi-Fi address instead.
library;

const apiBaseUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:8787');
