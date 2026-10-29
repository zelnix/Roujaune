/**
 * Force-pin `androidx.mediarouter` to a version compatible with compileSdk 36
 * and Android Gradle Plugin 8.x.
 *
 * `react-native-google-cast` transitively pulls in
 * `androidx.mediarouter:mediarouter:1.9.0-beta01` which demands compileSdk 37
 * and AGP 9.1.0+. Neither is available on the current EAS build image. Pinning
 * to 1.7.0 (stable, compileSdk-34-compatible) resolves the conflict without
 * losing any Cast functionality the app uses.
 */
const { withProjectBuildGradle } = require("@expo/config-plugins");

const FORCE_BLOCK = `
    // --- Force-pin mediarouter to a compileSdk-36-safe version ---
    configurations.all {
        resolutionStrategy {
            force 'androidx.mediarouter:mediarouter:1.7.0'
        }
    }
`;

module.exports = function withForceMediarouter(config) {
  return withProjectBuildGradle(config, (cfg) => {
    const contents = cfg.modResults.contents;

    if (contents.includes("androidx.mediarouter:mediarouter:1.7.0")) {
      return cfg; // already patched
    }

    // Inject into the root-level `allprojects { ... }` block
    cfg.modResults.contents = contents.replace(
      /allprojects\s*\{/,
      `allprojects {${FORCE_BLOCK}`
    );

    return cfg;
  });
};
