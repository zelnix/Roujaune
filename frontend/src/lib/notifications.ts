// Live notifications for the bell — built ONLY from real backend signals
// (coach adaptations, missed workouts, benchmark reminders, re-benchmark gate).
// No demo/hardcoded content: if there's no data, the item simply isn't shown.
import { useEffect, useState } from "react";

import { useMissedWorkouts } from "./home-notices";
import { useBenchmarkWeek, useBenchmarkPlanReview, useBenchmarkNudge, BenchmarkNudge } from "./benchmark/api";

export type LiveNotif = {
  id: string;
  key: string;
  icon: any;
  color: string;
  title: string;
  body: string;
  detail: string;
  time: string;
  action?: "benchmark";
};

// Stable, content-aware key so read-state resets when a notification's content
// changes (e.g. a new coach message reuses id "coach-msg" but new text).
function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function keyFor(id: string, title: string, body: string): string {
  return `${id}|${djb2(title + "\u0001" + body)}`;
}

const C = { yellow: "#FFC20A", rouge: "#E01E2B", green: "#2ECC71", orange: "#E8631C", blue: "#40A9C6" };

function apiBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
}

function relTime(iso?: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function daysUntil(iso: string): number {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  const target = new Date(y, (m || 1) - 1, d || 1);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

function whenLabel(iso: string): string {
  const delta = daysUntil(iso);
  if (delta <= 0) return "today";
  if (delta === 1) return "tomorrow";
  if (delta < 7) {
    const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
    return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(undefined, { weekday: "long" });
  }
  return `in ${delta} days`;
}

type Adaptation = { coach?: string; text?: string; trigger?: string; at?: string };
function useLatestCoachMessage(): Adaptation | null {
  const [msg, setMsg] = useState<Adaptation | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/plan/adaptations`);
        if (!res.ok) return;
        const j = await res.json();
        const list: Adaptation[] = Array.isArray(j?.adaptations) ? j.adaptations : [];
        const latest = list.find((a) => (a.text || "").trim().length > 0);
        if (alive && latest) setMsg(latest);
      } catch {
        /* best-effort */
      }
    })();
    return () => { alive = false; };
  }, []);
  return msg;
}

/** Aggregate all real notification signals, newest/most-urgent first. */
export function useLiveNotifications(nudgeOverride?: BenchmarkNudge): LiveNotif[] {
  const missed = useMissedWorkouts();
  const { week } = useBenchmarkWeek();
  const { review } = useBenchmarkPlanReview();
  const { nudge: nudgeHook } = useBenchmarkNudge();
  const coach = useLatestCoachMessage();
  const nudge = nudgeOverride ?? nudgeHook;

  const out: Omit<LiveNotif, "key">[] = [];

  // 1) Re-benchmark required (strongest signal).
  if (nudge?.required) {
    const reason = (nudge.reason || "").trim();
    const nice = reason ? `${reason.charAt(0).toUpperCase()}${reason.slice(1)}.` : "";
    out.push({
      id: "rebenchmark",
      icon: "fitness",
      color: C.yellow,
      title: "Time to re-benchmark",
      body: nice || "A fresh benchmark keeps your training targets accurate.",
      detail: `${nice} A fresh benchmark${nudge.recommendedTestName ? ` (${nudge.recommendedTestName})` : ""} recalibrates your training zones so every workout targets the right intensity. It only takes one session — tap below to get started.`,
      time: "now",
      action: "benchmark",
    });
  }

  // 2) FTP update ready (plan review proposal).
  if (review?.hasProposal && typeof review.next === "number") {
    const delta = typeof review.delta === "number" ? `  (${review.delta > 0 ? "+" : ""}${review.delta}W)` : "";
    out.push({
      id: "ftp-review",
      icon: "trending-up",
      color: C.green,
      title: "FTP update ready",
      body: `${review.previous}W → ${review.next}W${delta} · review your targets`,
      detail: `Your latest benchmark suggests an FTP change from ${review.previous}W to ${review.next}W${delta}. Review and approve to update your training zones and targets.`,
      time: "recent",
      action: "benchmark",
    });
  }

  // 3) Upcoming benchmark test.
  const upcoming = (week?.active ? (week.days || []) : [])
    .filter((d) => d.kind === "test" && d.status === "scheduled" && daysUntil(d.date) >= 0)
    .sort((a, b) => daysUntil(a.date) - daysUntil(b.date));
  if (upcoming[0]) {
    const nxt = upcoming[0];
    out.push({
      id: `bm-test-${nxt.date}`,
      icon: "stopwatch-outline",
      color: C.yellow,
      title: `Benchmark test ${whenLabel(nxt.date)}`,
      body: nxt.label,
      detail: `Your next scheduled benchmark is ${nxt.label} ${whenLabel(nxt.date)}. Arrive fresh and well-fuelled for the most accurate result.`,
      time: whenLabel(nxt.date),
      action: "benchmark",
    });
  }

  // 4) Missed workouts.
  if (missed?.count > 0) {
    out.push({
      id: "missed",
      icon: "alert-circle",
      color: C.orange,
      title: `${missed.count} missed workout${missed.count > 1 ? "s" : ""}`,
      body: missed.guidance || "Catch up or let your coach adjust the week.",
      detail: `${missed.guidance || ""}\n\n${(missed.missed || []).map((m) => `• ${m.date} — ${m.title}`).join("\n")}`.trim(),
      time: "this week",
    });
  }

  // 5) Latest coach message.
  if (coach?.text) {
    out.push({
      id: "coach-msg",
      icon: "chatbubble-ellipses",
      color: C.green,
      title: `Message from ${coach.coach || "your coach"}`,
      body: coach.text,
      detail: coach.text,
      time: relTime(coach.at) || "recent",
    });
  }

  return out.map((n) => ({ ...n, key: keyFor(n.id, n.title, n.body) }));
}

// ── Per-rider read-state (persisted server-side, shared across consumers) ───
let _readSnap: Set<string> = new Set();
let _readLoaded = false;
const _readListeners = new Set<() => void>();
function _emitRead() { _readListeners.forEach((l) => l()); }

function _postRead(path: string, body: object) {
  return fetch(`${apiBase()}/api/notifications/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

/** Reset the in-memory read snapshot (call on logout). */
export function resetNotificationReadState() {
  _readSnap = new Set();
  _readLoaded = false;
  _emitRead();
}

export function useNotificationReadState() {
  const [readKeys, setReadKeys] = useState<Set<string>>(_readSnap);
  const [loading, setLoading] = useState(!_readLoaded);

  useEffect(() => {
    const l = () => setReadKeys(new Set(_readSnap));
    _readListeners.add(l);
    l();
    return () => { _readListeners.delete(l); };
  }, []);

  useEffect(() => {
    if (_readLoaded) { setLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/notifications/read-state`);
        if (res.ok) {
          const j = await res.json();
          _readSnap = new Set<string>(j.readKeys || []);
          _readLoaded = true;
          _emitRead();
        }
      } catch {
        /* offline: start empty */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const markRead = (key: string) => { _readSnap = new Set(_readSnap).add(key); _emitRead(); _postRead("read", { key }); };
  const markUnread = (key: string) => { const n = new Set(_readSnap); n.delete(key); _readSnap = n; _emitRead(); _postRead("unread", { key }); };
  const markAllRead = (keys: string[]) => { const n = new Set(_readSnap); keys.forEach((k) => n.add(k)); _readSnap = n; _emitRead(); _postRead("read-all", { keys }); };

  return { readKeys, loading, markRead, markUnread, markAllRead };
}

