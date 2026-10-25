"use client";
/**
 * The page's hero: a model "being made" — a cloud of points gathers, a glowing scan line climbs and
 * the solid model appears under it while a wireframe shows the part still to come, then it turns on
 * its stand and the next one starts. The models are built here from simple shapes (a robot, a vase, a
 * rocket, a gear); they illustrate the steps, they are not results of the tool. Renders only while on
 * screen; with reduced motion it shows the finished robot, still.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const CYCLE = 7.5;
export const DEMO_COUNT = 4;

function mat(color: string, metal = 0.2, rough = 0.4, emissive?: string) {
  return new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, emissive: emissive ?? "#000000", emissiveIntensity: emissive ? 1.4 : 0 });
}

function add(g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number], r: [number, number, number] = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(...p);
  mesh.rotation.set(...r);
  g.add(mesh);
  return mesh;
}

function robot() {
  const g = new THREE.Group();
  const white = mat("#e9eef7", 0.1, 0.35);
  const dark = mat("#1b2a4a", 0.6, 0.35);
  const eye = mat("#3cc4ff", 0, 0.2, "#3cc4ff");
  add(g, new THREE.CapsuleGeometry(0.42, 0.5, 8, 24), white, [0, 0.75, 0]);
  add(g, new THREE.SphereGeometry(0.36, 32, 24), white, [0, 1.52, 0]);
  add(g, new THREE.BoxGeometry(0.5, 0.18, 0.08), dark, [0, 1.54, 0.3]);
  add(g, new THREE.SphereGeometry(0.06, 16, 12), eye, [-0.12, 1.55, 0.35]);
  add(g, new THREE.SphereGeometry(0.06, 16, 12), eye, [0.12, 1.55, 0.35]);
  add(g, new THREE.CylinderGeometry(0.015, 0.015, 0.22), dark, [0, 1.95, 0]);
  add(g, new THREE.SphereGeometry(0.045, 16, 12), eye, [0, 2.07, 0]);
  add(g, new THREE.CapsuleGeometry(0.09, 0.42, 6, 12), dark, [-0.55, 0.85, 0], [0, 0, 0.35]);
  add(g, new THREE.CapsuleGeometry(0.09, 0.42, 6, 12), dark, [0.55, 0.85, 0], [0, 0, -0.35]);
  add(g, new THREE.CylinderGeometry(0.12, 0.14, 0.32, 20), dark, [-0.18, 0.16, 0]);
  add(g, new THREE.CylinderGeometry(0.12, 0.14, 0.32, 20), dark, [0.18, 0.16, 0]);
  add(g, new THREE.TorusGeometry(0.2, 0.03, 12, 40), eye, [0, 0.78, 0.4]);
  return g;
}

function vase() {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    pts.push(new THREE.Vector2(0.22 + 0.42 * Math.sin(Math.PI * (0.15 + t * 0.85)) * (1 - 0.35 * t) + 0.03 * Math.sin(t * 28), t * 1.9));
  }
  add(g, new THREE.LatheGeometry(pts, 64), mat("#2f7bff", 0.15, 0.25), [0, 0, 0]);
  add(g, new THREE.TorusGeometry(0.29, 0.03, 12, 48), mat("#e8b45c", 0.9, 0.25), [0, 1.86, 0], [Math.PI / 2, 0, 0]);
  return g;
}

function rocket() {
  const g = new THREE.Group();
  const body = mat("#f3f7fd", 0.2, 0.3);
  const red = mat("#ff4d5e", 0.2, 0.35);
  add(g, new THREE.CylinderGeometry(0.3, 0.3, 1.2, 40), body, [0, 0.95, 0]);
  add(g, new THREE.ConeGeometry(0.3, 0.55, 40), red, [0, 1.82, 0]);
  add(g, new THREE.CylinderGeometry(0.22, 0.3, 0.25, 40), mat("#34508c", 0.7, 0.3), [0, 0.23, 0]);
  add(g, new THREE.TorusGeometry(0.12, 0.03, 12, 32), mat("#3cc4ff", 0, 0.2, "#3cc4ff"), [0, 1.2, 0.29]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    add(g, new THREE.BoxGeometry(0.04, 0.45, 0.32), red, [Math.sin(a) * 0.33, 0.45, Math.cos(a) * 0.33], [0, a, 0]);
  }
  add(g, new THREE.ConeGeometry(0.17, 0.35, 24), mat("#ffb547", 0, 0.5, "#ff8a1f"), [0, -0.05, 0], [Math.PI, 0, 0]);
  return g;
}

function gear() {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  const teeth = 14;
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 ? 0.62 : 0.78;
    const a2 = a + Math.PI / (teeth * 2);
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    s.lineTo(Math.cos(a2) * r, Math.sin(a2) * r);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.2, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
  geo.center();
  add(g, geo, mat("#bfcce4", 0.85, 0.28), [0, 1, 0], [0, 0, 0]);
  add(g, new THREE.TorusGeometry(0.4, 0.04, 12, 48), mat("#3cc4ff", 0, 0.2, "#3cc4ff"), [0, 1, 0.13]);
  return g;
}

const BUILDERS = [robot, vase, rocket, gear];

/** Fit to 2 units tall, standing on y = 0. */
function normalise(g: THREE.Group) {
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3());
  const s = 2 / Math.max(size.y, size.x, size.z);
  g.scale.setScalar(s);
  g.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(g);
  g.position.y -= b2.min.y;
  g.position.x -= (b2.min.x + b2.max.x) / 2;
  g.position.z -= (b2.min.z + b2.max.z) / 2;
  return g;
}

