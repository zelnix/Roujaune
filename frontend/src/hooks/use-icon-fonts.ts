// Icon font loader for Expo apps. Fonts are loaded from a CDN only under
// Expo Go (StoreClient) — that's where @expo/vector-icons' .ttf files come
// back as 0 bytes from Metro's asset resolver on Android. Native dev/prod
// builds and web pass an empty map, so useFonts resolves to [true, null]
// immediately via react-native-vector-icons autolinking / web stubs.
// ICON_VECTOR_VERSION must match @expo/vector-icons in package.json.
// Usage: const [loaded, error] = useIconFonts();

import { useFonts } from "expo-font";

// Preload the icon fonts we actually use so glyphs render on first paint
// across native builds, Expo Go and web. The font-family keys must match the
// names @react-native-vector-icons queries internally (postScriptName on iOS /
// font basename on Android): "Ionicons" and "MaterialDesignIcons".
export const useIconFonts = (): readonly [boolean, Error | null] =>
  useFonts({
    Ionicons: require("@react-native-vector-icons/ionicons/fonts/Ionicons.ttf"),
    MaterialDesignIcons: require("@react-native-vector-icons/material-design-icons/fonts/MaterialDesignIcons.ttf"),
  });
