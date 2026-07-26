import React from "react";
import { getCoachId, setCoachId, getCoachStyle as loadStyle, setCoachStyle as saveStyle, getVoiceGuidance as loadGuidance, setVoiceGuidance as saveGuidance, getSpeechRate as loadRate, setSpeechRate as saveRate } from "./prefs";

export type CoachId = "alberto" | "adriana";
export type CoachGender = "male" | "female";
export type CoachPersona = {
  id: CoachId;
  name: string;
  gender: CoachGender;
  role: string;
  image: number;         // require() asset
  voiceNum: number;      // Spanish (English) voice number to use
  pronouns: string;      // e.g. "he/him"
  signature: string;     // handwritten-style signature text
};

const albertoImg = require("../../assets/images/coach_alberto_v2.png");
const adrianaImg = require("../../assets/images/coach_adriana.png");

export const COACHES: Record<CoachId, CoachPersona> = {
  alberto: { id: "alberto", name: "Alberto", gender: "male", role: "Your Companion Coach", image: albertoImg, voiceNum: 18, pronouns: "he/him", signature: "Alberto" },
  adriana: { id: "adriana", name: "Adriana", gender: "female", role: "Your Companion Coach", image: adrianaImg, voiceNum: 7, pronouns: "she/her", signature: "Adriana" },
};

/* ── coaching style ("balanced" | "performance" | "calm" | "essential") ──── */
export type CoachStyle = "balanced" | "performance" | "calm" | "essential";
export const COACH_STYLES: { id: CoachStyle; label: string; hint: string }[] = [
  { id: "balanced", label: "Balanced", hint: "Encouragement and practical guidance" },
  { id: "performance", label: "Performance-focused", hint: "Direct, data-driven, results first" },
  { id: "calm", label: "Calm and supportive", hint: "Warm, reassuring, low pressure" },
  { id: "essential", label: "Essential cues only", hint: "Brief and to the point" },
];

/* ── voice guidance ("full" | "essential" | "visual" | "muted") ──────────── */
export type VoiceGuidance = "full" | "essential" | "visual" | "muted";
export const VOICE_GUIDANCE_OPTS: { id: VoiceGuidance; label: string; hint: string }[] = [
  { id: "full", label: "Full coaching", hint: "Spoken cues and encouragement" },
  { id: "essential", label: "Essential cues", hint: "Only the important calls" },
  { id: "visual", label: "Visual only", hint: "On-screen cues, no voice" },
  { id: "muted", label: "Muted", hint: "No coaching prompts" },
];

export const DEFAULT_COACH: CoachId = "alberto";

// Tiny module-level store so a change made in the workout audio panel is
// reflected on every screen (home / training / summary) without a provider.
let current: CoachId = DEFAULT_COACH;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const PREFS_API = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");

export function initCoach() {
  if (loaded) return;
  loaded = true;
  // Local cache first (instant), then reconcile with the server so the chosen
  // companion coach stays consistent across every session and device.
  getCoachId().then((id) => {
    if (id === "alberto" || id === "adriana") {
      current = id;
      emit();
    }
  });
  fetch(`${PREFS_API}/api/rider/prefs`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const id = d?.coach_id;
      if ((id === "alberto" || id === "adriana") && id !== current) {
        current = id;
        setCoachId(id);
        emit();
      }
    })
    .catch(() => {});
}

export function getCoach(): CoachId {
  return current;
}

export function setCoach(id: CoachId) {
  if (current === id) return;
  current = id;
  setCoachId(id);
  // Persist server-side so the choice follows the rider everywhere.
  fetch(`${PREFS_API}/api/rider/prefs`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ coach_id: id }),
  }).catch(() => {});
  emit();
}

/** Subscribe a component to the active coach persona. */
export function useCoach(): CoachPersona {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    initCoach();
    const l = () => force();
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return COACHES[current];
}

/* ── coaching style store ────────────────────────────────────────────────── */
let curStyle: CoachStyle = "balanced";
let styleLoaded = false;
const styleListeners = new Set<() => void>();
const emitStyle = () => styleListeners.forEach((l) => l());

function initStyle() {
  if (styleLoaded) return;
  styleLoaded = true;
  loadStyle().then((s) => {
    if (s === "balanced" || s === "performance" || s === "calm" || s === "essential") { curStyle = s; emitStyle(); }
  });
}
export function getCoachStyle(): CoachStyle { return curStyle; }
export function setCoachStyle(s: CoachStyle) { if (curStyle === s) return; curStyle = s; saveStyle(s); emitStyle(); }
export function useCoachStyle(): CoachStyle {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { initStyle(); const l = () => force(); styleListeners.add(l); return () => { styleListeners.delete(l); }; }, []);
  return curStyle;
}

/* ── voice guidance store ────────────────────────────────────────────────── */
let curGuidance: VoiceGuidance = "full";
let guidanceLoaded = false;
const guidanceListeners = new Set<() => void>();
const emitGuidance = () => guidanceListeners.forEach((l) => l());

function initGuidance() {
  if (guidanceLoaded) return;
  guidanceLoaded = true;
  loadGuidance().then((g) => {
    if (g === "full" || g === "essential" || g === "visual" || g === "muted") { curGuidance = g; emitGuidance(); }
  });
}
export function getVoiceGuidance(): VoiceGuidance { return curGuidance; }
export function setVoiceGuidance(g: VoiceGuidance) { if (curGuidance === g) return; curGuidance = g; saveGuidance(g); emitGuidance(); }
export function useVoiceGuidance(): VoiceGuidance {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { initGuidance(); const l = () => force(); guidanceListeners.add(l); return () => { guidanceListeners.delete(l); }; }, []);
  return curGuidance;
}

/* ── speaking speed (TTS rate) ───────────────────────────────────────────── */
export const SPEECH_RATES: { id: string; label: string; rate: number }[] = [
  { id: "slow", label: "Slower", rate: 0.8 },
  { id: "normal", label: "Normal", rate: 0.95 },
  { id: "fast", label: "Faster", rate: 1.12 },
];
export const DEFAULT_RATE = 0.95;
let curRate = DEFAULT_RATE;
let rateLoaded = false;
const rateListeners = new Set<() => void>();
const emitRate = () => rateListeners.forEach((l) => l());
function initRate() {
  if (rateLoaded) return;
  rateLoaded = true;
  loadRate().then((r) => { if (typeof r === "number" && !isNaN(r)) { curRate = r; emitRate(); } });
}
export function getCoachRate(): number { return curRate; }
export function setCoachRate(rate: number) { if (curRate === rate) return; curRate = rate; saveRate(rate); emitRate(); }
export function useCoachRate(): number {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { initRate(); const l = () => force(); rateListeners.add(l); return () => { rateListeners.delete(l); }; }, []);
  return curRate;
}