type Built = { solid: THREE.Group; wire: THREE.Group; points: THREE.Points; height: number };

function build(i: number, below: THREE.Plane, above: THREE.Plane): Built {
  const solid = normalise(BUILDERS[i]());
  solid.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      (o.material as THREE.MeshStandardMaterial).clippingPlanes = [below];
      (o.material as THREE.MeshStandardMaterial).clipShadows = true;
    }
  });
  const wireMat = new THREE.MeshBasicMaterial({ color: "#3cc4ff", wireframe: true, transparent: true, opacity: 0.28, clippingPlanes: [above], depthWrite: false });
  const wire = solid.clone(true);
  wire.traverse((o) => {
    if (o instanceof THREE.Mesh) o.material = wireMat;
  });
  // A cloud of points sampled from the surfaces, for the first moment.
  const pos: number[] = [];
  solid.updateMatrixWorld(true);
  solid.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const p = o.geometry.getAttribute("position");
    const step = Math.max(1, Math.floor(p.count / 260));
    const v = new THREE.Vector3();
    for (let k = 0; k < p.count; k += step) {
      v.fromBufferAttribute(p, k).applyMatrix4(o.matrixWorld);
      pos.push(v.x, v.y, v.z);
    }
  });
  const pg = new THREE.BufferGeometry();
  pg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  pg.setAttribute("target", new THREE.Float32BufferAttribute(pos.slice(), 3));
  const scatter = new Float32Array(pos.length);
  for (let k = 0; k < scatter.length; k++) scatter[k] = (Math.random() - 0.5) * 3.2 + (k % 3 === 1 ? 1 : 0);
  pg.setAttribute("scatter", new THREE.BufferAttribute(scatter, 3));
  const points = new THREE.Points(pg, new THREE.PointsMaterial({ color: "#a8ecff", size: 0.03, transparent: true, opacity: 0.9, depthWrite: false }));
  return { solid, wire, points, height: new THREE.Box3().setFromObject(solid).max.y };
}

function Env() {
  const { gl, scene } = useThree();
  useEffect(() => {
    gl.localClippingEnabled = true;
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.75;
    pm.dispose();
    return () => {
      scene.environment = null;
      env.dispose();
    };
  }, [gl, scene]);
  return null;
}

const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));

