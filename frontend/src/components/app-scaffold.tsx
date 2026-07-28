import React from "react";
import { View, Text, StyleSheet, ScrollView, Animated, Pressable, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { markPlanSeen } from "../lib/plan-badge";
import { SideNavigation } from "./SideNavigation";
import { HeaderStatus } from "./HeaderStatus";
import { resolveNav, rememberRoute, getExperience } from "../lib/today-mode";
import { CC } from "./calendar";

function useApiData<T>(path: string) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const base = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
        const res = await fetch(`${base}${path}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (alive) setData(json);
      } catch { /* keep null */ } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [path]);
  return { data, loading };
}
export { useApiData };

function Toast({ message }: { message: { id: number; text: string } | null }) {
  const op = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!message) return;
    Animated.sequence([
      Animated.timing(op, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(op, { toValue: 0, duration: 240, useNativeDriver: true }),
    ]).start();
  }, [message, op]);
  if (!message) return null;
  return (
    <Animated.View style={[styles.toast, { opacity: op, pointerEvents: "none" }]}>
      <Text style={styles.toastText}>{message.text}</Text>
    </Animated.View>
  );
}

export function AppScaffold({
  active, title, subtitle, headerRight, children,
}: {
  active: string; title: string; subtitle: string;
  headerRight?: React.ReactNode; children: React.ReactNode;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [toast, setToast] = React.useState<{ id: number; text: string } | null>(null);
  const showToast = React.useCallback((t: string) => setToast({ id: Date.now(), text: t }), []);

  const onSelect = (key: string) => {
    const item = resolveNav(key);
    if (!item) return;
    if (item.availability === "coming-soon") { showToast(`${item.label} — coming soon`); return; }
    if (key === active) return;
    if (key === "training") markPlanSeen();
    rememberRoute(getExperience(), item.route);
    router.replace(item.route as any);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: CC.bg }}>
      <StatusBar hidden />
      <SafeAreaView style={{ flex: 1, backgroundColor: CC.bg }} edges={["top", "bottom", "left"]}>
        <View style={styles.canvas}>
          {!compact && (
            <SideNavigation active={active} onSelect={onSelect} width={96} />
          )}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                {compact && (
                  <Pressable onPress={() => router.back()} hitSlop={8} style={styles.back}>
                    <Ionicons name="chevron-back" size={18} color={CC.dim} />
                    <Text style={styles.backText}>Back</Text>
                  </Pressable>
                )}
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
              </View>
              <View style={styles.headerRight}>
                {headerRight ?? <HeaderStatus />}
              </View>
            </View>
            {children}
          </ScrollView>
        </View>
        <Toast message={toast} />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

/* ── shared UI primitives ───────────────────────────────────────────────── */
export function Card({ children, style, testID }: { children: React.ReactNode; style?: any; testID?: string }) {
  return <View testID={testID} style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ label, color = CC.yellow, right }: { label: string; color?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.section, { color }]}>{label}</Text>
      {right}
    </View>
  );
}

export function Pill({ label, active, onPress, testID }: { label: string; active?: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}
      style={({ hovered }: any) => [styles.pill, active && styles.pillOn, hovered && !active && styles.pillHover]}>
      <Text style={[styles.pillText, active && { color: "#241B00", fontWeight: "800" }]}>{label}</Text>
    </Pressable>
  );
}

export function Toggle({ on, onToggle, testID }: { on: boolean; onToggle: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onToggle} accessibilityRole="switch" accessibilityState={{ checked: on }}
      style={[styles.toggle, on && styles.toggleOn]}>
      <View style={[styles.knob, on && styles.knobOn]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, flexDirection: "row", backgroundColor: CC.bg },
  content: { paddingHorizontal: 22, paddingVertical: 18, gap: 16 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 16 },
  back: { flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 6 },
  backText: { color: CC.dim, fontSize: 13, fontWeight: "600" },
  title: { color: CC.white, fontSize: 30, fontWeight: "800" },
  subtitle: { color: CC.dim, fontSize: 13, marginTop: 4 },

  card: { backgroundColor: CC.card, borderRadius: 18, borderWidth: 1, borderColor: CC.border, padding: 16 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  section: { fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6 },

  pill: { borderWidth: 1, borderColor: CC.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 38, justifyContent: "center" },
  pillOn: { backgroundColor: CC.yellow, borderColor: CC.yellow },
  pillHover: { borderColor: "rgba(255,255,255,0.28)" },
  pillText: { color: CC.white, fontSize: 12.5, fontWeight: "600" },

  toggle: { width: 46, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.12)", padding: 3, justifyContent: "center" },
  toggleOn: { backgroundColor: CC.green },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff" },
  knobOn: { alignSelf: "flex-end" },

  toast: { position: "absolute", bottom: 30, alignSelf: "center", backgroundColor: "rgba(20,22,21,0.96)", borderWidth: 1, borderColor: CC.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 },
  toastText: { color: CC.white, fontSize: 13, fontWeight: "600" },
});
