import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/src/theme";

type Props = {
  routeName: string;
  pct: number;
  onSave: () => void;
  onEnd: () => void;
  onContinue: () => void;
};

/** "Leave this ride?" — save & leave / end without saving / continue. */
export function LeaveRideDialog({ routeName, pct, onSave, onEnd, onContinue }: Props) {
  return (
    <View style={s.dialogWrap} testID="leave-dialog">
      <View style={s.dialogCard}>
        <Text style={s.dialogTitle}>Leave this ride?</Text>
        <Text style={s.dialogSub}>You&apos;re {Math.round(pct * 100)}% through {routeName}.</Text>
        <Pressable style={[s.dialogBtn, s.dialogPrimary]} testID="dlg-save" onPress={onSave}>
          <Ionicons name="bookmark" size={16} color="#fff" />
          <Text style={s.dialogBtnText}>Save &amp; leave</Text>
        </Pressable>
        <Pressable style={[s.dialogBtn, s.dialogDanger]} testID="dlg-end" onPress={onEnd}>
          <Ionicons name="stop-circle-outline" size={16} color="#fff" />
          <Text style={s.dialogBtnText}>End without saving</Text>
        </Pressable>
        <Pressable style={[s.dialogBtn, s.dialogGhost]} testID="dlg-continue" onPress={onContinue}>
          <Text style={[s.dialogBtnText, { color: colors.white }]}>Continue riding</Text>
        </Pressable>
      </View>
    </View>
  );
}

const BORDER = "rgba(255,255,255,0.14)";

const s = StyleSheet.create({
  dialogWrap: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.62)", alignItems: "center", justifyContent: "center", zIndex: 30, padding: 24 },
  dialogCard: { width: "100%", maxWidth: 400, backgroundColor: "#0E1512", borderRadius: radius.xl, borderWidth: 1, borderColor: BORDER, padding: 22, gap: 10 },
  dialogTitle: { color: colors.white, fontSize: 20, fontWeight: "900" },
  dialogSub: { color: colors.textDim, fontSize: 13.5, marginBottom: 6 },
  dialogBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.md, paddingVertical: 14, minHeight: 50 },
  dialogPrimary: { backgroundColor: colors.red },
  dialogDanger: { backgroundColor: "#3a1216", borderWidth: 1, borderColor: "rgba(224,30,43,0.5)" },
  dialogGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: BORDER },
  dialogBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