function Show({ still, onTick }: { still: boolean; onTick: (i: number, p: number) => void }) {
  const below = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), []);
  const above = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const models = useMemo(() => BUILDERS.map((_, i) => build(i, below, above)), [below, above]);
  const stand = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const [idx, setIdx] = useState(0);
  const last = useRef(-1);

  useEffect(
    () => () =>
      models.forEach((m) => {
        m.solid.traverse((o) => o instanceof THREE.Mesh && (o.geometry.dispose(), (o.material as THREE.Material).dispose()));
        m.points.geometry.dispose();
      }),
    [models],
  );

  useFrame(({ clock }, dt) => {
    const t = still ? CYCLE * 0.7 : clock.elapsedTime;
    const i = still ? 0 : Math.floor(t / CYCLE) % models.length;
    const k = (t % CYCLE) / CYCLE;
    if (i !== last.current) {
      last.current = i;
      setIdx(i);
    }
    const m = models[i];
    // 0–.15 points gather · .15–.55 scan climbs · .55–.9 turn · .9–1 shrink away
    const gather = ease(k / 0.15);
    const scan = ease((k - 0.12) / 0.43);
    const out = ease((k - 0.9) / 0.1);
    const h = -0.05 + scan * (m.height + 0.1);
    below.constant = h;
    above.constant = -h;
    const pos = m.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    const tgt = m.points.geometry.getAttribute("target") as THREE.BufferAttribute;
    const sc = m.points.geometry.getAttribute("scatter") as THREE.BufferAttribute;
    for (let n = 0; n < pos.count; n++) {
      pos.setXYZ(n, tgt.getX(n) + sc.getX(n) * (1 - gather), tgt.getY(n) + sc.getY(n) * (1 - gather), tgt.getZ(n) + sc.getZ(n) * (1 - gather));
    }
    pos.needsUpdate = true;
    (m.points.material as THREE.PointsMaterial).opacity = still ? 0 : 0.9 * (1 - ease((k - 0.2) / 0.35));
    if (ring.current) {
      ring.current.position.y = h;
      ring.current.visible = !still && scan > 0.01 && scan < 0.99;
      const s = 0.85 + 0.25 * Math.sin(t * 6);
      ring.current.scale.set(s, s, 1);
    }
    if (stand.current) {
      stand.current.rotation.y += dt * (still ? 0 : 0.6);
      const s = 1 - out * 0.85;
      stand.current.scale.setScalar(s);
    }
    onTick(i, scan);
  });

  const m = models[idx];
  return (
    <group position={[0, -1.05, 0]}>
      <group ref={stand}>
        <primitive object={m.solid} />
        <primitive object={m.wire} />
        <primitive object={m.points} />
      </group>
      <mesh ref={ring} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.95, 1.08, 64]} />
        <meshBasicMaterial color="#3cc4ff" transparent opacity={0.75} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]}>
        <circleGeometry args={[1.12, 64]} />
        <meshStandardMaterial color="#060d22" metalness={0.2} roughness={0.85} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, 0]}>
        <ringGeometry args={[1.1, 1.13, 96]} />
        <meshBasicMaterial color="#3cc4ff" transparent opacity={0.45} />
      </mesh>
    </group>
  );
}

export default function DemoScene({ onTick }: { onTick: (i: number, p: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(true);
  const [still, setStill] = useState(false);
  useEffect(() => {
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting && !document.hidden), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={box} className="absolute inset-0">
      <Canvas
        frameloop={on && !still ? "always" : "demand"}
        dpr={[1, 1.75]}
        camera={{ position: [0, 0.85, 4.9], fov: 36 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        aria-hidden
      >
        <Env />
        <ambientLight intensity={0.35} />
        <directionalLight position={[3, 5, 4]} intensity={1.6} />
        <pointLight position={[-3, 1, -2]} intensity={6} color="#3cc4ff" />
        <Show still={still} onTick={onTick} />
      </Canvas>
    </div>
  );
}
