# Roujaune Cyclist Avatar Module

A self-contained, animated SVG cyclist that overlays on the existing Live Workout
video screen. **It does not modify the workout screen, video player, or metrics
dashboard** — you opt in by dropping one component in.

Try it live: route **`/avatar-demo`** (Avatar Studio with controls + customiser).

## Files
```
src/avatar/
  avatarConfigs.ts        # types, 4 avatars, brand palette, input types
  useAvatarAnimation.ts   # trainer data -> motion (crank/lean/stand/wheel), UI-thread easing
  CyclistAvatar.tsx       # the SVG rider rig (identity fixed, appearance live)
  AvatarSelector.tsx      # choose 1 of 4
  AvatarCustomizer.tsx    # live kit + glasses editing
  CyclistAvatarSystem.tsx # barrel exports + <CyclistAvatarOverlay/>
app/avatar-demo.tsx       # demo screen (cadence/power/resistance/standing/pause)
```

## Inputs (drive the animation)
```ts
type AvatarInputs = {
  cadence: number;    // rpm  -> pedal speed
  power: number;      // watts -> lean / effort
  resistance: number; // 0..100 -> lean / effort
  speed: number;      // km/h -> wheel spin
  isStanding: boolean;// out-of-saddle sway + bob
  isPaused: boolean;  // freezes pedalling & wheels, relaxes posture
};
```
Cadence sets pedal speed; power+resistance deepen forward lean & effort; standing
adds gentle bike sway + vertical bob; paused stops motion. All transitions are eased
on the UI thread (`useFrameCallback`) for smoothness.

## Plug into the Live Workout screen
The workout screen already exposes live telemetry (`useTelemetry`) and `paused`.
Add the transparent overlay **without changing any existing layout**:

```tsx
import { CyclistAvatarOverlay, DEFAULT_CHOICE } from "@/src/avatar/CyclistAvatarSystem";

// choice can come from state / AsyncStorage (see "Persisting" below)
<CyclistAvatarOverlay
  choice={avatarChoice}                 // { avatarId, appearance }
  size={160}
  style={{ position: "absolute", left: 16, bottom: 76, zIndex: 15 }}
  inputs={{
    cadence: telemetry.cadence,
    power: telemetry.power,
    resistance: 45,                     // or a real resistance channel when available
    speed: telemetry.speed,
    isStanding,                          // wire to a control if/when you add one
    isPaused: paused,
  }}
/>
```
Place it as a sibling of the video (e.g. next to `<AlbertoLiveCue/>`/`<MediaBar/>`)
so it floats over the POV video and clears the HUD. It has a transparent background
and `pointerEvents="none"`, so it never blocks taps.

## Customisation (live, identity-safe)
`AvatarCustomizer` edits **appearance only** — jersey top/bottom, bib, helmet, shoes,
bike, and glasses (`none | clear | dark | wraparound`) + frame colour & lens tint.
It never changes the rider's face, skin, hair or gender (that lives in the fixed
`identity` of each avatar). Merge order is `config.defaults` then user `appearance`.

## Persisting the choice
Store `AvatarChoice` (`{ avatarId, appearance }`) in AsyncStorage (mirror the pattern
in `src/lib/prefs.ts`) and load it where you render the overlay + a selector/customiser
sheet.

## Adding more avatars later
Append an entry to `AVATARS` in `avatarConfigs.ts` with a new `identity` (skin/hair/
sex/beard) and default kit. Everything else (selector, customiser, animation, overlay)
picks it up automatically — no other changes needed.

## Notes
- Pure vector (react-native-svg + reanimated) — no images, no 3D, fully cross-platform
  and animates in Expo Go, web preview, and native builds.
- Side/profile riding view chosen for clean, readable pedalling.
- To add a real "standing" trigger, feed `isStanding` from a control or a power/cadence
  heuristic; the rig already supports the out-of-saddle state.
