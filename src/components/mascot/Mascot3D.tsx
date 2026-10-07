"use client";
/**
 * The mascot in 3D: a small transparent canvas (React Three Fiber) inside the guide's stage. It loads
 * public/mascot/buildx-mascot.glb, adds the fur, and every frame blends the clips, turns the body
 * towards where it walks, turns the head and eyes towards what it looks at, blinks, and shows the
 * goggles, the drone and the section props. It renders only as often as needed (30 fps on phones,
 * slower when asleep, not at all when hidden or in a background tab).
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mascot } from "@/hooks/useMascotState";
import { NODES } from "@/lib/mascot/model";
import { addFur, FUR_DESKTOP, FUR_MOBILE } from "./fur";
import { bindAnimations } from "./MascotAnimations";
import { buildProps } from "./props";

export type Quality = "high" | "low";

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

/** Renders on demand at a capped frame rate; stops in background tabs and while paused. */
function Ticker({ fps, paused }: { fps: number; paused: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (paused) return;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const asleep = mascot.get().eyesClosed;
      const interval = 1000 / (asleep ? Math.min(fps, 20) : fps);
      if (t - last >= interval - 1) {
        last = t;
        invalidate();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fps, paused, invalidate]);
  return null;
}

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.6;
    pmrem.dispose();
    return () => {
      scene.environment = null;
      env.dispose();
    };
  }, [gl, scene]);
  return null;
}

/** Soft round shadow under the feet. */
function Shadow() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(0,0,0,0.5)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, 0.02]} renderOrder={-1}>
      <planeGeometry args={[0.95, 0.5]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

function Rig({ gltf, quality }: { gltf: GLTF; quality: Quality }) {
  const invalidate = useThree((s) => s.invalidate);
  const model = gltf.scene;
  const props = useMemo(() => buildProps(), []);
  const parts = useMemo(() => {
    addFur(model, quality === "high" ? FUR_DESKTOP : FUR_MOBILE);
    const get = (n: string) => model.getObjectByName(n) ?? null;
    const eyes = [get(NODES.eyeL), get(NODES.eyeR)].filter(Boolean) as THREE.Object3D[];
    return {
      root: get(NODES.root),
      look: get(NODES.look),
      eyes: eyes.map((e) => ({ node: e, sy: e.scale.y, x: e.position.x, y: e.position.y })),
      goggles: get(NODES.goggles),
      drone: get(NODES.drone),
      rotors: (() => {
        const r: THREE.Object3D[] = [];
        get(NODES.drone)?.traverse((o) => o.name.startsWith("Rotor") && r.push(o));
        return r;
      })(),
    };
  }, [model, quality]);
  const anim = useRef<ReturnType<typeof bindAnimations> | null>(null);
  const blink = useRef({ next: 2, t: -1 });
  const goggleW = useRef(0);
  const droneW = useRef(0);

  useEffect(() => {
    anim.current = bindAnimations(model, gltf.animations, invalidate);
    mascot.set({ ready: true });
    return () => {
      anim.current?.dispose();
      anim.current = null;
    };
  }, [model, gltf.animations, invalidate]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = state.clock.elapsedTime;
    anim.current?.mixer.update(dt);
    const s = mascot.get();

    // Body turns towards where it walks (three-quarter, so the face stays visible).
    if (parts.root) parts.root.rotation.y = damp(parts.root.rotation.y, s.facing * 1.05, 8, dt);

    // Head and eyes follow the look target (in screen pixels, relative to the mascot's head).
    let yaw = 0;
    let pitch = 0;
    if (s.look && s.box.w) {
      const hx = s.box.x + s.box.w / 2;
      const hy = s.box.y + s.box.h * 0.32;
      const dx = (s.look.x - hx) / Math.max(320, window.innerWidth * 0.45);
      const dy = (s.look.y - hy) / Math.max(320, window.innerHeight * 0.6);
      yaw = THREE.MathUtils.clamp(dx, -1, 1) * 0.55;
      pitch = THREE.MathUtils.clamp(dy, -1, 1) * 0.32;
    }
    if (s.eyesClosed) yaw = pitch = 0;
    if (parts.look) {
      parts.look.rotation.y = damp(parts.look.rotation.y, yaw - s.facing * 0.35, 6, dt);
      parts.look.rotation.x = damp(parts.look.rotation.x, pitch, 6, dt);
    }

    // Blink every few seconds (eyes closed while asleep).
    const b = blink.current;
    if (t > b.next && b.t < 0) b.t = 0;
    let open = 1;
    if (b.t >= 0) {
      b.t += dt;
      open = Math.abs(1 - b.t / 0.075);
      if (b.t > 0.15) {
        b.t = -1;
        b.next = t + 2.2 + Math.random() * 3.5;
        open = 1;
      }
    }
    if (s.eyesClosed) open = 0.1;
    for (const e of parts.eyes) {
      e.node.scale.y = e.sy * Math.max(0.1, open);
      e.node.position.x = e.x + yaw * 0.012;
      e.node.position.y = e.y - pitch * 0.01;
    }

    // Robotics extras: goggles and the drone companion.
    goggleW.current = damp(goggleW.current, s.goggles ? 1 : 0, 7, dt);
    if (parts.goggles) {
      parts.goggles.visible = goggleW.current > 0.02;
      parts.goggles.scale.setScalar(Math.max(0.001, goggleW.current));
    }
    droneW.current = damp(droneW.current, s.drone ? 1 : 0, 4, dt);
    if (parts.drone) {
      const w = droneW.current;
      parts.drone.visible = w > 0.02;
      // Hovers by the right shoulder in a slow figure-eight, tilted so its rotors show.
      parts.drone.position.set(0.56 + 0.07 * Math.sin(t * 0.9), 1.08 + 0.05 * Math.sin(t * 1.8) + (1 - w) * 0.6, 0.22 + 0.06 * Math.sin(t * 0.45));
      parts.drone.rotation.set(0.5, -0.4 + Math.sin(t * 0.9) * 0.15, Math.sin(t * 1.8) * 0.12);
      parts.drone.scale.setScalar(Math.max(0.001, w * 1.7));
      for (const r of parts.rotors) r.rotation.y += dt * 40;
    }

    props.update(t, dt, s.props);
  });

  return (
    <>
      <primitive object={model} />
      <primitive object={props.root} />
      <Shadow />
    </>
  );
}

