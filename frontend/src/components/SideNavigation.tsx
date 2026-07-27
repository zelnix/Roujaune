import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius, spacing, shadow } from "../theme";
import { navItems, navFooter, NavItem } from "../data";
import { Touchable } from "./ui";
import { usePlanBadge } from "../lib/plan-badge";

const logoIcon = require("../../assets/images/logo_glyph_t.png");

function NavRow({ item, active, onPress, badge }: { item: NavItem; active: boolean; onPress: () => void; badge?: boolean }) {
  return (
    <Touchable
      testID={`railnav-${item.key}`}
      onPress={onPress}
      scaleTo={0.94}
      lift={false}
      style={styles.rowWrap}
    >
      {active ? (
        <LinearGradient
          colors={["rgba(224,30,43,0.9)", "rgba(110,17,22,0.85)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.row, styles.rowActive, shadow.glow]}
        >
          <LinearGradient
            colors={[colors.yellow, colors.red]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.activeIndicator}
          />
          <Ionicons name={item.icon} size={22} color="#fff" />
          <Text style={[styles.label, { color: "#fff", fontWeight: "700" }]} numberOfLines={2}>
            {item.label}
          </Text>
        </LinearGradient>
      ) : (
        <View style={styles.row}>
          <Ionicons name={item.icon} size={22} color={colors.textDim} />
          <Text style={styles.label} numberOfLines={2}>
            {item.label}
          </Text>
          {badge ? <View style={styles.badge} /> : null}
        </View>
      )}
    </Touchable>
  );
}

export function SideNavigation({
  active,
  onSelect,
  width,
  compact = false,
}: {
  active: string;
  onSelect: (key: string) => void;
  width: number;
  compact?: boolean;
}) {
  const planBadge = usePlanBadge();
  return (
    <View style={[styles.nav, { width }]} testID="side-navigation">
      <View style={[styles.logoWrap, compact && { width: 42, height: 42, marginBottom: spacing.sm }]}>
        <Image source={logoIcon} style={compact ? { width: 38, height: 38 } : styles.logo} contentFit="contain" />
      </View>

      <ScrollView
        style={{ width: "100%" }}
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.items}>
          {navItems.map((item) => (
            <NavRow key={item.key} item={item} active={active === item.key} onPress={() => onSelect(item.key)} badge={item.key === "training" && planBadge && active !== "training"} />
          ))}
        </View>

        <View style={styles.footer}>
          {navFooter.map((item) => (
            <NavRow key={item.key} item={item} active={active === item.key} onPress={() => onSelect(item.key)} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    backgroundColor: colors.nav,
    borderRightWidth: 1,
    borderRightColor: colors.borderSoft,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  logoWrap: {
    width: 52,
    height: 52,
    marginBottom: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: 46, height: 46 },
  scrollBody: { width: "100%", flexGrow: 1, justifyContent: "space-between", paddingBottom: spacing.sm },
  items: { width: "100%", gap: 4, paddingHorizontal: 8 },
  footer: { width: "100%", gap: 4, paddingHorizontal: 8, paddingTop: spacing.md },
  rowWrap: { width: "100%" },
  row: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: radius.md,
    gap: 4,
  },
  rowActive: {
    borderWidth: 1,
    borderColor: "rgba(224,30,43,0.5)",
  },
  activeIndicator: {
    position: "absolute",
    left: 0,
    top: 12,
    bottom: 12,
    width: 3.5,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  badge: { position: "absolute", top: 8, right: 14, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.red, borderWidth: 1.5, borderColor: colors.nav },
  label: { color: colors.textDim, fontSize: 10.5, fontWeight: "600", textAlign: "center" },
});
