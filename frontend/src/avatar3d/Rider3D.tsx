import React from "react";
import { Canvas, useFrame } from "@react-three/fiber/native";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type Rider3DInputs = {
  cadence: number;   // rpm -> animation / pedal speed
  power: number;     // watts -> effort (subtle forward lean)
  isStanding: boolean;
  isPaused: boolean;
  kitColor: string;  // live kit recolour
};

// Placeholder rigged+animated model to validate the 3D pipeline. Swap this URL
// for a rigged CYCLIST GLB (seated + standing pedal clips) for the real look.
const MODEL_URL =
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CesiumMan/glTF-Binary/CesiumMan.glb";

function Model({ inputs }: { inputs: Rider3DInputs }) {
  const [scene, setScene] = React.useState<THREE.Group | null>(null);
  const mixer = React.useRef<THREE.AnimationMixer | null>(null);
  const meshes = React.useRef<THREE.Mesh[]>([]);
  const inRef = React.useRef(inputs);
  inRef.current = inputs;

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(MODEL_URL);
        const buf = await res.arrayBuffer();
        new GLTFLoader().parse(buf, "", (gltf) => {
          if (!alive) return;
          const s = gltf.scene;
          s.scale.setScalar(1.4);
          s.position.set(0, -1.1, 0);
          meshes.current = [];
          s.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) {
              m.material = (m.material as THREE.Material).clone();
              meshes.current.push(m);
            }
          });
          if (gltf.animations.length) {
            mixer.current = new THREE.AnimationMixer(s);
            mixer.current.clipAction(gltf.animations[0]).play();
          }
          setScene(s);
        });
      } catch (e) {
        console.log("[Rider3D] load failed", e);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Live recolour of kit meshes.
  React.useEffect(() => {
    meshes.current.forEach((m) => {
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat?.color) mat.color.set(inputs.kitColor);
    });
  }, [inputs.kitColor, scene]);

  useFrame((_, delta) => {
    const i = inRef.current;
    const scale = i.isPaused ? 0 : Math.max(0.2, i.cadence / 60);
    mixer.current?.update(delta * scale);
    if (scene) {
      const lean = Math.min(0.5, i.power / 400) + (i.isStanding ? 0.15 : 0);
      scene.rotation.x = lean * 0.4;
      scene.position.y = -1.1 + (i.isStanding ? Math.sin(Date.now() / 180) * 0.03 : 0);
    }
  });

  return scene ? <primitive object={scene} /> : null;
}

/** Real-time 3D rider (Option A). Renders on device / Expo Go via expo-gl. */
export function Rider3D({ inputs, size = 260 }: { inputs: Rider3DInputs; size?: number }) {
  return (
    <Canvas style={{ width: size, height: size }} camera={{ position: [0, 0.4, 3.2], fov: 45 }} gl={{ alpha: true }}>
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 5, 4]} intensity={1.4} />
      <directionalLight position={[-3, 2, -2]} intensity={0.5} color="#F2C230" />
      <Model inputs={inputs} />
    </Canvas>
  );
}
