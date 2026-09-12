import React from "react";
import { View, Text, StyleSheet, Animated, Platform, Pressable, ActivityIndicator, Modal } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { colors, radius, shadow, spacing } from "@/src/theme";

// Lightweight ephemeral toast shown near the bottom of the live-workout screen.
export function Toast({ message }: { message: { id: number; text: string } | null }) {
  const anim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!message) return;
    Animated.spring(anim, { toValue: 1, useNativeDriver: Platform.OS !== "web", speed: 18, bounciness: 6 }).start();
    const t = setTimeout(() => Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== "web" }).start(), 1800);
    return () => clearTimeout(t);
  }, [message, anim]);
  if (!message) return null;
  return (
    <Animated.View testID="toast" style={[m.toast, shadow.glow, { pointerEvents: "none", opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
      <Ionicons name="checkmark-circle" size={18} color={colors.yellow} />
      <Text style={m.toastText}>{message.text}</Text>
    </Animated.View>
  );
}

// One extension option in the Workout Complete popup. The coach's recommended
// option is highlighted with an accent border + "Coach pick" badge.
function ExtendChip({ testID, icon, label, pick, onPress }: { testID: string; icon: any; label: string; pick: boolean; onPress: () => void }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[m.extendChip, pick && m.extendChipPick]}>
      {pick ? (
        <View style={m.pickBadge}><Text style={m.pickBadgeText}>COACH PICK</Text></View>
      ) : null}
      <Ionicons name={icon} size={16} color={colors.yellow} />
      <Text style={m.extendChipText}>{label}</Text>
    </Pressable>
  );
}

type Persona = { name: string; image: any };

// End-of-workout "Workout Complete" popup with the coach's extend advice.
export function CompletePrompt({
  workoutTitle, persona, extendAdvice, extendRec, extendPick, onExtend, on5km, onFinish,
}: {
  workoutTitle: string;
  persona: Persona;
  extendAdvice: string | null;
  extendRec: string | null;
  extendPick: string | null;
  onExtend: (minutes: number, label: string) => void;
  on5km: () => void;
  onFinish: () => void;
}) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onFinish}>
      <Pressable style={m.overlay} onPress={onFinish} testID="workout-complete-overlay">
        <Pressable style={m.completePanel} onPress={() => { /* swallow */ }} testID="workout-complete-prompt">
        <View style={m.completeBadge}><Ionicons name="checkmark-circle" size={40} color={colors.green} /></View>
        <Text style={m.completeTitle}>Workout Complete</Text>
        <Text style={m.completeSub}>You finished {workoutTitle}. Nicely done.</Text>

        <View style={m.adviceCard}>
          <View style={m.adviceHead}>
            <Image source={persona.image} style={m.adviceAvatar} contentFit="cover" contentPosition="top center" />
            <Text style={m.adviceName}>{`${persona.name}'s advice`}</Text>
          </View>
          {extendAdvice ? (
            <Text style={m.adviceText} testID="extend-advice">{extendAdvice}</Text>
          ) : (
            <View style={m.adviceLoading}>
              <ActivityIndicator size="small" color={colors.yellow} />
              <Text style={m.adviceLoadingText}>{persona.name} is reviewing your ride…</Text>
            </View>
          )}
        </View>

        {extendRec === "finish" ? (
          <View style={m.recoverNote} testID="recover-note">
            <Ionicons name="bed-outline" size={16} color={colors.green} />
            <Text style={m.recoverNoteText}>{persona.name} recommends finishing here and recovering.</Text>
          </View>
        ) : (
          <>
            <Text style={m.extendLabel}>
              EXTEND YOUR RIDE{extendPick ? " · COACH PICK HIGHLIGHTED" : ""}
            </Text>
            <View style={m.extendRow}>
              <ExtendChip testID="extend-10" icon="time-outline" label="+10 min" pick={extendPick === "10min"} onPress={() => onExtend(10, "+10 min")} />
              <ExtendChip testID="extend-20" icon="time-outline" label="+20 min" pick={extendPick === "20min"} onPress={() => onExtend(20, "+20 min")} />
              <ExtendChip testID="extend-5km" icon="navigate-outline" label="+5 km" pick={extendPick === "5km"} onPress={on5km} />
            </View>
          </>
        )}

        <Pressable testID="complete-finish" onPress={onFinish} style={({ hovered }: any) => [m.endSave, { backgroundColor: colors.green }, hovered && { opacity: 0.9 }]}>
          <Ionicons name="checkmark-circle" size={18} color="#fff" />
          <Text style={m.endSaveText}>OK</Text>
        </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// End-ride confirmation (save / abandon / resume).
