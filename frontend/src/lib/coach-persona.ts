import React from "react";
import { getCoachId, setCoachId } from "./prefs";

export type CoachId = "alberto" | "adriana";
export type CoachGender = "male" | "female";
export type CoachPersona = {
  id: CoachId;
  name: string;
  gender: CoachGender;
  role: string;
  image: number;         // require() asset
  voiceNum: number;      // Spanish (English) voice number to use
};

const albertoImg = require("../../assets/images/coach_alberto_v2.png");
const adrianaImg = require("../../assets/images/coach_adriana.png");

export const COACHES: Record<CoachId, CoachPersona> = {
  alberto: { id: "alberto", name: "Alberto", gender: "male", role: "Your Coach", image: albertoImg, voiceNum: 18 },
  adriana: { id: "adriana", name: "Adriana", gender: "female", role: "Your Coach", image: adrianaImg, voiceNum: 7 },
};

export const DEFAULT_COACH: CoachId = "alberto";

// Tiny module-level store so a change made in the workout audio panel is
// reflected on every screen (home / training / summary) without a provider.
let current: CoachId = DEFAULT_COACH;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function initCoach() {
  if (loaded) return;
  loaded = true;
  getCoachId().then((id) => {
    if (id === "alberto" || id === "adriana") {
      current = id;
      emit();
    }
  });
}

export function getCoach(): CoachId {
  return current;
}

export function setCoach(id: CoachId) {
  if (current === id) return;
  current = id;
  setCoachId(id);
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
