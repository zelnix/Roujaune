/**
 * withSafeCastInit  —  Expo config plugin (safety net)
 *
 * The primary fix is in patches/react-native-google-cast+4.9.1.patch which
 * patches the library's config plugin to emit a Throwable-safe Cast init.
 *
 * This plugin is a BELT-AND-BRACES fallback: if the patch somehow doesn't
 * apply (new version, CI cache miss, etc.), this catches it at the dangerous
 * mod level and rewrites the file.
 *
 * MUST be listed AFTER "react-native-google-cast" in app.json plugins.
 */

const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

function findMainActivity(androidDir) {
  const srcMain = path.join(androidDir, "app", "src", "main", "java");
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.startsWith("MainActivity.")) files.push(full);
    }
  }
  try { walk(srcMain); } catch {}
  return files[0] || null;
}

module.exports = function withSafeCastInit(config) {
  return withDangerousMod(config, [
    "android",
    (cfg) => {
      const androidDir = path.join(cfg.modRequest.projectRoot, "android");
      const mainActivityPath = findMainActivity(androidDir);
      if (!mainActivityPath) return cfg;

      let src;
      try { src = fs.readFileSync(mainActivityPath, "utf8"); } catch { return cfg; }

      const unsafeCall = "RNGCCastContext.getSharedInstance(this)";
      const safeCall = "try { RNGCCastContext.getSharedInstance(this) } catch (_: Throwable) { /* Cast unavailable */ }";

      // Only rewrite if the patch didn't already handle it.
      if (src.includes(unsafeCall) && !src.includes("catch (_: Throwable)")) {
        src = src.replace(unsafeCall, safeCall);
        fs.writeFileSync(mainActivityPath, src, "utf8");
        console.log("[withSafeCastInit] ✅ Fallback: Wrapped Cast init in Throwable guard");
      }
      return cfg;
    },
  ]);
};
