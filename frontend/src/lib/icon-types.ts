import type { ComponentProps } from "react";
import Ionicons from "@react-native-vector-icons/ionicons";

// Union of valid Ionicons glyph names. Replaces the old
// `keyof typeof Ionicons.glyphMap` (the new @react-native-vector-icons
// component no longer exposes a `.glyphMap` property).
export type IoniconName = ComponentProps<typeof Ionicons>["name"];
