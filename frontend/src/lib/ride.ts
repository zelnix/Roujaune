// Lightweight module-level store for the just-completed ride. Carries recorded
// telemetry samples across navigation (params can't hold large arrays) so the
// summary screen can post them to the backend for aggregation.
export type RideSample = { power: number; hr: number; cadence: number; speed: number };

type RideRecord = {
  workout: string;
  route: string;
  elapsed: number;
  samples: RideSample[];
};

const store: RideRecord = { workout: "Threshold Climb", route: "Alpe d'Huez", elapsed: 0, samples: [] };
const MAX = 4000; // cap memory (~13 min at 5 Hz is plenty for aggregates)

export const rideRecorder = {
  reset(meta?: Partial<Pick<RideRecord, "workout" | "route">>) {
    store.samples = [];
    store.elapsed = 0;
    if (meta?.workout) store.workout = meta.workout;
    if (meta?.route) store.route = meta.route;
  },
  push(sample: RideSample, elapsed: number) {
    store.elapsed = elapsed;
    if (store.samples.length < MAX) store.samples.push(sample);
    else store.samples[Math.floor(Math.random() * MAX)] = sample; // reservoir-ish
  },
  snapshot(): RideRecord {
    return { ...store, samples: [...store.samples] };
  },
};
