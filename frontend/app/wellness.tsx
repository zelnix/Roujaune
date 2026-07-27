import { Redirect } from "expo-router";

// The standalone Wellness feature has been removed. Wearable-derived metrics are
// now surfaced only as cycling training-readiness inputs across Home, Today's
// Workout, Progress, Daily Check-in and Connections. Any old link lands on Home.
export default function WellnessRemoved() {
  return <Redirect href="/" />;
}
