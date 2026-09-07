import React from "react";
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput,
  ActivityIndicator, Platform, KeyboardAvoidingView,
} from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import type { IoniconName } from "@/src/lib/icon-types";
import { Image } from "expo-image";
import Svg, { Path, Circle, Line, Rect, Text as SvgText } from "react-native-svg";
import { C, ProgressRing, PlanPhase, KeyWorkout, WorkoutProfile } from "./plan";
import { CoachPersona } from "../lib/coach-persona";
import {
  EditableGoal, savePlanGoals, PlanProgressDetail, fetchPlanProgress,
  AdaptationEntry, fetchAdaptations, AdaptationDetail, fetchAdaptationDetail,
} from "../lib/plan";
import { getWorkout, buildSegments } from "../lib/workout-catalog";

/* ── shared modal shell ─────────────────────────────────────────────────── */
function ModalShell({
  visible, onClose, title, subtitle, icon, iconColor = C.yellow, maxWidth = 760, children, footer,
}: {
  visible: boolean; onClose: () => void; title: string; subtitle?: string;
  icon: IoniconName; iconColor?: string; maxWidth?: number;
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
  const selectedCount = draft.filter((g) => g.status === "complete").length;
  const toggle = (id: string) => {
    const g = draft.find((x) => x.id === id);
    if (!g) return;
    // Enforce exactly three selected focus goals.
    if (g.status !== "complete" && selectedCount >= 3) return;
    update(id, { status: g.status === "complete" ? "incomplete" : "complete" });
  };
  const remove = (id: string) => setDraft((d) => d.filter((g) => g.id !== id));
  const add = () => setDraft((d) => [...d, { id: `new-${Date.now()}-${goalSeq++}`, title: "", description: "", status: "incomplete" }]);

  const save = async () => {
    const clean = draft.filter((g) => g.title.trim());
    if (clean.filter((g) => g.status === "complete").length !== 3) return;
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
      subtitle="Choose exactly 3 focus goals for this training block." icon="disc-outline" iconColor={C.rouge}
      footer={
        <View style={m.footerRow}>
          <Text style={[m.selHint, selectedCount === 3 ? m.selHintOk : m.selHintWarn]}>
            {selectedCount === 3 ? "3 of 3 selected" : `Select 3 goals (${selectedCount}/3)`}
          </Text>
          <View style={{ flex: 1 }} />
          <Pressable testID="goals-cancel" onPress={onClose} style={({ hovered }: any) => [m.btnGhost, hovered && m.btnGhostHover]}>
            <Text style={m.btnGhostText}>Cancel</Text>
          </Pressable>
          <Pressable testID="goals-save" onPress={save} disabled={saving || selectedCount !== 3} style={({ hovered }: any) => [m.btnPrimary, hovered && { opacity: 0.9 }, (saving || selectedCount !== 3) && { opacity: 0.6 }]}>
            {saving ? <ActivityIndicator size="small" color="#241B00" /> : <Ionicons name="checkmark" size={16} color="#241B00" />}
            <Text style={m.btnPrimaryText}>{saving ? "Saving…" : "Save Goals"}</Text>
          </Pressable>
        </View>
      }
    >
      {draft.map((g) => {
        const on = g.status === "complete";
        const disabled = !on && selectedCount >= 3;
        return (
        <View key={g.id} style={[m.goalCard, disabled && { opacity: 0.55 }]}>
          <Pressable testID={`goal-toggle-${g.id}`} onPress={() => toggle(g.id)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
            style={[m.goalCheck, on ? m.goalCheckOn : m.goalCheckOff]}>
            {on ? <Ionicons name="checkmark" size={16} color="#04210F" /> : null}
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
        );
      })}
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

export function AdaptationsModal({ visible, onClose, persona, planId = "build-and-climb" }: { visible: boolean; onClose: () => void; persona: CoachPersona; planId?: string }) {
  const [items, setItems] = React.useState<AdaptationEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(false);
  const [detail, setDetail] = React.useState<AdaptationDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(true);

  React.useEffect(() => {
    if (!visible) return;
    let alive = true;
    setLoading(true); setErr(false);
    fetchAdaptations(persona.name)
      .then((d) => { if (alive) setItems(d); })
      .catch(() => { if (alive) setErr(true); })
      .finally(() => { if (alive) setLoading(false); });

    setDetailLoading(true); setDetail(null);
    fetchAdaptationDetail(persona.name, persona.gender, planId)
      .then((d) => { if (alive) setDetail(d); })
      .finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [visible, persona.name, persona.gender, planId]);

  return (
    <ModalShell visible={visible} onClose={onClose} title={`${persona.name}'s Adaptations`} subtitle="How your companion coach has adjusted the plan over time." icon="git-branch-outline" iconColor={C.rouge} maxWidth={680}>
      {/* Why this adaptation — AI-generated reasoning */}
      <View style={m.reasonCard} testID="adaptation-reasoning">
        <View style={m.reasonHead}>
          <Ionicons name="sparkles" size={14} color={C.yellow} />
          <Text style={m.reasonHeadText}>WHY {persona.name.toUpperCase()} ADJUSTED YOUR PLAN</Text>
        </View>
        {detailLoading ? (
          <View style={[m.center, { paddingVertical: 22 }]}><ActivityIndicator color={C.yellow} /><Text style={m.centerText}>{persona.name} is reviewing your training…</Text></View>
        ) : !detail ? (
          <Text style={m.reasonSummary}>Finish a few rides and {persona.name} will explain exactly how your plan is being tuned.</Text>
        ) : (
          <>
            {detail.summary ? <Text style={m.reasonSummary}>{detail.summary}</Text> : null}
            {detail.factors.map((f, i) => (
              <View key={i} style={m.factorRow}>
                <View style={m.factorDot} />
                <View style={{ flex: 1 }}>
                  <Text style={m.factorLabel}>{f.label}</Text>
                  <Text style={m.factorDetail}>{f.detail}</Text>
                </View>
              </View>
            ))}
            {detail.adjustments.length > 0 && (
              <View style={m.adjBox}>
                <Text style={m.adjHead}>WHAT CHANGED</Text>
                {detail.adjustments.map((a, i) => (
                  <View key={i} style={m.adjRow}>
                    <Ionicons name="arrow-forward-circle" size={14} color={C.green} style={{ marginTop: 1 }} />
                    <Text style={m.adjText}>{a}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </View>

      <Text style={m.histLabel}>ADAPTATION HISTORY</Text>
      {loading ? (
        <View style={m.center}><ActivityIndicator color={C.yellow} /><Text style={m.centerText}>Loading history…</Text></View>
      ) : err ? (
        <View style={m.center}><Ionicons name="cloud-offline-outline" size={26} color={C.dim} /><Text style={m.centerText}>Could not load adaptations.</Text></View>
      ) : items.length === 0 ? (
        <View style={m.center}><Ionicons name="sparkles-outline" size={26} color={C.dim} /><Text style={m.centerText}>No adaptations yet. Finish a ride and your companion coach will adjust the plan.</Text></View>
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

/* ── Phase detail (per-phase breakdown, current highlighted) ─────────────── */
export function PhaseDetailModal({ visible, onClose, phases, selectedId }: { visible: boolean; onClose: () => void; phases: PlanPhase[]; selectedId?: string }) {
  return (
    <ModalShell visible={visible} onClose={onClose} title="Training Phases" subtitle="Each phase of your journey — your current phase is highlighted." icon="layers-outline" iconColor={C.yellow} maxWidth={640}>
      {phases.map((p) => {
        const active = !!p.active;
        const isSel = p.id === selectedId;
        return (
          <View key={p.id} testID={`phase-detail-${p.id}`} style={[m.phaseItem, active && m.phaseItemActive, isSel && !active && m.phaseItemSel]}>
            <View style={[m.phaseNum, active && { backgroundColor: C.yellow, borderColor: C.yellow }]}>
              {p.number === 4
                ? <Ionicons name="flag" size={15} color={active ? "#241B00" : C.dim} />
                : <Text style={[m.phaseNumText, active && { color: "#241B00" }]}>{p.number}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <View style={m.phaseItemHead}>
                <Text style={[m.phaseItemName, active && { color: C.white }]}>{p.name}</Text>
                {active ? <View style={m.currentChip}><Text style={m.currentChipText}>CURRENT</Text></View> : null}
              </View>
              <Text style={m.phaseItemWeeks}>{p.weeks} · {p.pct}% complete</Text>
              {p.objective ? <Text style={m.phaseItemObjective}>{p.objective}</Text> : null}
              <View style={m.phaseProgTrack}><View style={[m.phaseProgFill, { width: `${Math.max(2, p.pct)}%`, backgroundColor: active ? C.yellow : C.rouge }]} /></View>
            </View>
          </View>
        );
      })}
    </ModalShell>
  );
}

/* ── Key-workout detail (steps + profile) ───────────────────────────────── */
export function KeyWorkoutDetailModal({ visible, onClose, workout, onOpen, onSwap }: { visible: boolean; onClose: () => void; workout: KeyWorkout | null; onOpen?: (w: KeyWorkout) => void; onSwap?: (w: KeyWorkout) => void }) {
  const segs = React.useMemo(() => {
    if (!workout?.id) return [];
    const w = getWorkout(workout.id);
    return w ? buildSegments(w) : [];
  }, [workout]);
  if (!workout) return null;
  const done = !!workout.completed;
  const canSwap = !!onSwap && typeof workout.id === "string" && workout.id.startsWith("custom-");
  return (
    <ModalShell
      visible={visible} onClose={onClose} title={workout.title}
      subtitle={workout.footer} icon={done ? "checkmark-circle" : (workout.icon as any)} iconColor={done ? C.green : workout.color} maxWidth={560}
      footer={(onOpen || canSwap) ? (
        <View style={m.footerRow}>
          {canSwap ? (
            <Pressable testID="workout-detail-swap" onPress={() => onSwap!(workout)} style={({ hovered }: any) => [m.btnGhost, { flex: 1, flexDirection: "row", alignItems: "center", gap: 7 }, hovered && m.btnGhostHover]}>
              <Ionicons name="swap-horizontal" size={15} color={C.white} />
              <Text style={m.btnGhostText}>Swap session</Text>
            </Pressable>
          ) : null}
          {onOpen ? (
            <Pressable testID="workout-detail-open" onPress={() => onOpen(workout)} style={({ hovered }: any) => [m.btnPrimary, { flex: 1.3 }, hovered && { opacity: 0.9 }]}>
              <Ionicons name="play" size={15} color="#241B00" />
              <Text style={m.btnPrimaryText}>Open in Training</Text>
            </Pressable>
          ) : null}
        </View>
      ) : undefined}
    >
      <View style={m.woMetaRow}>
        <View style={[m.zoneTag, { borderColor: done ? C.green : workout.color }]}><Text style={[m.zoneTagText, { color: done ? C.green : workout.color }]}>{workout.zone || (workout.type ?? "").toUpperCase()}</Text></View>
        <View style={m.woMetaCell}><Ionicons name="time-outline" size={14} color={C.dim} /><Text style={m.woMetaText}>{done && workout.actual_duration ? workout.actual_duration : workout.duration}</Text></View>
        {workout.tss ? <View style={m.woMetaCell}><Ionicons name="flash" size={14} color={C.yellow} /><Text style={m.woMetaText}>{done && workout.actual_tss ? workout.actual_tss : workout.tss}</Text></View> : null}
      </View>
      {workout.subtitle ? <Text style={m.woDesc}>{workout.subtitle}</Text> : null}
      {workout.profile?.length ? (
        <View style={m.woProfileBox}><WorkoutProfile bars={workout.profile} color={done ? C.green : workout.color} width={480} height={64} /></View>
      ) : null}
      {segs.length ? (
        <>
          <Text style={m.stepsLabel}>WORKOUT STEPS</Text>
          {segs.map((seg, i) => (
            <View key={i} style={m.stepRow}>
              <View style={[m.stepDot, { backgroundColor: seg.color }]} />
              <Text style={m.stepName} numberOfLines={2}>{seg.label}</Text>
              <Text style={m.stepMeta}>{Math.max(1, Math.round(seg.durationSec / 60))} min</Text>
            </View>
          ))}
        </>
      ) : (
        <View style={[m.center, { paddingVertical: 24 }]}>
          <Ionicons name="list-outline" size={22} color={C.dim} />
          <Text style={m.centerText}>Detailed steps will appear once this session is scheduled.</Text>
        </View>
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
  footerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  selHint: { fontSize: 12, fontWeight: "700" },
  selHintOk: { color: C.green },
  selHintWarn: { color: C.dim },

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

  // adaptation reasoning (AI detail)
  reasonCard: { backgroundColor: "rgba(255,194,10,0.05)", borderWidth: 1, borderColor: "rgba(255,194,10,0.22)", borderRadius: 14, padding: 14, marginBottom: 18 },
  reasonHead: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
  reasonHeadText: { color: C.yellow, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6 },
  reasonSummary: { color: C.white, fontSize: 13.5, lineHeight: 20, marginBottom: 10 },
  factorRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  factorDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.yellow, marginTop: 6 },
  factorLabel: { color: C.white, fontSize: 12.5, fontWeight: "800" },
  factorDetail: { color: C.dim, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  adjBox: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,194,10,0.18)" },
  adjHead: { color: C.green, fontSize: 10, fontWeight: "800", letterSpacing: 0.6, marginBottom: 7 },
  adjRow: { flexDirection: "row", gap: 8, marginBottom: 7 },
  adjText: { color: C.white, fontSize: 12.5, lineHeight: 18, flex: 1 },
  histLabel: { color: C.dim, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6, marginBottom: 12 },

  // phase detail
  phaseItem: { flexDirection: "row", gap: 12, backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: C.borderSoft, borderRadius: 14, padding: 13, marginBottom: 10 },
  phaseItemActive: { borderColor: "rgba(255,194,10,0.5)", backgroundColor: "rgba(255,194,10,0.06)" },
  phaseItemSel: { borderColor: "rgba(255,255,255,0.25)" },
  phaseNum: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.03)" },
  phaseNumText: { color: C.dim, fontSize: 15, fontWeight: "800" },
  phaseItemHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  phaseItemName: { color: C.dim, fontSize: 15, fontWeight: "800", flex: 1 },
  currentChip: { backgroundColor: C.yellow, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 9 },
  currentChipText: { color: "#241B00", fontSize: 9.5, fontWeight: "900", letterSpacing: 0.5 },
  phaseItemWeeks: { color: C.dim, fontSize: 12, marginTop: 2 },
  phaseItemObjective: { color: C.white, fontSize: 13, lineHeight: 19, marginTop: 7 },
  phaseProgTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 10 },
  phaseProgFill: { height: "100%", borderRadius: 3 },

  // key-workout detail
  woMetaRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 10 },
  woMetaCell: { flexDirection: "row", alignItems: "center", gap: 5 },
  woMetaText: { color: C.white, fontSize: 13, fontWeight: "700" },
  zoneTag: { borderWidth: 1, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 11 },
  zoneTagText: { fontSize: 11, fontWeight: "800" },
  woDesc: { color: C.dim, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  woProfileBox: { backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 12, borderWidth: 1, borderColor: C.borderSoft, padding: 12, marginBottom: 14, alignItems: "center" },
  stepsLabel: { color: C.dim, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.8, marginBottom: 10 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.borderSoft },
  stepDot: { width: 8, height: 8, borderRadius: 4 },
  stepName: { color: C.white, fontSize: 13, fontWeight: "600", flex: 1 },
  stepMeta: { color: C.dim, fontSize: 12, fontWeight: "700" },
});
