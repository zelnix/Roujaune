import React from "react";
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput,
  ActivityIndicator, Platform, KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import Svg, { Path, Circle, Line, Rect, Text as SvgText } from "react-native-svg";
import { C, ProgressRing } from "./plan";
import { CoachPersona } from "../lib/coach-persona";
import {
  EditableGoal, savePlanGoals, PlanProgressDetail, fetchPlanProgress,
  AdaptationEntry, fetchAdaptations,
} from "../lib/plan";

/* ── shared modal shell ─────────────────────────────────────────────────── */
function ModalShell({
  visible, onClose, title, subtitle, icon, iconColor = C.yellow, maxWidth = 760, children, footer,
}: {
  visible: boolean; onClose: () => void; title: string; subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap; iconColor?: string; maxWidth?: number;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={m.backdrop}>
        <Pressable style={StyleSheet.absoluteFill as any} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%", alignItems: "center" }}>
          <View style={[m.sheet, { maxWidth }]}>
            <View style={m.head}>
              <View style={m.headLeft}>
                <View style={[m.headIcon, { borderColor: iconColor }]}><Ionicons name={icon} size={18} color={iconColor} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={m.title}>{title}</Text>
                  {subtitle ? <Text style={m.subtitle}>{subtitle}</Text> : null}
                </View>
              </View>
              <Pressable testID="modal-close" onPress={onClose} hitSlop={10} style={({ hovered }: any) => [m.closeBtn, hovered && { backgroundColor: "rgba(255,255,255,0.08)" }]}>
                <Ionicons name="close" size={20} color={C.white} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ padding: 18 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            {footer ? <View style={m.footer}>{footer}</View> : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/* ── Edit Goals ─────────────────────────────────────────────────────────── */
let goalSeq = 0;
export function EditGoalsModal({
  visible, onClose, goals, onSaved,
}: {
  visible: boolean; onClose: () => void;
  goals: EditableGoal[]; onSaved: (g: EditableGoal[]) => void;
}) {
  const [draft, setDraft] = React.useState<EditableGoal[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (visible) { setDraft(goals.map((g) => ({ ...g }))); setSaving(false); }
  }, [visible, goals]);

  const update = (id: string, patch: Partial<EditableGoal>) =>
    setDraft((d) => d.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const toggle = (id: string) =>
    update(id, { status: draft.find((g) => g.id === id)?.status === "complete" ? "incomplete" : "complete" });
  const remove = (id: string) => setDraft((d) => d.filter((g) => g.id !== id));
  const add = () => setDraft((d) => [...d, { id: `new-${Date.now()}-${goalSeq++}`, title: "", description: "", status: "incomplete" }]);

  const save = async () => {
    const clean = draft.filter((g) => g.title.trim());
    setSaving(true);
    try {
      await savePlanGoals(clean);
      onSaved(clean);
      onClose();
    } catch {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      visible={visible} onClose={onClose} title="Edit Plan Goals"
      subtitle="Tune what this training block is working toward." icon="disc-outline" iconColor={C.rouge}
      footer={
        <View style={m.footerRow}>
          <Pressable testID="goals-cancel" onPress={onClose} style={({ hovered }: any) => [m.btnGhost, hovered && m.btnGhostHover]}>
            <Text style={m.btnGhostText}>Cancel</Text>
          </Pressable>
          <Pressable testID="goals-save" onPress={save} disabled={saving} style={({ hovered }: any) => [m.btnPrimary, hovered && { opacity: 0.9 }, saving && { opacity: 0.6 }]}>
            {saving ? <ActivityIndicator size="small" color="#241B00" /> : <Ionicons name="checkmark" size={16} color="#241B00" />}
            <Text style={m.btnPrimaryText}>{saving ? "Saving…" : "Save Goals"}</Text>
          </Pressable>
        </View>
      }
    >
      {draft.map((g) => (
        <View key={g.id} style={m.goalCard}>
          <Pressable testID={`goal-toggle-${g.id}`} onPress={() => toggle(g.id)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: g.status === "complete" }}
            style={[m.goalCheck, g.status === "complete" ? m.goalCheckOn : m.goalCheckOff]}>
            {g.status === "complete" ? <Ionicons name="checkmark" size={16} color="#04210F" /> : null}
          </Pressable>
          <View style={{ flex: 1, gap: 6 }}>
            <TextInput
              testID={`goal-title-${g.id}`} value={g.title} onChangeText={(t) => update(g.id, { title: t })}
              placeholder="Goal title" placeholderTextColor={C.dim} style={m.inputTitle}
            />
            <TextInput
              testID={`goal-desc-${g.id}`} value={g.description} onChangeText={(t) => update(g.id, { description: t })}
              placeholder="Short description" placeholderTextColor={C.dim} style={m.inputDesc}
            />
          </View>
          <Pressable testID={`goal-delete-${g.id}`} onPress={() => remove(g.id)} hitSlop={8} style={({ hovered }: any) => [m.delBtn, hovered && { opacity: 0.7 }]} accessibilityLabel="Delete goal">
            <Ionicons name="trash-outline" size={18} color={C.dim} />
          </Pressable>
        </View>
      ))}
      <Pressable testID="goal-add" onPress={add} style={({ hovered }: any) => [m.addRow, hovered && m.btnGhostHover]}>
        <Ionicons name="add" size={18} color={C.yellow} />
        <Text style={m.addText}>Add a goal</Text>
      </Pressable>
    </ModalShell>
  );
}

/* ── View Progress ──────────────────────────────────────────────────────── */
function TrendChart({ ctl, atl, labels, width = 640, height = 170 }: { ctl: number[]; atl: number[]; labels: string[]; width?: number; height?: number }) {
  const padL = 28, padB = 20, padT = 12, padR = 8;
  const cw = width - padL - padR, ch = height - padT - padB;
  const all = [...ctl, ...atl];
  const max = Math.max(...all, 1) * 1.1;
  const n = Math.max(ctl.length, 2);
  const x = (i: number) => padL + (i / (n - 1)) * cw;
  const y = (v: number) => padT + (1 - v / max) * ch;
  const toPath = (arr: number[]) => arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <Svg width={width} height={height} accessibilityLabel="Fitness (CTL) and fatigue (ATL) trend over 12 weeks">
      {[0, max / 2, max].map((t, i) => {
        const yy = y(t);
        return <Line key={i} x1={padL} y1={yy} x2={width - padR} y2={yy} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />;
      })}
      <Path d={toPath(atl)} stroke={C.amber} strokeWidth={2} fill="none" opacity={0.9} />
      <Path d={toPath(ctl)} stroke={C.green} strokeWidth={2.6} fill="none" />
      {ctl.map((v, i) => <Circle key={i} cx={x(i)} cy={y(v)} r={2.6} fill={C.green} />)}
      {labels.map((l, i) => (i % 2 === 0 ? <SvgText key={l} x={x(i)} y={height - 5} fontSize={8.5} fill={C.dim} textAnchor="middle">{l}</SvgText> : null))}
    </Svg>
  );
}

export function ProgressModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [data, setData] = React.useState<PlanProgressDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(false);

  React.useEffect(() => {
    if (!visible) return;
    let alive = true;
    setLoading(true); setErr(false);
    fetchPlanProgress()
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setErr(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [visible]);

  const maxTss = data ? Math.max(...data.weeks.map((w) => w.tss), 1) : 1;

  return (
    <ModalShell visible={visible} onClose={onClose} title="Plan Progress" subtitle="Your fitness, fatigue and completion so far." icon="stats-chart-outline" iconColor={C.green} maxWidth={720}>
      {loading ? (
        <View style={m.center}><ActivityIndicator color={C.yellow} /><Text style={m.centerText}>Loading progress…</Text></View>
      ) : err || !data ? (
        <View style={m.center}><Ionicons name="cloud-offline-outline" size={26} color={C.dim} /><Text style={m.centerText}>Could not load progress.</Text></View>
      ) : (
        <>
          <View style={m.progTop}>
            <ProgressRing pct={data.progress_pct} size={78} />
            <View style={m.progSummary}>
              {Object.entries({
                "Weeks": data.summary.weeks, "Workouts": data.summary.workouts,
                "Time": data.summary.time, "TSS": data.summary.tss,
              }).map(([k, v]) => (
                <View key={k} style={m.progCell}><Text style={m.progVal}>{v}</Text><Text style={m.progLbl}>{k}</Text></View>
              ))}
            </View>
          </View>

          <View style={m.fitnessRow}>
            <View style={[m.chip, { borderColor: "rgba(85,200,80,0.4)" }]}><View style={[m.dot, { backgroundColor: C.green }]} /><Text style={m.chipText}>Fitness (CTL) {data.fitness.ctl}</Text></View>
            <View style={[m.chip, { borderColor: "rgba(240,165,0,0.4)" }]}><View style={[m.dot, { backgroundColor: C.amber }]} /><Text style={m.chipText}>Fatigue (ATL) {data.fitness.atl}</Text></View>
            <View style={[m.chip, { borderColor: C.border }]}><Text style={m.chipText}>Form (TSB) {data.fitness.tsb} · {data.fitness.form_label}</Text></View>
          </View>
          <TrendChart ctl={data.trend.ctl} atl={data.trend.atl} labels={data.trend.labels} />

          <Text style={m.sectionLbl}>KEY METRICS</Text>
          <View style={m.metricGrid}>
            {data.metrics.map((mt) => (
              <View key={mt.label} style={m.metricCard}>
                <Text style={m.metricLbl}>{mt.label}</Text>
                <Text style={m.metricVal}>{mt.value}</Text>
                <View style={m.deltaRow}>
                  <Ionicons name={mt.up ? "arrow-up" : "arrow-down"} size={11} color={mt.up ? C.green : C.rouge} />
                  <Text style={[m.deltaText, { color: mt.up ? C.green : C.rouge }]}>{mt.delta}</Text>
                </View>
              </View>
            ))}
          </View>

          <Text style={m.sectionLbl}>WEEKLY COMPLETION</Text>
          <View style={m.weekRow}>
            {data.weeks.map((w) => (
              <View key={w.label} style={m.weekCol}>
                <View style={m.weekBarTrack}>
                  <View style={[m.weekBar, {
                    height: `${Math.max(6, (w.tss / maxTss) * 100)}%`,
                    backgroundColor: w.current ? C.yellow : w.done ? C.green : "rgba(255,255,255,0.14)",
                  }]} />
                </View>
                <Text style={[m.weekNum, w.current && { color: C.yellow, fontWeight: "800" }]}>{w.label.replace("Week ", "")}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ModalShell>
  );
}

/* ── View All Adaptations ───────────────────────────────────────────────── */
function relTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const day = 86400000;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < day) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 2 * day) return "Yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AdaptationsModal({ visible, onClose, persona }: { visible: boolean; onClose: () => void; persona: CoachPersona }) {
  const [items, setItems] = React.useState<AdaptationEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(false);

  React.useEffect(() => {
    if (!visible) return;
    let alive = true;
    setLoading(true); setErr(false);
    fetchAdaptations(persona.name)
      .then((d) => { if (alive) setItems(d); })
      .catch(() => { if (alive) setErr(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [visible, persona.name]);

  return (
    <ModalShell visible={visible} onClose={onClose} title={`${persona.name}'s Adaptations`} subtitle="How your coach has adjusted the plan over time." icon="git-branch-outline" iconColor={C.rouge} maxWidth={680}>
      {loading ? (
        <View style={m.center}><ActivityIndicator color={C.yellow} /><Text style={m.centerText}>Loading history…</Text></View>
      ) : err ? (
        <View style={m.center}><Ionicons name="cloud-offline-outline" size={26} color={C.dim} /><Text style={m.centerText}>Could not load adaptations.</Text></View>
      ) : items.length === 0 ? (
        <View style={m.center}><Ionicons name="sparkles-outline" size={26} color={C.dim} /><Text style={m.centerText}>No adaptations yet. Finish a ride and your coach will adjust the plan.</Text></View>
      ) : (
        items.map((it, i) => (
          <View key={it.id} style={m.timelineRow}>
            <View style={m.timelineLeft}>
              <Image source={persona.image} style={m.adaptAvatar} contentFit="cover" contentPosition="top center" />
              {i < items.length - 1 ? <View style={m.timelineLine} /> : null}
            </View>
            <View style={m.adaptBubble}>
              <View style={m.adaptBubbleHead}>
                <View style={m.triggerChip}><Ionicons name="flash" size={11} color={C.yellow} /><Text style={m.triggerText}>{it.trigger}</Text></View>
                <Text style={m.adaptWhen}>{relTime(it.at)}</Text>
              </View>
              <Text style={m.adaptBody}>{it.text}</Text>
            </View>
          </View>
        ))
      )}
    </ModalShell>
  );
}

const m = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(2,3,3,0.72)", alignItems: "center", justifyContent: "center", padding: 20 },
  sheet: { width: "100%", backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: C.borderSoft, gap: 12 },
  headLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  headIcon: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.03)" },
  title: { color: C.white, fontSize: 18, fontWeight: "800" },
  subtitle: { color: C.dim, fontSize: 12, marginTop: 2 },
  closeBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: C.borderSoft },
  footerRow: { flexDirection: "row", justifyContent: "flex-end", gap: 12 },

  btnGhost: { paddingVertical: 11, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: "rgba(255,255,255,0.03)", minHeight: 44, justifyContent: "center" },
  btnGhostHover: { borderColor: "rgba(255,255,255,0.28)", backgroundColor: "rgba(255,255,255,0.06)" },
  btnGhostText: { color: C.white, fontSize: 13, fontWeight: "700" },
  btnPrimary: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 11, paddingHorizontal: 20, borderRadius: 12, backgroundColor: C.yellow, minHeight: 44, justifyContent: "center" },
  btnPrimaryText: { color: "#241B00", fontSize: 13, fontWeight: "800" },

  // edit goals
  goalCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: C.borderSoft, borderRadius: 14, padding: 12, marginBottom: 10 },
  goalCheck: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 4 },
  goalCheckOn: { backgroundColor: C.green },
  goalCheckOff: { borderWidth: 1.5, borderColor: "rgba(255,255,255,0.25)" },
  inputTitle: { color: C.white, fontSize: 14, fontWeight: "700", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: C.borderSoft },
  inputDesc: { color: C.dim, fontSize: 12.5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: C.borderSoft },
  delBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 2 },
  addRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: C.border, minHeight: 44 },
  addText: { color: C.yellow, fontSize: 13, fontWeight: "700" },

  // progress
  center: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 40 },
  centerText: { color: C.dim, fontSize: 13, textAlign: "center", maxWidth: 300 },
  progTop: { flexDirection: "row", alignItems: "center", gap: 20, marginBottom: 16 },
  progSummary: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 14 },
  progCell: { minWidth: 68 },
  progVal: { color: C.white, fontSize: 20, fontWeight: "800" },
  progLbl: { color: C.dim, fontSize: 11, marginTop: 1 },
  fitnessRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { color: C.white, fontSize: 11.5, fontWeight: "700" },
  sectionLbl: { color: C.dim, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6, marginTop: 18, marginBottom: 10 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: { flexGrow: 1, minWidth: 130, backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: C.borderSoft, borderRadius: 12, padding: 12 },
  metricLbl: { color: C.dim, fontSize: 11 },
  metricVal: { color: C.white, fontSize: 18, fontWeight: "800", marginTop: 3 },
  deltaRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  deltaText: { fontSize: 11.5, fontWeight: "700" },
  weekRow: { flexDirection: "row", alignItems: "flex-end", gap: 5, height: 90 },
  weekCol: { flex: 1, alignItems: "center", gap: 6 },
  weekBarTrack: { flex: 1, width: "100%", maxWidth: 22, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.04)", justifyContent: "flex-end", overflow: "hidden" },
  weekBar: { width: "100%", borderRadius: 5 },
  weekNum: { color: C.dim, fontSize: 9 },

  // adaptations
  timelineRow: { flexDirection: "row", gap: 12 },
  timelineLeft: { alignItems: "center", width: 42 },
  adaptAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.08)" },
  timelineLine: { flex: 1, width: 2, backgroundColor: C.borderSoft, marginTop: 6, minHeight: 12 },
  adaptBubble: { flex: 1, backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: C.borderSoft, borderRadius: 14, padding: 13, marginBottom: 14 },
  adaptBubbleHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 },
  triggerChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,194,10,0.12)", borderWidth: 1, borderColor: "rgba(255,194,10,0.3)", borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  triggerText: { color: C.yellow, fontSize: 11, fontWeight: "700" },
  adaptWhen: { color: C.dim, fontSize: 11 },
  adaptBody: { color: C.white, fontSize: 13, lineHeight: 19 },
});
