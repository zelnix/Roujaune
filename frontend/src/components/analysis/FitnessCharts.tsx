import React from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator } from "react-native";
import Svg, { Path, Polyline, Line, Rect, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/src/theme";
import { PmcPoint, PowerRecord, WeeklyDigest, FormTarget, WeeklyNote, TaperNote, Streak, Milestones, saveEvent, fetchTaperNote, applyTaper } from "@/src/lib/analysis";
import { useCoach } from "@/src/lib/coach-persona";
import { useCoachSpeech } from "@/src/hooks/useCoachSpeech";

const FITNESS = "#3FB68B";   // CTL
const FATIGUE = "#F2792E";   // ATL
const FORM_POS = "#5B8DEF";  // fresh
const FORM_NEG = "#F2392E";  // fatigued

/** Performance Management Chart: Fitness (CTL) area + Fatigue (ATL) line, with a
 *  Form (TSB) strip below. A dashed continuation projects the next ~2 weeks. */
export function PmcChart({ series, forecast = [] }: { series: PmcPoint[]; forecast?: PmcPoint[] }) {
  const [w, setW] = React.useState(320);
  const H = 170, FH = 46, padT = 10, padB = 18, padL = 4, padR = 4;
  const all = React.useMemo(() => [...series, ...forecast], [series, forecast]);
  const n = all.length;
  const nH = series.length;
  const geom = React.useMemo(() => {
    if (n < 2 || nH < 2) return null;
    const cw = Math.max(1, w - padL - padR), ch = H - padT - padB;
    const maxLoad = Math.max(1, ...all.map((s) => Math.max(s.ctl, s.atl))) * 1.1;
    const x = (i: number) => padL + (i / (n - 1)) * cw;
    const y = (v: number) => padT + ch - (v / maxLoad) * ch;
    const histTop = series.map((s, i) => `${x(i).toFixed(1)},${y(s.ctl).toFixed(1)}`).join(" ");
    const ctlArea = `M${padL},${padT + ch} L${histTop} L${x(nH - 1).toFixed(1)},${padT + ch} Z`;
    const atlLine = series.map((s, i) => `${x(i).toFixed(1)},${y(s.atl).toFixed(1)}`).join(" ");
    let fcLine = "";
    if (forecast.length) {
      fcLine = `${x(nH - 1).toFixed(1)},${y(series[nH - 1].ctl).toFixed(1)} ` +
        forecast.map((s, i) => `${x(nH + i).toFixed(1)},${y(s.ctl).toFixed(1)}`).join(" ");
    }
    const tsbAbs = Math.max(1, ...all.map((s) => Math.abs(s.tsb)));
    return { cw, ch, x, y, ctlArea, atlLine, fcLine, todayX: x(nH - 1), tsbAbs };
  }, [all, series, forecast, w, n, nH]);

  if (!geom) return <Text style={s.empty}>Not enough ride history yet — finish or upload a few rides to see your fitness trend.</Text>;

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={H}>
        <Defs>
          <SvgGrad id="ctlFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={FITNESS} stopOpacity="0.4" />
            <Stop offset="1" stopColor={FITNESS} stopOpacity="0.05" />
          </SvgGrad>
        </Defs>
        <Path d={geom.ctlArea} fill="url(#ctlFill)" stroke={FITNESS} strokeWidth={2} />
        <Polyline points={geom.atlLine} fill="none" stroke={FATIGUE} strokeWidth={1.8} strokeDasharray="1 0" />
        {geom.fcLine ? (
          <>
            <Line x1={geom.todayX} y1={padT} x2={geom.todayX} y2={padT + geom.ch} stroke="rgba(255,255,255,0.28)" strokeWidth={1} strokeDasharray="3 3" />
            <Polyline points={geom.fcLine} fill="none" stroke={FITNESS} strokeWidth={2} strokeDasharray="5 4" strokeOpacity={0.85} />
          </>
        ) : null}
      </Svg>

      {/* Form strip */}
      <View style={{ marginTop: 6 }}>
        <Text style={s.stripLabel}>FORM (TSB){forecast.length ? "  ·  dashed = projected" : ""}</Text>
        <Svg width={w} height={FH}>
          <Line x1={padL} y1={FH / 2} x2={w - padR} y2={FH / 2} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
          {all.map((sp, i) => {
            const bx = padL + (i / (n - 1)) * (w - padL - padR);
            const h = (Math.abs(sp.tsb) / geom.tsbAbs) * (FH / 2 - 3);
            const up = sp.tsb >= 0;
            const proj = i >= nH;
            return <Rect key={i} x={bx - 0.8} y={up ? FH / 2 - h : FH / 2} width={1.6} height={Math.max(0.5, h)} fill={up ? FORM_POS : FORM_NEG} opacity={proj ? 0.4 : 0.85} />;
          })}
        </Svg>
      </View>

      <View style={s.legend}>
        <Leg c={FITNESS} label="Fitness (CTL)" />
        <Leg c={FATIGUE} label="Fatigue (ATL)" />
        <Leg c={FORM_POS} label="Form +" />
        <Leg c={FORM_NEG} label="Form −" />
        {forecast.length ? <Leg c={FITNESS} label="Projected" dashed /> : null}
      </View>
    </View>
  );
}

