/**
 * Small floating objects that appear next to the mascot in some sections: gears (about), neural
 * nodes (AI), a chip (embedded), code panels (software) and a sensor pinging (IoT/competitions).
 * Built from primitives (nothing to download); each one scales in and out smoothly.
 */
import * as THREE from "three";
import type { PropName } from "@/config/mascotJourney";

const BLUE = new THREE.Color("#2f7bff");
const CYAN = new THREE.Color("#3cc4ff");

function gearGeometry(r: number, teeth: number, depth: number) {
  const shape = new THREE.Shape();
  const inner = r * 0.8;
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = ((i + 0.3) / teeth) * Math.PI * 2;
    const a2 = ((i + 0.5) / teeth) * Math.PI * 2;
    const a3 = ((i + 0.8) / teeth) * Math.PI * 2;
    const p = (a: number, rr: number) => [Math.cos(a) * rr, Math.sin(a) * rr] as const;
    if (i === 0) shape.moveTo(...p(a0, inner));
    shape.lineTo(...p(a1, inner));
    shape.lineTo(...p(a1 + 0.04, r));
    shape.lineTo(...p(a2 + 0.04, r));
    shape.lineTo(...p(a3, inner));
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.32, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.25, bevelSize: depth * 0.2, bevelSegments: 2, curveSegments: 6 });
  g.center();
  return g;
}

function codeTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 168;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(8,22,52,0.92)";
  g.beginPath();
  g.roundRect(0, 0, 256, 168, 18);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.18)";
  for (const [i, x] of [16, 34, 52].entries()) {
    g.fillStyle = ["#ff5f57", "#febc2e", "#28c840"][i];
    g.beginPath();
    g.arc(x, 16, 5, 0, Math.PI * 2);
    g.fill();
  }
  const colors = ["#63a0ff", "#3cc4ff", "#e8b45c", "#bfcce4", "#33d69f"];
  let y = 38;
  for (let i = 0; i < 8; i++) {
    let x = 16 + (i % 3 === 1 ? 18 : i % 3 === 2 ? 36 : 0);
    for (let j = 0; j < 3; j++) {
      const w = 18 + ((i * 37 + j * 53) % 60);
      g.fillStyle = colors[(i + j * 2) % colors.length];
      g.globalAlpha = 0.9;
      g.beginPath();
      g.roundRect(x, y, w, 8, 4);
      g.fill();
      x += w + 8;
      if (x > 220) break;
    }
    y += 15;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

type Prop = { name: PropName; group: THREE.Group; weight: number; tick: (t: number, dt: number) => void };

export function buildProps() {
  const root = new THREE.Group();
  root.name = "Props";
  const metal = new THREE.MeshStandardMaterial({ color: "#c9d3e6", metalness: 0.85, roughness: 0.3 });
  const brand = new THREE.MeshStandardMaterial({ color: BLUE, emissive: BLUE, emissiveIntensity: 0.6, roughness: 0.35 });
  const glow = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: "#0f1a33", roughness: 0.45, metalness: 0.3 });
  const gold = new THREE.MeshStandardMaterial({ color: "#e8b45c", metalness: 0.9, roughness: 0.3 });
  const props: Prop[] = [];

  // Gears: two meshing gears, upper left.
  {
    const g = new THREE.Group();
    g.position.set(-0.56, 1.08, 0.05);
    const a = new THREE.Mesh(gearGeometry(0.11, 12, 0.035), metal);
    const b = new THREE.Mesh(gearGeometry(0.07, 8, 0.035), brand);
    b.position.set(0.155, -0.075, 0.01);
    g.add(a, b);
    g.rotation.set(0.25, 0.35, 0);
    props.push({ name: "gears", group: g, weight: 0, tick: (t) => ((a.rotation.z = t * 0.6), (b.rotation.z = -t * 0.6 * (12 / 8) + 0.13)) });
  }

  // Neural nodes: a small network that pulses, upper right.
  {
    const g = new THREE.Group();
    g.position.set(0.56, 1.1, 0);
    const pts = [
      [-0.12, 0.08],
      [-0.12, -0.06],
      [0, 0.12],
      [0, 0.01],
      [0, -0.1],
      [0.12, 0.05],
      [0.12, -0.07],
    ].map(([x, y], i) => new THREE.Vector3(x, y, (i % 2) * 0.03));
    const nodes = pts.map((p) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), glow.clone());
      m.position.copy(p);
      g.add(m);
      return m;
    });
    const links: number[] = [];
    for (const [i, j] of [
      [0, 2],
      [0, 3],
      [1, 3],
      [1, 4],
      [2, 5],
      [3, 5],
      [3, 6],
      [4, 6],
    ])
      links.push(...pts[i].toArray(), ...pts[j].toArray());
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(links, 3));
    const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.45 }));
    g.add(lines);
    props.push({
      name: "nodes",
      group: g,
      weight: 0,
      tick: (t) => {
        nodes.forEach((n, i) => ((n.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.55 * Math.max(0, Math.sin(t * 3 - i * 0.9))));
        g.rotation.y = Math.sin(t * 0.5) * 0.3;
      },
    });
  }

  // Chip: a microcontroller with gold pins and a glowing core, left.
  {
    const g = new THREE.Group();
    g.position.set(-0.6, 0.62, 0.05);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.022, 0.17), dark));
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.008, 0.07), brand);
    core.position.y = 0.014;
    g.add(core);
    const pin = new THREE.BoxGeometry(0.012, 0.008, 0.03);
    for (let i = 0; i < 5; i++) {
      const o = -0.06 + i * 0.03;
      for (const [x, z, r] of [
        [o, 0.1, 0],
        [o, -0.1, 0],
        [0.1, o, Math.PI / 2],
        [-0.1, o, Math.PI / 2],
      ]) {
        const p = new THREE.Mesh(pin, gold);
        p.position.set(x, 0, z);
        p.rotation.y = r;
        g.add(p);
      }
    }
    g.rotation.set(0.9, 0.3, -0.15);
    props.push({ name: "chip", group: g, weight: 0, tick: (t) => ((g.rotation.z = -0.15 + Math.sin(t * 0.8) * 0.12), (brand.emissiveIntensity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.4)))) });
  }

  // Code panels: two floating editor windows, right.
  {
    const g = new THREE.Group();
    g.position.set(0.58, 0.72, -0.02);
    const tex = codeTexture();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const a = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), mat);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.145), mat);
    a.rotation.y = -0.35;
    b.position.set(-0.06, 0.17, -0.06);
    b.rotation.y = -0.2;
    g.add(a, b);
    props.push({ name: "code", group: g, weight: 0, tick: (t) => ((a.position.y = Math.sin(t * 1.1) * 0.012), (b.position.y = 0.17 + Math.sin(t * 1.1 + 1.4) * 0.012)) });
  }

  // Sensor: a node sending out rings, upper left.
  {
    const g = new THREE.Group();
    g.position.set(-0.58, 0.98, 0);
    const node = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 12), brand);
    g.add(node);
    const rings = [0, 1, 2].map(() => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.004, 6, 40), new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, depthWrite: false }));
      g.add(r);
      return r;
    });
    props.push({
      name: "sensors",
      group: g,
      weight: 0,
      tick: (t) =>
        rings.forEach((r, i) => {
          const k = (t * 0.6 + i / 3) % 1;
          r.scale.setScalar(0.6 + k * 2.2);
          (r.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.8;
        }),
    });
  }

  for (const p of props) {
    p.group.visible = false;
    p.group.scale.setScalar(0.001);
    root.add(p.group);
  }

  return {
    root,
    update(t: number, dt: number, active: readonly PropName[]) {
      for (const p of props) {
        const target = active.includes(p.name) ? 1 : 0;
        p.weight += (target - p.weight) * Math.min(1, dt * 5);
        if (p.weight < 0.01 && target === 0) {
          p.group.visible = false;
          continue;
        }
        p.group.visible = true;
        // A little overshoot when it pops in.
        const s = p.weight * (1 + 0.12 * Math.sin(p.weight * Math.PI));
        p.group.scale.setScalar(Math.max(0.001, s));
        p.tick(t, dt);
      }
    },
  };
}
