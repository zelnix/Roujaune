// Dynamic Expo config. Spreads everything from app.json and injects a fresh
// `extra.buildStamp` (ISO time) every time the config is evaluated — which
// happens on each Metro start (preview) and on each EAS build/publish. This
// lets the app show an always-current "last publish" time without manual edits.
const appJson = require("./app.json");

module.exports = () => ({
  ...appJson.expo,
  extra: {
    ...(appJson.expo.extra || {}),
    buildStamp: new Date().toISOString(),
  },
});
