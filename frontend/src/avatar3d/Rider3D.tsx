import React from "react";
import { Canvas, useFrame } from "@react-three/fiber/native";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/* ────────────────────────────────────────────────────────────────────────
   ROUJAUNE — Real-time 3D cyclist (Option A).
   • Free rigged Mixamo humans (male = Xbot, female = Michelle), loaded from
     the stable three.js CDN (Ready Player Me's public service shut down
     2026-01-31 so its CDN is gone).
   • A fully procedural 3D road bike built from primitives.
   • Procedural pedalling: legs are driven by planar 2-bone IK so both feet
     stay locked to the rotating pedals; cadence sets the crank speed.
   • Seated ↔ standing transition + effort lean driven by power/cadence.
   • 4 swappable ROUJAUNE kit presets (2 male, 2 female) recoloured live.
   Renders on device / Expo Go and in the web preview via expo-gl.
──────────────────────────────────────────────────────────────────────── */

export type KitPresetKey = "yellow" | "blackBurgundy" | "femaleBlack" | "femalePink";

type Preset = { body: "male" | "female"; jersey: string; shorts: string; label: string };

export const KIT_PRESETS: Record<KitPresetKey, Preset> = {
  yellow:        { body: "male",   jersey: "#F2C230", shorts: "#6E1D2B", label: "Yellow / Burgundy" },
  blackBurgundy: { body: "male",   jersey: "#1B1B1B", shorts: "#6E1D2B", label: "Black / Burgundy" },
  femaleBlack:   { body: "female", jersey: "#161616", shorts: "#F2C230", label: "Female · Black" },
  femalePink:    { body: "female", jersey: "#E68FB4", shorts: "#6E1D2B", label: "Female · Pink" },
};

const BODY_URL = {
  male: "https://threejs.org/examples/models/gltf/Xbot.glb",
  female: "https://threejs.org/examples/models/gltf/Michelle.glb",
};

export type Rider3DInputs = {
  cadence: number;   // rpm  -> crank/pedal speed
  power: number;     // watts-> effort lean
  isStanding: boolean;
  isPaused: boolean;
  preset: KitPresetKey;
};

/* ── bike geometry constants (metres) ─────────────────────────────────── */
const WHEEL_R = 0.34;
const BB = new THREE.Vector3(0, 0.30, 0.06);      // bottom-bracket (crank centre)
const CRANK_R = 0.165;                            // crank arm length
const PEDAL_HALF = 0.075;                          // half pedal-to-pedal width (X)
const SADDLE = new THREE.Vector3(0, 0.94, -0.34);  // saddle top

const WX = new THREE.Vector3(1, 0, 0);
const WY = new THREE.Vector3(0, 1, 0);
const WZ = new THREE.Vector3(0, 0, 1);

/* scratch quats */
const _qDelta = new THREE.Quaternion();
const _qTarget = new THREE.Quaternion();
const _qParent = new THREE.Quaternion();

const METAL = "#C9CCD2";
const FRAME_COL = "#141414";

/* ── procedural road bike ─────────────────────────────────────────────── */
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, color: string, key?: string) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return (
    <mesh key={key} position={mid.toArray()} quaternion={quat.toArray() as any} castShadow>
      <cylinderGeometry args={[r, r, len, 14]} />
      <meshStandardMaterial color={color} metalness={0.6} roughness={0.35} />
    </mesh>
  );
}

function Wheel({ z, rotRef }: { z: number; rotRef: React.MutableRefObject<number> }) {
  const g = React.useRef<THREE.Group>(null);
  useFrame(() => { if (g.current) g.current.rotation.x = rotRef.current; });
  return (
    <group position={[0, WHEEL_R, z]}>
      {/* tyre + rim rotate */}
      <group ref={g}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[WHEEL_R, 0.022, 12, 40]} />
          <meshStandardMaterial color="#0A0A0A" roughness={0.7} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[WHEEL_R - 0.03, 0.014, 10, 40]} />
          <meshStandardMaterial color={METAL} metalness={0.9} roughness={0.25} />
        </mesh>
        {/* spokes */}
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * Math.PI;
          return (
            <mesh key={i} rotation={[a, 0, 0]}>
              <cylinderGeometry args={[0.005, 0.005, (WHEEL_R - 0.03) * 2, 6]} />
              <meshStandardMaterial color={METAL} metalness={0.9} roughness={0.3} />
            </mesh>
          );
        })}
        <mesh>
          <sphereGeometry args={[0.03, 12, 12]} />
          <meshStandardMaterial color={FRAME_COL} metalness={0.7} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

