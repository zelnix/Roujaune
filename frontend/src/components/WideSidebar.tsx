import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { CC } from "./calendar";
import { navItems, navFooter, NavItem } from "../data";
import { CoachPersona } from "../lib/coach-persona";
import { usePlanBadge } from "../lib/plan-badge";
import { versionLabel } from "./AppVersionTag";
import { BUILD_STAMP } from "../lib/build-stamp";

const logoGlyph = require("../../assets/images/logo_glyph_t.png");
const wordmark = require("../../assets/images/wordmark_t.png");

function Row({ item, active, onPress, badge }: { item: NavItem; active: boolean; onPress: () => void; badge?: boolean }) {
  const inner = (
    <>
      {active ? (
        <LinearGradient colors={[CC.yellow, CC.rouge]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={ws.indicator} />
      ) : null}
      <Ionicons name={item.icon} size={20} color={active ? "#fff" : CC.dim} />
      <Text style={[ws.label, active && { color: "#fff", fontWeight: "700" }]} numberOfLines={1}>{item.label}</Text>
      {badge ? <View style={ws.badge} /> : null}
    </>
  );
  return (
    <Pressable testID={`nav-${item.key}`} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}
      style={({ hovered }: any) => [ws.row, hovered && !active && ws.rowHover]}>
      {active ? (
        <LinearGradient colors={["rgba(201,23,39,0.92)", "rgba(110,17,22,0.85)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[ws.row, ws.rowActive]}>
          {inner}
        </LinearGradient>
      ) : inner}
    </Pressable>
  );
}

/** Wide, labelled Roujaune sidebar with the ROUJAUNE logo + wordmark, the locked
 * navigation order, a dynamic coach portrait card (no message button) and the
 * Settings / Help footer. Reusable across full-width tablet screens. */
export function WideSidebar({ active, onSelect, width = 210 }: { active: string; onSelect: (key: string) => void; persona: CoachPersona; width?: number }) {
  const planBadge = usePlanBadge();
  return (
    <View style={[ws.nav, { width }]} testID="wide-sidebar">
      <View style={ws.brand}>
        <Image source={logoGlyph} style={ws.glyph} contentFit="contain" />
        <View style={{ flex: 1 }}>
          <Image source={wordmark} style={ws.wordmark} contentFit="contain" contentPosition="left" />
          <Text style={ws.tagline}>Your strongest ride is your own.</Text>
          <Text style={ws.version} numberOfLines={1}>{versionLabel()}</Text>
          {__DEV__ ? <Text style={ws.stamp} numberOfLines={1}>Preview · {BUILD_STAMP}</Text> : null}
        </View>
      </View>

      <ScrollView style={{ flex: 1, width: "100%" }} contentContainerStyle={ws.body} showsVerticalScrollIndicator={false}>
        <View style={ws.items}>
          {navItems.map((item) => (
            <Row key={item.key} item={item} active={active === item.key} onPress={() => onSelect(item.key)}
              badge={item.key === "training" && planBadge && active !== "training"} />
          ))}
        </View>

        <View style={ws.footer}>
          {navFooter.map((item) => (
            <Row key={item.key} item={item} active={active === item.key} onPress={() => onSelect(item.key)} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const ws = StyleSheet.create({
  nav: { backgroundColor: CC.nav, borderRightWidth: 1, borderRightColor: CC.borderSoft, paddingTop: 18, paddingBottom: 12, paddingHorizontal: 12 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 6, marginBottom: 16 },
  glyph: { width: 40, height: 40 },
  wordmark: { width: 118, height: 20 },
  tagline: { color: CC.dim, fontSize: 8.5, marginTop: 2 },
  version: { color: CC.dim, fontSize: 9.5, fontWeight: "700", letterSpacing: 0.3, marginTop: 4, opacity: 0.85 },
  stamp: { color: CC.dim, fontSize: 8.5, fontWeight: "600", letterSpacing: 0.2, marginTop: 1, opacity: 0.7 },

  body: { flexGrow: 1, justifyContent: "flex-start", paddingBottom: 8 },
  items: { gap: 3 },
  footer: { gap: 3, marginTop: 8, borderTopWidth: 1, borderTopColor: CC.borderSoft, paddingTop: 10 },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, overflow: "hidden" },
  rowHover: { backgroundColor: "rgba(255,255,255,0.04)" },
  rowActive: { borderWidth: 1, borderColor: "rgba(201,23,39,0.5)" },
  indicator: { position: "absolute", left: 0, top: 9, bottom: 9, width: 3.5, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  label: { color: CC.dim, fontSize: 13, fontWeight: "600", flex: 1 },
  badge: { width: 8, height: 8, borderRadius: 4, backgroundColor: CC.rouge },

  coachCard: { marginTop: 16, marginBottom: 6, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: CC.borderSoft, borderRadius: 14, padding: 12, alignItems: "center" },
  coachCardHover: { borderColor: "rgba(255,255,255,0.2)" },
  coachTop: { width: 60, height: 60 },
  coachImg: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.08)" },
  onlineDot: { position: "absolute", right: 2, top: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: CC.green, borderWidth: 2, borderColor: CC.nav },
  coachName: { color: CC.white, fontSize: 14, fontWeight: "800", marginTop: 8 },
  coachMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2, alignSelf: "stretch" },
  coachRole: { color: CC.dim, fontSize: 10.5 },
  coachSig: { color: CC.yellow, fontSize: 13, fontStyle: "italic", fontWeight: "600" },
});
