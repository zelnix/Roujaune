/**
 * ChromeOS / large-screen compatibility.
 *
 * Android implicitly marks `android.hardware.touchscreen` as REQUIRED, and
 * permissions the app requests (Bluetooth LE, location, camera, microphone)
 * pull in implicit `<uses-feature required="true">` entries. Chromebooks that
 * lack that hardware (no touchscreen / no BLE / no GPS) then refuse to install
 * the APK ("app is incompatible with your device"). Google's official ChromeOS
 * guidance is to declare each of these features `required="false"` so the app
 * installs and runs on Chromebooks (and other large-screen / non-touch devices)
 * while still using the hardware when present.
 *
 * Pure native-build config change — only takes effect in a freshly generated
 * Android build, not in Expo Go or the web preview.
 */
const { withAndroidManifest } = require("@expo/config-plugins");

const NON_REQUIRED_FEATURES = [
  "android.hardware.touchscreen",
  "android.hardware.faketouch",
  "android.hardware.bluetooth",
  "android.hardware.bluetooth_le",
  "android.hardware.location",
  "android.hardware.location.gps",
  "android.hardware.location.network",
  "android.hardware.camera",
  "android.hardware.camera.any",
  "android.hardware.camera.autofocus",
  "android.hardware.microphone",
  "android.hardware.telephony",
  "android.hardware.wifi",
];

module.exports = function withChromeOsCompat(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const features = manifest["uses-feature"] || [];

    for (const name of NON_REQUIRED_FEATURES) {
      const existing = features.find(
        (f) => f && f.$ && f.$["android:name"] === name
      );
      if (existing) {
        existing.$["android:required"] = "false";
      } else {
        features.push({
          $: { "android:name": name, "android:required": "false" },
        });
      }
    }

    manifest["uses-feature"] = features;
    return cfg;
  });
};
