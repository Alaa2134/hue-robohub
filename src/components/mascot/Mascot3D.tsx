"use client";
/**
 * The mascot in 3D: a small transparent canvas (React Three Fiber) inside the guide's stage. It loads
 * public/mascot/buildx-mascot.glb, adds the fur, and every frame blends the clips, turns the body
 * towards where it walks, turns the head and eyes towards what it looks at, blinks, and shows the
 * goggles, the drone and the section props. Thrown by the visitor, he falls flat on his belly (and gets up). It renders only as often as needed (30 fps on phones,
 * slower when asleep, not at all when hidden or in a background tab).
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mascot } from "@/hooks/useMascotState";
import { NODES, OUTFITS } from "@/lib/mascot/model";
import { addFur, FUR_DESKTOP, FUR_MOBILE, FUR_ULTRA } from "./fur";
import { bindAnimations } from "./MascotAnimations";
import { buildProps } from "./props";

export type Quality = "ultra" | "high" | "low";

const FUR: Record<Quality, typeof FUR_DESKTOP> = { ultra: FUR_ULTRA, high: FUR_DESKTOP, low: FUR_MOBILE };

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
    addFur(model, FUR[quality]);
    const get = (n: string) => model.getObjectByName(n) ?? null;
    const eyes = [get(NODES.eyeL), get(NODES.eyeR)].filter(Boolean) as THREE.Object3D[];
    return {
      root: get(NODES.root),
      look: get(NODES.look),
      eyes: eyes.map((e) => {
        const shine = e.children[0] ?? null;
        return { node: e, sy: e.scale.y, x: e.position.x, y: e.position.y, shine, shineAt: shine?.position.clone() ?? null };
      }),
      goggles: get(NODES.goggles),
      headphones: get(NODES.headphones),
      mouth: get(NODES.mouth),
      brows: [get(NODES.browL), get(NODES.browR)].map((b) => b && { node: b, rz: b.rotation.z, y: b.position.y }),
      outfits: OUTFITS.map((name) => ({ name, node: get(name), w: 0 })),
      drone: get(NODES.drone),
      rotors: (() => {
        const r: THREE.Object3D[] = [];
        get(NODES.drone)?.traverse((o) => o.name.startsWith("Rotor") && r.push(o));
        return r;
      })(),
    };
  }, [model, quality]);
  const anim = useRef<ReturnType<typeof bindAnimations> | null>(null);
  const blink = useRef({ next: 2, t: -1, again: false });
  /** Where the eyes and the head point (yaw, pitch in radians); eyes get there first, the head follows. */
  const gaze = useRef({ eyeYaw: 0, eyePitch: 0, tYaw: 0, tPitch: 0, micro: { x: 0, y: 0, next: 0 }, wander: { yaw: 0, pitch: 0, until: 0, next: 3 }, roll: 0, lean: 0, torso: 0, open: 1 });
  const goggleW = useRef(0);
  const droneW = useRef(0);
  const fall = useRef<THREE.Group>(null);
  const fallW = useRef(0);
  const fallSide = useRef(1);

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

    // Belly flop: tips forward onto his front with his head towards the side he was thrown, lifted
    // by his tummy's thickness, a bit smaller and centred so all of him stays in the frame.
    if (s.flop) fallSide.current = Math.sign(s.flop);
    fallW.current = damp(fallW.current, s.flop ? 1 : 0, s.flop ? 10 : 4.5, dt);
    if (fall.current) {
      const w = fallW.current;
      const side = fallSide.current;
      fall.current.rotation.set(0, side * (Math.PI / 2) * w, 0);
      fall.current.children[0].rotation.x = (Math.PI / 2) * w;
      fall.current.position.set(-side * 0.6 * w, 0.2 * w, 0);
      fall.current.scale.setScalar(1 - 0.2 * w);
    }

    // Breathing: a slow, slight swell of the whole body from the feet (faster while talking or
    // after being thrown around).
    const inner = fall.current?.children[0];
    if (inner && !s.flop) {
      const rate = s.speech ? 2.6 : s.mood === "surprised" ? 3.4 : 1.7;
      const br = Math.sin(t * rate);
      inner.scale.set(1 - 0.006 * br, 1 + 0.011 * br, 1 - 0.006 * br);
    } else if (inner) inner.scale.set(1, 1, 1);

    // Gaze. The target is what he looks at (the cursor or finger, a button, a section); with nothing
    // to look at he looks at you, and now and then glances away and back. The eyes jump there first
    // (a saccade) and the head turns after them; far to the side the body turns a little too.
    const g = gaze.current;
    let yaw = 0;
    let pitch = 0;
    let close = 0;
    if (s.look && s.box.w) {
      const hx = s.box.x + s.box.w / 2;
      const hy = s.box.y + s.box.h * 0.32;
      const dx = s.look.x - hx;
      const dy = s.look.y - hy;
      yaw = Math.tanh(dx / Math.max(260, window.innerWidth * 0.32)) * 0.75;
      pitch = Math.tanh(dy / Math.max(260, window.innerHeight * 0.45)) * 0.42;
      close = Math.max(0, 1 - Math.hypot(dx, dy) / Math.max(60, s.box.h * 0.45));
    } else if (!s.speech) {
      const w = g.wander;
      if (t > w.next) {
        w.yaw = (Math.random() - 0.5) * 0.9;
        w.pitch = (Math.random() - 0.35) * 0.35;
        w.until = t + 0.7 + Math.random() * 1.1;
        w.next = t + 3.5 + Math.random() * 5;
      }
      if (t < w.until) {
        yaw = w.yaw;
        pitch = w.pitch;
      }
    }
    if (s.eyesClosed || s.flop || s.held) yaw = pitch = close = 0;
    // A big jump in where he looks: humans often blink with it.
    if (Math.hypot(yaw - g.tYaw, pitch - g.tPitch) > 0.32 && blink.current.t < 0 && Math.random() < 0.6) blink.current.next = t;
    g.tYaw = yaw;
    g.tPitch = pitch;
    // Tiny fixation jitter (micro-saccades) so the eyes never look frozen.
    if (t > g.micro.next) {
      g.micro = { x: (Math.random() - 0.5) * 0.05, y: (Math.random() - 0.5) * 0.035, next: t + 0.35 + Math.random() * 0.9 };
    }
    g.eyeYaw = damp(g.eyeYaw, yaw + g.micro.x, 32, dt);
    g.eyePitch = damp(g.eyePitch, pitch + g.micro.y, 32, dt);
    // The body turns towards where it walks (three-quarter, so the face stays visible), and a bit
    // towards something far to the side.
    g.torso = damp(g.torso, s.facing ? 0 : THREE.MathUtils.clamp(yaw - Math.sign(yaw) * 0.35, -0.3, 0.3) * 0.5, 2.2, dt);
    if (parts.root) parts.root.rotation.y = damp(parts.root.rotation.y, s.facing * 1.05 + g.torso, 8, dt);
    // Curious head tilt towards the side he looks at; leans back from a cursor right in his face.
    g.roll = damp(g.roll, -yaw * 0.16 + (s.mood === "happy" ? 0.06 * Math.sin(t * 1.3) : 0), 3, dt);
    g.lean = damp(g.lean, close * -0.22, 9, dt);
    if (parts.look) {
      const headYaw = yaw * 0.78 - s.facing * 0.35 - g.torso;
      parts.look.rotation.y = damp(parts.look.rotation.y, headYaw, 4.5, dt);
      parts.look.rotation.x = damp(parts.look.rotation.x, pitch * 0.8 + g.lean, 4.5, dt);
      parts.look.rotation.z = g.roll;
    }
    // The eyes cover what the head hasn't turned yet.
    const headNow = parts.look ? parts.look.rotation.y + s.facing * 0.35 + g.torso : 0;
    const eyeX = THREE.MathUtils.clamp(g.eyeYaw - headNow * 0.85, -0.6, 0.6);
    const eyeY = THREE.MathUtils.clamp(g.eyePitch - (parts.look ? parts.look.rotation.x - g.lean : 0) * 0.85, -0.5, 0.5);

    // Blinks: every 2-6 s at random, sometimes twice in a row, quick to close and slower to open;
    // the upper lid comes down (the eye squashes from the top). Asleep: closed.
    const b = blink.current;
    if (t > b.next && b.t < 0) b.t = 0;
    let lid = 1;
    if (b.t >= 0) {
      b.t += dt;
      const CLOSE = 0.06;
      const HOLD = 0.035;
      const OPEN = 0.11;
      lid = b.t < CLOSE ? 1 - b.t / CLOSE : b.t < CLOSE + HOLD ? 0 : Math.min(1, (b.t - CLOSE - HOLD) / OPEN);
      if (b.t > CLOSE + HOLD + OPEN) {
        b.t = -1;
        b.again = !b.again && Math.random() < 0.18;
        b.next = t + (b.again ? 0.12 : 2 + Math.random() * 4);
        lid = 1;
      }
    }
    // How wide open: wide when surprised, a smiling squint when happy, narrowed when angry, a
    // squint when the cursor is right in his face.
    const wide = { neutral: 1, happy: 0.82, angry: 0.78, sad: 0.9, surprised: 1.18 }[s.mood] ?? 1;
    g.open = damp(g.open, wide * (1 - close * 0.4), 10, dt);
    let open = lid * g.open;
    if (s.eyesClosed) open = 0.1;
    for (const e of parts.eyes) {
      const k = Math.max(0.1, open);
      e.node.scale.y = e.sy * k;
      // Squash from the top: the bottom edge stays, as if the upper lid comes down.
      e.node.position.x = e.x + eyeX * 0.03;
      e.node.position.y = e.y - eyeY * 0.022 - (1 - k) * 0.02;
      // The catchlight stays put relative to the light, so it slides a little across the moving eye.
      if (e.shine && e.shineAt) {
        const sx = e.shineAt.x - eyeX * 0.012;
        const sy = e.shineAt.y + eyeY * 0.01;
        e.shine.position.set(sx, sy, Math.sqrt(Math.max(0, 0.04 ** 2 - sx ** 2 - sy ** 2)));
      }
      // Mid-blink the eye is a thin line: no catchlights or iris on it.
      for (const c of e.node.children) c.visible = k > 0.35;
    }

    // Outfits pop on and off (a quick scale), the nightcap replaces the headphones.
    for (const o of parts.outfits) {
      if (!o.node) continue;
      o.w = damp(o.w, s.outfit.includes(o.name) ? 1 : 0, 9, dt);
      o.node.visible = o.w > 0.02;
      o.node.scale.setScalar(Math.max(0.001, o.w));
    }
    if (parts.headphones) parts.headphones.visible = !s.outfit.includes("Nightcap");

    // Face: eyebrows for the mood, and the mouth moves while he talks.
    const brow = { neutral: [0, 0], happy: [0.08, 0.006], angry: [-0.42, -0.008], sad: [0.38, 0.004], surprised: [0, 0.022] }[s.mood] ?? [0, 0];
    parts.brows.forEach((b, i) => {
      if (!b) return;
      const side = i === 0 ? 1 : -1;
      b.node.rotation.z = damp(b.node.rotation.z, b.rz + side * brow[0], 12, dt);
      b.node.position.y = damp(b.node.position.y, b.y + brow[1], 12, dt);
    });
    if (parts.mouth) {
      const talk = s.speech && !s.eyesClosed ? 0.55 + 0.45 * Math.abs(Math.sin(t * 13)) * Math.abs(Math.sin(t * 5.3)) : 0;
      const sy = s.mood === "sad" ? -0.8 : s.mood === "surprised" ? 2 : 1 + talk * 1.6;
      const sx = s.mood === "surprised" ? 0.55 : 1 - talk * 0.15;
      parts.mouth.scale.y = damp(parts.mouth.scale.y, sy, 18, dt);
      parts.mouth.scale.x = damp(parts.mouth.scale.x, sx, 18, dt);
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
      <group ref={fall}>
        <group>
          <primitive object={model} />
        </group>
      </group>
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

export default function Mascot3D({ url, quality, fps, paused, onProgress, onError }: { url: string; quality: Quality; fps?: number; paused: boolean; onProgress?: (p: number) => void; onError?: () => void }) {
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
      // The canvas is small (his size on the page), so full sharpness costs little; ultra goes up to
      // the screen's own density (3x on many phones and retina screens).
      dpr={quality === "ultra" ? [1, Math.min(3, window.devicePixelRatio || 1)] : [1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power", preserveDrawingBuffer: false }}
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
      <Ticker fps={fps ?? (quality === "low" ? 30 : 60)} paused={paused} />
      <Environment />
      <directionalLight color="#fff4e8" intensity={2.2} position={[-2, 3, 3]} />
      <directionalLight color="#9cc4ff" intensity={1.6} position={[2.5, 2, -2]} />
      <hemisphereLight args={["#ffffff", "#c8b49c", 0.6]} />
      {/* Rim light from behind: a bright edge that keeps his outline clear on the dark site. */}
      <directionalLight color="#bfe0ff" intensity={2.4} position={[0, 2.2, -3]} />
      {gltf && <Rig gltf={gltf} quality={quality} />}
    </Canvas>
  );
}
