// Lightweight module-level store for the just-completed ride. Carries recorded
// telemetry samples + the ridden route across navigation (params can't hold
// large arrays) so the summary screen can post them to the backend and reflect
// the actual scenery ridden.
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
  route: RideRoute;
  elapsed: number;
  samples: RideSample[];
};

const DEFAULT_ROUTE: RideRoute = {
  id: "XlwjMjyU410", name: "Alpe d'Huez", place: "France", distance: "13.8 km", elevation: "1,120 m", tag: "Climb",
};

const store: RideRecord = { workout: "Threshold Climb", route: { ...DEFAULT_ROUTE }, elapsed: 0, samples: [] };
const MAX = 4000; // cap memory (~13 min at 5 Hz is plenty for aggregates)

export const rideRecorder = {
  reset(meta?: { workout?: string; route?: RideRoute }) {
    store.samples = [];
    store.elapsed = 0;
    if (meta?.workout) store.workout = meta.workout;
    if (meta?.route) store.route = meta.route;
  },
  setRoute(route: RideRoute) {
    store.route = route;
  },
  push(sample: RideSample, elapsed: number) {
    store.elapsed = elapsed;
    if (store.samples.length < MAX) store.samples.push(sample);
    else store.samples[Math.floor(Math.random() * MAX)] = sample; // reservoir-ish
  },
  snapshot(): RideRecord {
    return { ...store, route: { ...store.route }, samples: [...store.samples] };
  },
};