const cache = new Map<string, Promise<GLTF>>();
function loadModel(url: string, onProgress: (p: number) => void) {
  if (!cache.has(url)) {
    cache.set(
      url,
      new GLTFLoader().loadAsync(url, (e) => e.total && onProgress(e.loaded / e.total)).catch((err) => {
        cache.delete(url);
        throw err;
      }),
    );
  }
  return cache.get(url)!;
}

export default function Mascot3D({ url, quality, paused, onProgress, onError }: { url: string; quality: Quality; paused: boolean; onProgress?: (p: number) => void; onError?: () => void }) {
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const progress = useRef(onProgress);
  const error = useRef(onError);
  useEffect(() => {
    progress.current = onProgress;
    error.current = onError;
  });
  useEffect(() => {
    let alive = true;
    loadModel(url, (p) => progress.current?.(p))
      .then((g) => alive && setGltf(g))
      .catch(() => alive && error.current?.());
    return () => {
      alive = false;
    };
  }, [url]);

  return (
    <Canvas
      frameloop="demand"
      dpr={quality === "high" ? [1, 2] : [1, 1.5]}
      gl={{ antialias: quality === "high", alpha: true, powerPreference: "low-power", preserveDrawingBuffer: false }}
      camera={{ fov: 24, position: [0, 0.82, 4.3], near: 0.1, far: 20 }}
      onCreated={({ gl, camera }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.setClearColor(0x000000, 0);
        camera.lookAt(0, 0.78, 0);
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          error.current?.();
        });
      }}
      style={{ pointerEvents: "none" }}
      aria-hidden
    >
      <Ticker fps={quality === "high" ? 60 : 30} paused={paused} />
      <Environment />
      <directionalLight color="#fff4e8" intensity={2.2} position={[-2, 3, 3]} />
      <directionalLight color="#9cc4ff" intensity={1.6} position={[2.5, 2, -2]} />
      <hemisphereLight args={["#ffffff", "#c8b49c", 0.6]} />
      {gltf && <Rig gltf={gltf} quality={quality} />}
    </Canvas>
  );
}