function Bike({ crankRef, wheelRef, accent }: {
  crankRef: React.MutableRefObject<number>;
  wheelRef: React.MutableRefObject<number>;
  accent: string;
}) {
  const crank = React.useRef<THREE.Group>(null);
  useFrame(() => { if (crank.current) crank.current.rotation.x = crankRef.current; });

  const frontHub = new THREE.Vector3(0, WHEEL_R, 0.62);
  const rearHub = new THREE.Vector3(0, WHEEL_R, -0.50);
  const headTop = new THREE.Vector3(0, 0.92, 0.50);
  const seatTop = new THREE.Vector3(0, 0.90, -0.32);

  return (
    <group>
      <Wheel z={0.62} rotRef={wheelRef} />
      <Wheel z={-0.50} rotRef={wheelRef} />

      {/* frame */}
      {tube(BB, rearHub, 0.016, FRAME_COL, "chainstay")}
      {tube(seatTop, rearHub, 0.016, FRAME_COL, "seatstay")}
      {tube(BB, seatTop, 0.02, accent, "seattube")}
      {tube(BB, headTop, 0.022, FRAME_COL, "downtube")}
      {tube(seatTop, headTop, 0.02, accent, "toptube")}
      {tube(headTop, frontHub, 0.018, FRAME_COL, "fork")}

      {/* handlebar + saddle */}
      <mesh position={[0, 0.98, 0.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.012, 0.012, 0.42, 10]} />
        <meshStandardMaterial color="#0A0A0A" roughness={0.5} />
      </mesh>
      <mesh position={SADDLE.toArray()} rotation={[0.05, 0, 0]}>
        <boxGeometry args={[0.11, 0.04, 0.26]} />
        <meshStandardMaterial color="#0A0A0A" roughness={0.6} />
      </mesh>

      {/* crank + pedals (rotate about X at BB) */}
      <group position={BB.toArray()}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, PEDAL_HALF * 2 + 0.02, 16]} />
          <meshStandardMaterial color={accent} metalness={0.7} roughness={0.3} />
        </mesh>
        <group ref={crank}>
          {/* right crank arm +X, left crank arm -X (180° opposed) */}
          {[1, -1].map((side) => (
            <group key={side} rotation={[side === 1 ? 0 : Math.PI, 0, 0]}>
              <mesh position={[side * (PEDAL_HALF + 0.02), CRANK_R / 2, 0]}>
                <boxGeometry args={[0.02, CRANK_R, 0.03]} />
                <meshStandardMaterial color={METAL} metalness={0.9} roughness={0.25} />
              </mesh>
              <mesh position={[side * (PEDAL_HALF + 0.03), CRANK_R, 0]}>
                <boxGeometry args={[0.09, 0.02, 0.06]} />
                <meshStandardMaterial color="#0A0A0A" roughness={0.6} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}

/* ── rider ─────────────────────────────────────────────────────────────── */
type Bones = Record<string, THREE.Bone>;

function Rider({ inputs }: { inputs: Rider3DInputs }) {
  const [root, setRoot] = React.useState<THREE.Group | null>(null);
  const bones = React.useRef<Bones>({});
  const bind = React.useRef<Record<string, THREE.Quaternion>>({});
  const hipWorld = React.useRef<Record<string, THREE.Vector3>>({});
  const legLen = React.useRef({ thigh: 0.42, shin: 0.42 });
  const jerseyMats = React.useRef<THREE.MeshStandardMaterial[]>([]);
  const inRef = React.useRef(inputs);
  inRef.current = inputs;

  const crankRef = React.useRef(0);
  const wheelRef = React.useRef(0);
  const standRef = React.useRef(0); // 0 seated → 1 standing (smoothed)

  const preset = KIT_PRESETS[inputs.preset];
  const bodyUrl = BODY_URL[preset.body];

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(bodyUrl);
        const buf = await res.arrayBuffer();
        new GLTFLoader().parse(buf, "", (gltf) => {
          if (!alive) return;
          const s = gltf.scene;
          const map: Bones = {};
          const mats: THREE.MeshStandardMaterial[] = [];
          s.traverse((o) => {
            if ((o as THREE.Bone).isBone) {
              const nm = o.name.replace(/^mixamorig:?/, "");
              map[nm] = o as THREE.Bone;
            }
            const m = o as THREE.SkinnedMesh;
            if (m.isMesh) {
              m.frustumCulled = false;
              const mm = (m.material as THREE.MeshStandardMaterial).clone();
              mm.metalness = 0.0; mm.roughness = 0.85;
              m.material = mm;
              mats.push(mm);
            }
          });
          bones.current = map;
          jerseyMats.current = mats;

          // capture bind world quats for controlled bones
          s.updateWorldMatrix(true, true);
          const keys = ["Hips","Spine","Spine1","Spine2","Neck","Head",
            "LeftArm","LeftForeArm","RightArm","RightForeArm","LeftShoulder","RightShoulder",
            "LeftUpLeg","LeftLeg","LeftFoot","RightUpLeg","RightLeg","RightFoot"];
          keys.forEach((k) => { if (map[k]) bind.current[k] = map[k].getWorldQuaternion(new THREE.Quaternion()); });

          // measure limb lengths + hip world offsets from Hips
          const wp = (b?: THREE.Bone) => b ? b.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
          if (map.RightUpLeg && map.RightLeg && map.RightFoot) {
            legLen.current.thigh = wp(map.RightUpLeg).distanceTo(wp(map.RightLeg));
            legLen.current.shin = wp(map.RightLeg).distanceTo(wp(map.RightFoot));
          }

          // scale so the legs match the bike (guarantees the feet reach the pedals)
          const thighNat = legLen.current.thigh, shinNat = legLen.current.shin;
          const TARGET_LEG = 0.92;
          const scale = TARGET_LEG / (thighNat + shinNat);
          s.scale.setScalar(scale);
          legLen.current.thigh = thighNat * scale;
          legLen.current.shin = shinNat * scale;
          s.updateWorldMatrix(true, true);
          // seat the hips just above / behind the saddle
          const hips = map.Hips ? map.Hips.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 0.9, 0);
          const seat = new THREE.Vector3(0, SADDLE.y + 0.05, SADDLE.z + 0.04);
          s.position.add(seat.clone().sub(hips));
          s.updateWorldMatrix(true, true);

          // record hip world positions for IK targets
          hipWorld.current = {
            L: map.LeftUpLeg ? map.LeftUpLeg.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(-0.09, seat.y, seat.z),
            R: map.RightUpLeg ? map.RightUpLeg.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0.09, seat.y, seat.z),
          };

          setRoot(s);
        });
      } catch (e) {
        console.log("[Rider3D] load failed", e);
      }
    })();
    return () => { alive = false; };
  }, [bodyUrl]);

  // live kit recolour
  React.useEffect(() => {
    jerseyMats.current.forEach((m) => m.color && m.color.set(preset.jersey));
  }, [preset.jersey, root]);

  /* apply a world-space rotation (about X, then Y, then Z) on top of a bone's bind pose */
  const setWorld = (name: string, ax: number, az = 0, ay = 0) => {
    const b = bones.current[name];
    const bq = bind.current[name];
    if (!b || !bq || !b.parent) return;
    _qDelta.setFromAxisAngle(WX, ax);
    if (ay) _qDelta.multiply(_qTarget.setFromAxisAngle(WY, ay));
    if (az) _qDelta.multiply(_qTarget.setFromAxisAngle(WZ, az));
    _qTarget.copy(_qDelta).multiply(bq);
    b.parent.updateWorldMatrix(true, false);
    b.parent.getWorldQuaternion(_qParent);
    b.quaternion.copy(_qParent.invert().multiply(_qTarget));
  };

  /* planar 2-bone IK in the Y-Z plane: point thigh+shin from hip to foot target */
  const solveLeg = (upName: string, loName: string, hip: THREE.Vector3, foot: THREE.Vector3) => {
    const L1 = legLen.current.thigh, L2 = legLen.current.shin;
    const dy = foot.y - hip.y, dz = foot.z - hip.z;
    let d = Math.hypot(dy, dz);
    d = Math.min(d, (L1 + L2) * 0.985);
    d = Math.max(d, Math.abs(L1 - L2) + 0.02);
    const base = Math.atan2(dz, dy);                    // angle of hip→foot from +Y
    const beta = Math.acos(THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    // thigh direction (knee bends forward, +Z)
    const thighAng = base + beta;
    // world-X rotation that maps bind-down thigh (0,-1,0) to (0,cos thighAng, sin thighAng)
    const aThigh = thighAng - Math.PI;                  // relative to straight-down
    setWorld(upName, aThigh, 0);
    // knee interior angle → bend
    const gamma = Math.acos(THREE.MathUtils.clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    const knee = Math.PI - gamma;                        // 0 = straight
    setWorld(loName, -knee, 0);
  };

  useFrame((_, delta) => {
    const i = inRef.current;
    if (!root) return;
    const dt = Math.min(delta, 0.05);

    // crank / wheel advance
    const rpm = i.isPaused ? 0 : Math.max(0, i.cadence);
    const omega = (rpm / 60) * Math.PI * 2;              // rad/s
    crankRef.current += omega * dt;
    wheelRef.current += omega * 2.4 * dt;                // wheels spin faster than crank

    // standing blend
    const wantStand = i.isStanding ? 1 : 0;
    standRef.current += (wantStand - standRef.current) * Math.min(1, dt * 6);
    const stand = standRef.current;

    // torso lean (more with power + standing)
    const effort = THREE.MathUtils.clamp(i.power / 380, 0, 1);
    const lean = 0.18 + effort * 0.16 + stand * 0.12;
    setWorld("Spine", lean * 0.5, 0);
    setWorld("Spine1", lean * 0.35, 0);
    setWorld("Spine2", lean * 0.3, 0);
    setWorld("Neck", -lean * 0.5, 0);
    setWorld("Head", -0.12, 0);

    // arms swing from the T-pose out to front + down toward the bars
    setWorld("RightArm", 0.55, 0, 1.45);
    setWorld("LeftArm", 0.55, 0, -1.45);
    setWorld("RightForeArm", 0.35, 0, 0.1);
    setWorld("LeftForeArm", 0.35, 0, -0.1);

    // hip lift when standing
    const baseHipY = SADDLE.y + 0.04;
    const hipY = baseHipY + stand * 0.09;

    // pedal targets (right leads by crank angle, left +π)
    const th = crankRef.current;
    const footR = new THREE.Vector3(0, BB.y + CRANK_R * Math.cos(th), BB.z + CRANK_R * Math.sin(th));
    const footL = new THREE.Vector3(0, BB.y + CRANK_R * Math.cos(th + Math.PI), BB.z + CRANK_R * Math.sin(th + Math.PI));

    const hipR = hipWorld.current.R?.clone() ?? new THREE.Vector3(0.09, hipY, SADDLE.z);
    const hipL = hipWorld.current.L?.clone() ?? new THREE.Vector3(-0.09, hipY, SADDLE.z);
    hipR.y = hipY; hipL.y = hipY;

    solveLeg("RightUpLeg", "RightLeg", hipR, footR);
    solveLeg("LeftUpLeg", "LeftLeg", hipL, footL);

    // feet roughly flat on pedals
    setWorld("RightFoot", 0.5, 0);
    setWorld("LeftFoot", 0.5, 0);

    // whole-rider vertical bob + saddle offset when standing
    root.position.y = (root.userData.baseY ?? root.position.y);
    if (root.userData.baseY === undefined) root.userData.baseY = root.position.y;
    root.position.y = root.userData.baseY + stand * 0.08 + (stand > 0.5 ? Math.sin(th) * 0.015 : 0);
  });

  return root ? (
    <>
      <primitive object={root} />
      <Bike crankRef={crankRef} wheelRef={wheelRef} accent={preset.shorts} />
    </>
  ) : (
    <Bike crankRef={crankRef} wheelRef={wheelRef} accent={preset.shorts} />
  );
}

/** Real-time 3D rider (Option A). Renders on device / Expo Go via expo-gl. */
export function Rider3D({ inputs, size = 260 }: { inputs: Rider3DInputs; size?: number }) {
  return (
    <Canvas
      style={{ width: size, height: size }}
      camera={{ position: [2.9, 0.95, 2.2], fov: 40 }}
      onCreated={({ camera }) => camera.lookAt(0, 0.62, 0)}
      gl={{ alpha: true, antialias: true }}
    >
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 6, 4]} intensity={1.5} castShadow />
      <directionalLight position={[-4, 2, -3]} intensity={0.55} color="#F2C230" />
      <hemisphereLight args={["#ffffff", "#20242c", 0.5]} />
      <Rider inputs={inputs} />
    </Canvas>
  );
}