function Leg({ c, label, dashed }: { c: string; label: string; dashed?: boolean }) {
  return (
    <View style={s.legItem}>
      {dashed
        ? <View style={[s.dashDot, { borderColor: c }]} />
        : <View style={[s.dot, { backgroundColor: c }]} />}
      <Text style={s.legText}>{label}</Text>
    </View>
  );
}

/** Form Forecast summary — where the rider's fitness/form is heading. */
export function ForecastSummary({ fitness, form, state, dailyTss, weeks = 2 }: {
  fitness: number; form: number; state: string; dailyTss: number; weeks?: number;
}) {
  const formColor = form > 5 ? FORM_POS : form < -10 ? FORM_NEG : colors.yellow;
  return (
    <View style={s.fcCard}>
      <View style={s.fcHead}>
        <Ionicons name="trending-up" size={16} color={FITNESS} />
        <Text style={s.fcTitle}>In {weeks} weeks</Text>
        <View style={[s.pill, { backgroundColor: formColor + "22", borderColor: formColor + "55" }]}>
          <Text style={[s.pillText, { color: formColor }]}>{state}</Text>
        </View>
      </View>
      <View style={s.fcRow}>
        <View style={s.fcStat}>
          <Text style={s.fcVal}>{Math.round(fitness)}</Text>
          <Text style={s.fcLabel}>Projected fitness</Text>
        </View>
        <View style={s.fcStat}>
          <Text style={[s.fcVal, { color: formColor }]}>{form > 0 ? "+" : ""}{Math.round(form)}</Text>
          <Text style={s.fcLabel}>Projected form</Text>
        </View>
      </View>
      <Text style={s.fcNote}>Assuming you keep your recent training rhythm (~{Math.round(dailyTss)} TSS/day). Ride more to build fitness; ease off and Form climbs toward fresh.</Text>
    </View>
  );
}

/** Big Fitness/Fatigue/Form summary cards. */
export function PmcSummary({ fitness, fatigue, form, state, ramp, weeklyTss }: {
  fitness: number; fatigue: number; form: number; state: string; ramp: number; weeklyTss: number;
}) {
  const formColor = form > 5 ? FORM_POS : form < -10 ? FORM_NEG : colors.yellow;
  return (
    <View>
      <View style={s.cards}>
        <Big label="FITNESS" sub="CTL" value={Math.round(fitness)} c={FITNESS} />
        <Big label="FATIGUE" sub="ATL" value={Math.round(fatigue)} c={FATIGUE} />
        <Big label="FORM" sub="TSB" value={Math.round(form)} c={formColor} signed />
      </View>
      <View style={s.stateRow}>
        <View style={[s.pill, { backgroundColor: formColor + "22", borderColor: formColor + "55" }]}>
          <Text style={[s.pillText, { color: formColor }]}>{state}</Text>
        </View>
        <Text style={s.metaText}>Ramp {ramp >= 0 ? "+" : ""}{ramp}/wk · {weeklyTss} TSS this week</Text>
      </View>
    </View>
  );
}

function Big({ label, sub, value, c, signed }: { label: string; sub: string; value: number; c: string; signed?: boolean }) {
  return (
    <View style={s.big}>
      <Text style={s.bigLabel}>{label}</Text>
      <Text style={[s.bigVal, { color: c }]}>{signed && value > 0 ? "+" : ""}{value}</Text>
      <Text style={s.bigSub}>{sub}</Text>
    </View>
  );
}