export function EndPrompt({ onSave, onAbandon, onResume }: { onSave: () => void; onAbandon: () => void; onResume: () => void }) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onResume}>
      <Pressable style={m.overlay} onPress={onResume} testID="end-ride-overlay">
        <Pressable style={m.endPanel} onPress={() => { /* swallow */ }} testID="end-ride-prompt">
        <Ionicons name="flag" size={30} color={colors.yellow} />
        <Text style={m.endTitle}>End this ride?</Text>
        <Text style={m.endSub}>Save your ride to record it in your progress and plan, or abandon it — abandoned rides are not recorded.</Text>
        <Pressable testID="end-save" onPress={onSave} style={({ hovered }: any) => [m.endSave, hovered && { opacity: 0.9 }]}>
          <Ionicons name="checkmark-circle" size={18} color="#fff" />
          <Text style={m.endSaveText}>Save Ride</Text>
        </Pressable>
        <Pressable testID="end-abandon" onPress={onAbandon} style={({ hovered }: any) => [m.endAbandon, hovered && { backgroundColor: "rgba(224,30,43,0.14)" }]}>
          <Ionicons name="trash-outline" size={17} color={colors.red} />
          <Text style={m.endAbandonText}>Abandon Ride</Text>
        </Pressable>
        <Pressable testID="end-resume" onPress={onResume} style={m.endResume}>
          <Text style={m.endResumeText}>Resume</Text>
        </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const m = StyleSheet.create({
  toast: { position: "absolute", bottom: 90, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(20,18,16,0.96)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 11 },
  toastText: { color: colors.white, fontWeight: "700", fontSize: 14 },

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },

  endPanel: { width: 440, maxWidth: "90%", backgroundColor: colors.cardElevated, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, alignItems: "center", gap: 10, ...shadow.card },
  endTitle: { color: colors.white, fontSize: 22, fontWeight: "800", marginTop: 4 },
  endSub: { color: colors.textDim, fontSize: 13.5, lineHeight: 19, textAlign: "center", marginBottom: 6 },
  endSave: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 14, width: "100%", ...shadow.glow },
  endSaveText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  endAbandon: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.md, paddingVertical: 13, width: "100%", borderWidth: 1, borderColor: "rgba(224,30,43,0.4)", backgroundColor: "rgba(224,30,43,0.06)" },
  endAbandonText: { color: colors.red, fontSize: 14.5, fontWeight: "700" },
  endResume: { paddingVertical: 8, marginTop: 2 },
  endResumeText: { color: colors.textDim, fontSize: 14, fontWeight: "700" },

  completePanel: { width: 480, maxWidth: "92%", backgroundColor: colors.cardElevated, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, alignItems: "center", gap: 10, ...shadow.card },
  completeBadge: { width: 66, height: 66, borderRadius: 33, alignItems: "center", justifyContent: "center", backgroundColor: colors.green + "1A", borderWidth: 1, borderColor: colors.green + "55" },
  completeTitle: { color: colors.white, fontSize: 24, fontWeight: "900", marginTop: 2 },
  completeSub: { color: colors.textDim, fontSize: 14, textAlign: "center", marginBottom: 4 },
  adviceCard: { width: "100%", backgroundColor: colors.yellow + "10", borderWidth: 1, borderColor: colors.yellow + "3A", borderRadius: radius.lg, padding: 14, gap: 8 },
  adviceHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  adviceAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.08)" },
  adviceName: { color: colors.yellow, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  adviceText: { color: colors.white, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  adviceLoading: { flexDirection: "row", alignItems: "center", gap: 9 },
  adviceLoadingText: { color: colors.textDim, fontSize: 13, fontWeight: "600" },
  extendLabel: { color: colors.textFaint, fontSize: 10.5, fontWeight: "800", letterSpacing: 1, alignSelf: "flex-start", marginTop: 4 },
  extendRow: { flexDirection: "row", gap: 10, width: "100%" },
  extendChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: colors.yellow + "44", borderRadius: radius.md, paddingVertical: 12 },
  extendChipPick: { borderColor: colors.yellow, backgroundColor: colors.yellow + "1E", ...(shadow.glow || {}) },
  extendChipText: { color: colors.white, fontSize: 13.5, fontWeight: "800" },
  pickBadge: { position: "absolute", top: -9, alignSelf: "center", backgroundColor: colors.yellow, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  pickBadgeText: { color: colors.bg, fontSize: 8.5, fontWeight: "900", letterSpacing: 0.5 },
  recoverNote: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%", backgroundColor: colors.green + "12", borderWidth: 1, borderColor: colors.green + "44", borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14 },
  recoverNoteText: { color: colors.white, fontSize: 13.5, fontWeight: "600", flex: 1 },
});
