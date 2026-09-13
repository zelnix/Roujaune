// Lightweight module-level store for the just-completed ride. Carries recorded
// telemetry samples + the ridden route across navigation (params can't hold
// large arrays) so the summary screen can post them to the backend and reflect
// the actual scenery ridden.
import AsyncStorage from "@react-native-async-storage/async-storage";

export type RideSample = { power: number; hr: number; cadence: number; speed: number };

export type RideRoute = {
  id: string;
  name: string;
  place: string;
  distance: string;
  elevation: string;
  tag: string;
};

type RideRecord = {
  workout: string;
  workoutId?: string;
  ftp: number;
  zoneBias: Record<string, number>;
  route: RideRoute;
  elapsed: number;
  samples: RideSample[];
  extendedMin: number;   // total extra minutes the rider added after completing
  extensions: number;    // how many times they extended
  adjustments: { t: string; label: string }[]; // mid-ride control changes
  struggles: import("./struggle").StruggleMoment[]; // flagged tough moments
  estCalories: number;   // live in-ride kcal estimate (actual watts when available)
  energyJ: number;       // running energy total (joules) behind estCalories
};

const DEFAULT_ROUTE: RideRoute = {
  id: "XlwjMjyU410", name: "Alpe d'Huez", place: "France", distance: "13.8 km", elevation: "1,120 m", tag: "Climb",
};

const store: RideRecord = { workout: "Threshold Climb", workoutId: undefined, ftp: 287, zoneBias: {}, route: { ...DEFAULT_ROUTE }, elapsed: 0, samples: [], extendedMin: 0, extensions: 0, adjustments: [], struggles: [], estCalories: 0, energyJ: 0 };
const MAX = 4000; // cap memory (~13 min at 5 Hz is plenty for aggregates)

// Disk persistence — so an in-progress ride's sample history (used to draw the
// summary's power/HR/cadence graphs) survives a full app close, not just the
// elapsed/distance totals. Written periodically by the workout screen; a
// single slot is enough since only one ride can be live at a time.
const PERSIST_KEY = "roujaune.workout.samples.v1";
type PersistedRide = {
  workoutId?: string;
  elapsed: number;
  samples: RideSample[];
  extendedMin: number;
  extensions: number;
  adjustments: { t: string; label: string }[];
  struggles: import("./struggle").StruggleMoment[];
  estCalories: number;
  energyJ: number;
};

export const rideRecorder = {
  reset(meta?: { workout?: string; workoutId?: string; ftp?: number; zoneBias?: Record<string, number>; route?: RideRoute }) {
    store.samples = [];
    store.elapsed = 0;
    store.extendedMin = 0;
    store.extensions = 0;
    store.adjustments = [];
    store.struggles = [];
    store.estCalories = 0;
    store.energyJ = 0;
    if (meta?.workout) store.workout = meta.workout;
    if (meta && "workoutId" in meta) store.workoutId = meta.workoutId;
    if (meta?.ftp) store.ftp = meta.ftp;
    if (meta?.zoneBias) store.zoneBias = meta.zoneBias;
    if (meta?.route) store.route = meta.route;
  },
  setRoute(route: RideRoute) {
    store.route = route;
  },
  setFtp(ftp: number) {
    if (ftp > 0) store.ftp = ftp;
  },
  setZoneBias(bias: Record<string, number>) {
    store.zoneBias = bias || {};
  },
  /** Store the live in-ride calorie estimate so the saved summary matches it. */
  setEstCalories(kcal: number) {
    if (kcal >= 0) store.estCalories = Math.round(kcal);
  },
  /** Running energy total (joules) behind the calorie estimate — persisted so
   *  a resumed ride's calorie count keeps climbing instead of restarting. */
  setEnergyJ(joules: number) {
    if (joules >= 0) store.energyJ = joules;
  },
  getEnergyJ(): number {
    return store.energyJ;
  },
  /** Credit an extension block the rider added after completing the workout. */
  addExtension(minutes: number) {
    if (minutes > 0) { store.extendedMin += Math.round(minutes); store.extensions += 1; }
  },
  /** Record a mid-ride adjustment (skip/extend/intensity/ERG/pause) with its ride time. */
  addAdjustment(t: string, label: string) {
    store.adjustments.push({ t, label });
    if (store.adjustments.length > 30) store.adjustments.shift();
  },
  /** Store the flagged struggle moments from the live struggle detector. */
  setStruggles(moments: import("./struggle").StruggleMoment[]) {
    store.struggles = [...(moments || [])];
  },
  push(sample: RideSample, elapsed: number) {
    store.elapsed = elapsed;
    if (store.samples.length < MAX) store.samples.push(sample);
    else store.samples[Math.floor(Math.random() * MAX)] = sample; // reservoir-ish
  },
  snapshot(): RideRecord {
    return { ...store, route: { ...store.route }, samples: [...store.samples], struggles: [...store.struggles] };
  },
  /** Write the current sample history + counters to disk (debounced by the
   *  caller — typically every few seconds while the ride is live). */
  async persist(): Promise<void> {
    if (!store.workoutId) return;
    const blob: PersistedRide = {
      workoutId: store.workoutId,
      elapsed: store.elapsed,
      samples: store.samples,
      extendedMin: store.extendedMin,
      extensions: store.extensions,
      adjustments: store.adjustments,
      struggles: store.struggles,
      estCalories: store.estCalories,
      energyJ: store.energyJ,
    };
    try { await AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(blob)); } catch { /* best effort */ }
  },
  /** Restore a previously-persisted sample history if it belongs to this exact
   *  workout. Returns whether anything was restored (caller decides whether to
   *  fall back to a plain `reset()` otherwise). */
  async hydrate(workoutId: string): Promise<boolean> {
    try {
      const raw = await AsyncStorage.getItem(PERSIST_KEY);
      if (!raw) return false;
      const blob = JSON.parse(raw) as PersistedRide;
      if (!blob || blob.workoutId !== workoutId) return false;
      store.elapsed = blob.elapsed || 0;
      store.samples = Array.isArray(blob.samples) ? blob.samples : [];
      store.extendedMin = blob.extendedMin || 0;
      store.extensions = blob.extensions || 0;
      store.adjustments = Array.isArray(blob.adjustments) ? blob.adjustments : [];
      store.struggles = Array.isArray(blob.struggles) ? blob.struggles : [];
      store.estCalories = blob.estCalories || 0;
      store.energyJ = blob.energyJ || 0;
      return true;
    } catch {
      return false;
    }
  },
  /** Remove the persisted sample history once a ride is saved, abandoned or completed. */
  async clearPersisted(): Promise<void> {
    try { await AsyncStorage.removeItem(PERSIST_KEY); } catch { /* best effort */ }
  },
};