/** All-time best power grid (5s / 1m / 5m / 20m). */
export function RecordsGrid({ records, hasData }: { records: PowerRecord[]; hasData: boolean }) {
  const router = useRouter();
  if (!hasData) {
    return <Text style={s.empty}>No power records yet. Upload a ride with power data and your bests for 5s, 1min, 5min & 20min will appear here.</Text>;
  }
  return (
    <View style={s.recGrid}>
      {records.map((r) => (
        <Pressable key={r.secs} style={s.rec} disabled={!r.activity_id} onPress={() => r.activity_id && router.push(`/activity/${r.activity_id}`)} testID={`record-${r.secs}`}>
          <View style={s.recTop}>
            <Ionicons name="flash" size={14} color={colors.yellow} />
            <Text style={s.recDur}>{r.label}</Text>
          </View>
          <Text style={s.recW}>{r.watts != null ? `${r.watts}` : "—"}<Text style={s.recUnit}> W</Text></Text>
          {r.name ? <Text style={s.recWhen} numberOfLines={1}>{r.name}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

/** Weekly Digest — this week's TSS, hours, rides, distance (vs last week) plus
 *  any new all-time power records set this week. */
export function WeeklyDigestCard({ digest, onShare }: { digest: WeeklyDigest; onShare?: () => void }) {
  const router = useRouter();
  const tw = digest.this_week, d = digest.deltas;
  const deltaChip = (v: number, unit: string, betterHigh = true) => {
    if (!v) return <Text style={[s.wdDelta, { color: colors.textFaint }]}>±0 vs last wk</Text>;
    const good = betterHigh ? v > 0 : v < 0;
    return <Text style={[s.wdDelta, { color: good ? FITNESS : colors.textDim }]}>{v > 0 ? "+" : ""}{v}{unit} vs last wk</Text>;
  };
  return (
    <View>
      {onShare && (
        <Pressable onPress={onShare} style={s.shareBtn} testID="digest-share" hitSlop={8}>
          <Ionicons name="share-social" size={15} color={colors.yellow} />
          <Text style={s.shareBtnT}>Share</Text>
        </Pressable>
      )}
      <View style={s.wd}>
        <View style={s.wdTile}>
          <Text style={s.wdVal}>{tw.tss}</Text>
          <Text style={s.wdLabel}>TSS</Text>
          {deltaChip(d.tss, "")}
        </View>
        <View style={s.wdTile}>
          <Text style={s.wdVal}>{tw.hours}<Text style={s.wdUnit}> h</Text></Text>
          <Text style={s.wdLabel}>TRAINING TIME</Text>
          {deltaChip(d.hours, "h")}
        </View>
        <View style={s.wdTile}>
          <Text style={s.wdVal}>{tw.rides}</Text>
          <Text style={s.wdLabel}>RIDES</Text>
          {deltaChip(d.rides, "")}
        </View>
        <View style={s.wdTile}>
          <Text style={s.wdVal}>{tw.distance_km}<Text style={s.wdUnit}> km</Text></Text>
          <Text style={s.wdLabel}>DISTANCE</Text>
          {deltaChip(d.distance_km, "km")}
        </View>
      </View>

      <View style={s.wdRecordsHead}>
        <Ionicons name="trophy" size={15} color={colors.yellow} />
        <Text style={s.wdRecordsTitle}>New power records</Text>
      </View>
      {digest.new_records.length === 0 ? (
        <Text style={s.wdEmpty}>
          {digest.has_activity
            ? "No new records this week — but every ride builds your base. Keep pushing!"
            : "No rides logged this week yet. Ride to set fresh power records."}
        </Text>
      ) : (
        digest.new_records.map((r) => (
          <Pressable key={r.secs} style={s.wdRecord} disabled={!r.activity_id}
            onPress={() => r.activity_id && router.push(`/activity/${r.activity_id}`)} testID={`digest-record-${r.secs}`}>
            <View style={s.wdRecordBadge}><Ionicons name="flash" size={15} color={colors.yellow} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.wdRecordLabel}>{r.label} best</Text>
              <Text style={s.wdRecordSub} numberOfLines={1}>{r.prev != null ? `Beat your old ${r.prev} W · ` : "First record · "}{r.name}</Text>
            </View>
            <Text style={s.wdRecordW}>{r.watts} W</Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

/** Form Target — set an event date and see whether projected Form lands fresh. */
export function FormTargetCard({ target, onChanged }: { target: FormTarget | null; onChanged: () => void }) {
  const [name, setName] = React.useState(target?.event_name || "");
  const [saving, setSaving] = React.useState(false);
  const [taper, setTaper] = React.useState<TaperNote | null>(null);
  const [taperLoading, setTaperLoading] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [applyMsg, setApplyMsg] = React.useState<string | null>(null);
  const coach = useCoach();
  const { speak, speakingId } = useCoachSpeech(coach.id);
  React.useEffect(() => { setName(target?.event_name || ""); }, [target?.event_name]);

  // When the rider won't arrive fresh, ask the coach for a taper plan.
  React.useEffect(() => {
    if (target?.has_event && !target?.past && target?.fresh === false) {
      setTaperLoading(true);
      fetchTaperNote(coach.name, coach.gender).then((t) => { setTaper(t); setTaperLoading(false); });
    } else {
      setTaper(null);
    }
  }, [target?.has_event, target?.past, target?.fresh, target?.event_date, coach.name, coach.gender]);

  const onApplyTaper = async () => {
    setApplying(true);
    const r = await applyTaper(coach.name);
    setApplying(false);
    if (r?.applied) setApplyMsg(r.already ? `Week ${r.week} is already eased for your taper.` : `Done — I've eased week ${r.week} to taper you. Check your Training Plan.`);
    else if (r?.reason === "unstructured" || r?.reason === "no_plan") setApplyMsg("Auto-apply needs a structured training plan. I've still laid out the taper steps above for you to follow.");
    else setApplyMsg("Couldn't adjust the plan automatically — follow the steps above.");
  };

  const setInWeeks = async (weeks: number) => {
    setSaving(true);
    const dt = new Date(); dt.setDate(dt.getDate() + weeks * 7);
    await saveEvent(dt.toISOString().slice(0, 10), name || "My event");
    setSaving(false); onChanged();
  };
  const clear = async () => { setSaving(true); await saveEvent(null, null); setSaving(false); onChanged(); };

  const has = target?.has_event && !target?.past;
  const fresh = target?.fresh;
  const col = fresh ? FORM_POS : (target?.projected_form ?? 0) < -10 ? FORM_NEG : colors.yellow;
  const dateLabel = target?.event_date ? new Date(target.event_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

  return (
    <View>
      <View style={s.eventInputRow}>
        <TextInput
          testID="event-name" value={name} onChangeText={setName} placeholder="Event name (e.g. Gran Fondo)"
          placeholderTextColor={colors.textFaint} style={s.eventInput}
        />
      </View>
      <View style={s.presetRow}>
        {[4, 8, 12].map((w) => (
          <Pressable key={w} onPress={() => setInWeeks(w)} disabled={saving} style={s.preset} testID={`event-in-${w}w`}>
            <Text style={s.presetT}>In {w} wks</Text>
          </Pressable>
        ))}
        {target?.has_event && (
          <Pressable onPress={clear} disabled={saving} style={[s.preset, s.presetClear]} testID="event-clear">
            <Ionicons name="close" size={13} color={colors.textDim} />
            <Text style={[s.presetT, { color: colors.textDim }]}>Clear</Text>
          </Pressable>
        )}
      </View>

      {target?.has_event && target?.past && (
        <Text style={s.wdEmpty}>Your event date has passed — set a new one to keep targeting fresh legs.</Text>
      )}
      {has && (
        <View style={[s.targetBox, { borderColor: col + "55", backgroundColor: col + "14" }]} testID="form-target-result">
          <View style={{ flex: 1 }}>
            <Text style={s.targetTitle}>{target?.event_name || "Your event"}</Text>
            <Text style={s.targetSub}>{dateLabel} · {target?.days_out} days out</Text>
            <Text style={[s.targetVerdict, { color: col }]}>
              {fresh ? "On track to arrive fresh 🎉" : (target?.projected_form ?? 0) < -10 ? "You'll be carrying fatigue — plan a taper" : "Roughly neutral — a short taper will sharpen you"}
            </Text>
          </View>
          <View style={s.targetStat}>
            <Text style={[s.targetForm, { color: col }]}>{(target?.projected_form ?? 0) > 0 ? "+" : ""}{Math.round(target?.projected_form ?? 0)}</Text>
            <Text style={s.targetFormL}>proj. form</Text>
          </View>
        </View>
      )}

      {has && !fresh && (
        <View style={s.taperBox} testID="taper-plan">
          {taperLoading ? (
            <View style={{ paddingVertical: 14, alignItems: "center" }}><ActivityIndicator color={colors.yellow} /></View>
          ) : taper?.note ? (
            <>
              <View style={s.taperHead}>
                <View style={s.coachChip}><Ionicons name="person-circle" size={16} color={colors.yellow} /><Text style={s.coachChipT}>{coach.name}'s taper plan</Text></View>
                <Pressable onPress={() => speak("taper", `${taper.note} ${(taper.actions || []).join(". ")}`)} style={s.playBtnSm} testID="taper-play" hitSlop={8}>
                  <Ionicons name={speakingId === "taper" ? "stop" : "volume-high"} size={14} color="#241B00" />
                  <Text style={s.playBtnSmT}>{speakingId === "taper" ? "Stop" : "Listen"}</Text>
                </Pressable>
              </View>
              <Text style={s.noteText}>{taper.note}</Text>
              {(taper.actions || []).map((a, i) => (
                <View key={i} style={s.taperAction}>
                  <Ionicons name="checkmark-circle" size={15} color={FITNESS} />
                  <Text style={s.taperActionT}>{a}</Text>
                </View>
              ))}
              {applyMsg ? (
                <Text style={s.applyMsg}>{applyMsg}</Text>
              ) : (
                <Pressable onPress={onApplyTaper} disabled={applying} style={s.applyBtn} testID="taper-apply-btn">
                  {applying ? <ActivityIndicator size="small" color="#241B00" /> : <Ionicons name="build" size={14} color="#241B00" />}
                  <Text style={s.applyBtnT}>Apply taper to my plan</Text>
                </Pressable>
              )}
            </>
          ) : null}
        </View>
      )}
      {!target?.has_event && (
        <Text style={s.wdEmpty}>Set your goal event and I'll project whether your Form lands fresh on the day — so you can time your taper.</Text>
      )}
    </View>
  );
}

/** Coach Weekly Note — a short spoken recap + one focus, in the coach's voice. */
export function CoachWeeklyNote({ note, loading, onRefresh }: { note: WeeklyNote | null; loading: boolean; onRefresh: () => void }) {
  const coach = useCoach();
  const { speak, speakingId } = useCoachSpeech(coach.id);
  const speaking = speakingId === "weekly-note";
  const full = note ? `${note.note} ${note.focus ? "This week's focus: " + note.focus : ""}` : "";
  return (
    <View>
      {loading ? (
        <View style={{ paddingVertical: 20, alignItems: "center" }}><ActivityIndicator color={colors.yellow} /></View>
      ) : note ? (
        <>
          <View style={s.noteHead}>
            <View style={s.coachChip}>
              <Ionicons name="person-circle" size={18} color={colors.yellow} />
              <Text style={s.coachChipT}>{coach.name}</Text>
            </View>
            <Pressable onPress={() => speak("weekly-note", full)} style={s.playBtn} testID="weekly-note-play" hitSlop={8}>
              <Ionicons name={speaking ? "stop" : "volume-high"} size={16} color="#241B00" />
              <Text style={s.playBtnT}>{speaking ? "Stop" : "Listen"}</Text>
            </Pressable>
          </View>
          <Text style={s.noteText}>{note.note}</Text>
          {note.focus ? (
            <View style={s.focusBox}>
              <Ionicons name="flag" size={14} color={colors.yellow} />
              <Text style={s.focusText}><Text style={{ fontWeight: "800", color: colors.white }}>This week: </Text>{note.focus}</Text>
            </View>
          ) : null}
          <Pressable onPress={onRefresh} style={s.refreshLink} testID="weekly-note-refresh" hitSlop={6}>
            <Ionicons name="refresh" size={12} color={colors.textDim} />
            <Text style={s.refreshT}>Regenerate</Text>
          </Pressable>
        </>
      ) : (
        <Text style={s.wdEmpty}>Your coach's weekly recap will appear here.</Text>
      )}
    </View>
  );
}

/** Share Streaks — weekly consistency streak with a shareable card. */
export function StreakCard({ streak, onShare }: { streak: Streak; onShare: () => void }) {
  const active = streak.active && streak.current_weeks > 0;
  const flames = Math.min(streak.current_weeks, 8);
  return (
    <View>
      <View style={s.streakTop}>
        <View style={[s.streakBig, { borderColor: active ? "rgba(242,121,46,0.5)" : colors.border }]}>
          <Ionicons name="flame" size={22} color={active ? "#F2792E" : colors.textFaint} />
          <Text style={[s.streakNum, { color: active ? colors.white : colors.textDim }]}>{streak.current_weeks}</Text>
          <Text style={s.streakUnit}>week{streak.current_weeks === 1 ? "" : "s"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.streakTitle}>{active ? "You're on a roll!" : "Start a new streak"}</Text>
          <Text style={s.streakSub}>
            {active
              ? `${streak.current_weeks} week${streak.current_weeks === 1 ? "" : "s"} in a row with a ride${streak.this_week_rides === 0 ? " — ride this week to keep it alive" : ""}.`
              : "Ride at least once this week to begin your consistency streak."}
          </Text>
          <Text style={s.streakBest}>Best streak: {streak.best_weeks} week{streak.best_weeks === 1 ? "" : "s"} · {streak.weeks_ridden} week{streak.weeks_ridden === 1 ? "" : "s"} ridden</Text>
        </View>
      </View>
      <View style={s.flames}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Ionicons key={i} name="flame" size={16} color={i < flames ? "#F2792E" : "rgba(255,255,255,0.1)"} />
        ))}
      </View>
      {streak.at_risk && (
        <View style={s.riskBox} testID="streak-at-risk">
          <Ionicons name="alert-circle" size={16} color="#F2792E" />
          <Text style={s.riskText}>
            Your {streak.current_weeks}-week streak is at risk — get a ride in within the next {streak.days_left + 1} day{streak.days_left + 1 === 1 ? "" : "s"} to keep it alive.
          </Text>
        </View>
      )}
      <Pressable onPress={onShare} style={s.streakShare} testID="streak-share" disabled={!active}>
        <Ionicons name="share-social" size={15} color={active ? "#241B00" : colors.textFaint} />
        <Text style={[s.streakShareT, !active && { color: colors.textFaint }]}>Share streak</Text>
      </Pressable>
    </View>
  );
}

/** Milestones — lifetime totals, progress to the next big number, and a
 *  celebratory highlight (with Share) when the last ride just crossed one. */
export function MilestonesCard({ data, onShare }: { data: Milestones; onShare: () => void }) {
  return (
    <View>
      {data.recent && (
        <View style={s.mileCelebrate} testID="milestone-celebrate">
          <View style={s.mileBadge}><Ionicons name="ribbon" size={22} color="#241B00" /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.mileTitle}>Milestone unlocked: {data.recent.label} 🎉</Text>
            <Text style={s.mileBlurb}>{data.recent.blurb}</Text>
          </View>
          <Pressable onPress={onShare} style={s.mileShare} testID="milestone-share">
            <Ionicons name="share-social" size={15} color="#241B00" />
            <Text style={s.mileShareT}>Share</Text>
          </Pressable>
        </View>
      )}
      <View style={s.mileGrid}>
        <View style={s.mileTile}><Text style={s.mileVal}>{data.total_rides}</Text><Text style={s.mileLabel}>RIDES</Text></View>
        <View style={s.mileTile}><Text style={s.mileVal}>{Math.round(data.total_km).toLocaleString()}<Text style={s.mileUnit}> km</Text></Text><Text style={s.mileLabel}>DISTANCE</Text></View>
        <View style={s.mileTile}><Text style={s.mileVal}>{Math.round(data.total_hours)}<Text style={s.mileUnit}> h</Text></Text><Text style={s.mileLabel}>TIME</Text></View>
        <View style={s.mileTile}><Text style={s.mileVal}>{data.total_tss.toLocaleString()}</Text><Text style={s.mileLabel}>TSS</Text></View>
      </View>
      <View style={s.mileNext}>
        {data.rides_to_next != null && <Text style={s.mileNextT}>🚴 {data.rides_to_next} ride{data.rides_to_next === 1 ? "" : "s"} to {data.next_rides}</Text>}
        {data.km_to_next != null && <Text style={s.mileNextT}>📏 {Math.round(data.km_to_next).toLocaleString()} km to {data.next_km?.toLocaleString()}</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  empty: { color: colors.textDim, fontSize: 13.5, lineHeight: 20 },
  stripLabel: { color: colors.textFaint, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.8, marginBottom: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 8 },
  legItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  dashDot: { width: 12, height: 0, borderTopWidth: 2, borderStyle: "dashed" },
  legText: { color: colors.textDim, fontSize: 11.5, fontWeight: "600" },

  fcCard: { backgroundColor: "rgba(63,182,139,0.07)", borderWidth: 1, borderColor: "rgba(63,182,139,0.28)", borderRadius: radius.lg, padding: 14, marginTop: 12 },
  fcHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  fcTitle: { color: colors.white, fontSize: 14, fontWeight: "800", flex: 1 },
  fcRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  fcStat: { flex: 1, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: radius.md, padding: 12, alignItems: "center" },
  fcVal: { color: FITNESS, fontSize: 26, fontWeight: "900" },
  fcLabel: { color: colors.textFaint, fontSize: 10.5, fontWeight: "700", marginTop: 2, letterSpacing: 0.3 },
  fcNote: { color: colors.textDim, fontSize: 11.5, lineHeight: 17, marginTop: 10 },

  wd: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  wdTile: { flexGrow: 1, flexBasis: "22%", minWidth: 110, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14 },
  wdVal: { color: colors.white, fontSize: 24, fontWeight: "900" },
  wdUnit: { color: colors.textFaint, fontSize: 12, fontWeight: "700" },
  wdLabel: { color: colors.textDim, fontSize: 11, fontWeight: "700", marginTop: 4, letterSpacing: 0.3 },
  wdDelta: { fontSize: 11.5, fontWeight: "800", marginTop: 6 },
  wdRecordsHead: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, marginBottom: 8 },
  wdRecordsTitle: { color: colors.white, fontSize: 13.5, fontWeight: "800" },
  wdRecord: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  wdRecordBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,194,10,0.14)", alignItems: "center", justifyContent: "center" },
  wdRecordLabel: { color: colors.white, fontSize: 13.5, fontWeight: "800" },
  wdRecordSub: { color: colors.textFaint, fontSize: 11.5, marginTop: 1, fontWeight: "600" },
  wdRecordW: { color: colors.yellow, fontSize: 16, fontWeight: "900" },
  wdEmpty: { color: colors.textDim, fontSize: 12.5, lineHeight: 18, marginTop: 4 },

  shareBtn: { position: "absolute", right: 0, top: -2, flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "rgba(255,194,10,0.4)", borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 11, zIndex: 2 },
  shareBtnT: { color: colors.yellow, fontSize: 12, fontWeight: "800" },

  eventInputRow: { marginBottom: 10 },
  eventInput: { backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.white, fontSize: 14 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.03)" },
  presetClear: { borderColor: "rgba(255,255,255,0.12)" },
  presetT: { color: colors.white, fontSize: 12.5, fontWeight: "700" },
  targetBox: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: radius.lg, padding: 14, marginTop: 14 },
  targetTitle: { color: colors.white, fontSize: 15, fontWeight: "800" },
  targetSub: { color: colors.textFaint, fontSize: 11.5, marginTop: 2, fontWeight: "600" },
  targetVerdict: { fontSize: 12.5, fontWeight: "800", marginTop: 8, lineHeight: 17 },
  targetStat: { alignItems: "center", minWidth: 68 },
  targetForm: { fontSize: 30, fontWeight: "900" },
  targetFormL: { color: colors.textFaint, fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },

  noteHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  coachChip: { flexDirection: "row", alignItems: "center", gap: 6 },
  coachChipT: { color: colors.white, fontSize: 13.5, fontWeight: "800" },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.yellow, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 14 },
  playBtnT: { color: "#241B00", fontSize: 12.5, fontWeight: "800" },
  noteText: { color: colors.textDim, fontSize: 14, lineHeight: 21 },
  focusBox: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: "rgba(255,194,10,0.08)", borderRadius: radius.md, padding: 12, marginTop: 12 },
  focusText: { color: colors.textDim, fontSize: 13, lineHeight: 19, flex: 1 },
  refreshLink: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginTop: 12, paddingVertical: 4 },
  refreshT: { color: colors.textDim, fontSize: 12, fontWeight: "600" },

  taperBox: { backgroundColor: "rgba(63,182,139,0.07)", borderWidth: 1, borderColor: "rgba(63,182,139,0.28)", borderRadius: radius.md, padding: 14, marginTop: 12 },
  taperHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  playBtnSm: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.yellow, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12 },
  playBtnSmT: { color: "#241B00", fontSize: 11.5, fontWeight: "800" },
  taperAction: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 10 },
  taperActionT: { color: colors.textDim, fontSize: 12.5, lineHeight: 18, flex: 1 },
  applyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: colors.yellow, borderRadius: radius.md, paddingVertical: 11, marginTop: 14 },
  applyBtnT: { color: "#241B00", fontSize: 13, fontWeight: "800" },
  applyMsg: { color: FITNESS, fontSize: 12.5, lineHeight: 18, marginTop: 14, fontWeight: "600" },

  riskBox: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: "rgba(242,121,46,0.1)", borderWidth: 1, borderColor: "rgba(242,121,46,0.4)", borderRadius: radius.md, padding: 12, marginTop: 14 },
  riskText: { color: "#F2A277", fontSize: 12.5, lineHeight: 18, flex: 1, fontWeight: "600" },

  mileCelebrate: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(255,194,10,0.12)", borderWidth: 1, borderColor: "rgba(255,194,10,0.45)", borderRadius: radius.lg, padding: 14, marginBottom: 14 },
  mileBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.yellow, alignItems: "center", justifyContent: "center" },
  mileTitle: { color: colors.white, fontSize: 14.5, fontWeight: "900" },
  mileBlurb: { color: colors.textDim, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  mileShare: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.yellow, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 },
  mileShareT: { color: "#241B00", fontSize: 12.5, fontWeight: "800" },
  mileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  mileTile: { flexGrow: 1, flexBasis: "22%", minWidth: 100, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14 },
  mileVal: { color: colors.white, fontSize: 22, fontWeight: "900" },
  mileUnit: { color: colors.textFaint, fontSize: 12, fontWeight: "700" },
  mileLabel: { color: colors.textDim, fontSize: 10.5, fontWeight: "700", marginTop: 4, letterSpacing: 0.3 },
  mileNext: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 12 },
  mileNextT: { color: colors.textDim, fontSize: 12.5, fontWeight: "700" },

  streakTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  streakBig: { width: 84, height: 84, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.03)" },
  streakNum: { fontSize: 26, fontWeight: "900", marginTop: 2, lineHeight: 28 },
  streakUnit: { color: colors.textFaint, fontSize: 10.5, fontWeight: "700" },
  streakTitle: { color: colors.white, fontSize: 15.5, fontWeight: "800" },
  streakSub: { color: colors.textDim, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  streakBest: { color: colors.textFaint, fontSize: 11.5, fontWeight: "600", marginTop: 6 },
  flames: { flexDirection: "row", gap: 6, marginTop: 14 },
  streakShare: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.yellow, borderRadius: radius.md, paddingVertical: 11, marginTop: 14 },
  streakShareT: { color: "#241B00", fontSize: 13.5, fontWeight: "800" },
  cards: { flexDirection: "row", gap: 10 },
  big: { flex: 1, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14, alignItems: "center" },
  bigLabel: { color: colors.textFaint, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  bigVal: { fontSize: 30, fontWeight: "900", marginVertical: 2 },
  bigSub: { color: colors.textFaint, fontSize: 10.5, fontWeight: "700" },
  stateRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" },
  pill: { borderRadius: 999, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 14 },
  pillText: { fontSize: 13, fontWeight: "800" },
  metaText: { color: colors.textDim, fontSize: 12.5, fontWeight: "600" },
  recGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  rec: { flexGrow: 1, flexBasis: "22%", minWidth: 120, backgroundColor: "rgba(255,194,10,0.06)", borderWidth: 1, borderColor: "rgba(255,194,10,0.28)", borderRadius: radius.lg, padding: 14 },
  recTop: { flexDirection: "row", alignItems: "center", gap: 5 },
  recDur: { color: colors.textDim, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.4 },
  recW: { color: colors.white, fontSize: 24, fontWeight: "900", marginTop: 6 },
  recUnit: { color: colors.textFaint, fontSize: 13, fontWeight: "700" },
  recWhen: { color: colors.textFaint, fontSize: 11, marginTop: 4, fontWeight: "600" },
});
