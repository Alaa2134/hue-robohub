"use client";
/**
 * The circuit in 3D: every part as a real-sized model on a workbench, jumper wires as flexible cables
 * between their pins, studio lighting with reflections and soft shadows, and bloom so lit LEDs glow.
 * While the simulation runs the models follow it (LED current, servo angle, motor speed, button
 * travel, meter readings) and buttons and switches can be clicked.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { CircuitDoc } from "../model";
import { worldBox, worldPins } from "../parts";
import { U, buildModel, type Live, type Model, type Reading } from "./models";

type Props = {
  doc: CircuitDoc;
  readings: Record<string, Reading>;
  live: Record<string, Live>;
  running: boolean;
  onLive: (part: string, key: string, value: number | boolean) => void;
};

/** Height of the surface each part sits on: a breadboard or board it's plugged into, else the bench. */
function bases(doc: CircuitDoc, models: Map<string, Model>) {
  const hostAt = new Map<string, number>();
  for (const p of doc.parts) {
    const m = models.get(p.id);
    if (m?.hostTop === undefined) continue;
    for (const q of worldPins(p)) hostAt.set(`${Math.round(q.x)},${Math.round(q.y)}`, m.hostTop);
  }
  const base = new Map<string, number>();
  for (const p of doc.parts) {
    const m = models.get(p.id);
    if (m?.hostTop !== undefined) {
      base.set(p.id, 0);
      continue;
    }
    const tops = worldPins(p).map((q) => hostAt.get(`${Math.round(q.x)},${Math.round(q.y)}`));
    base.set(p.id, tops.length && tops.every((t) => t !== undefined) ? Math.max(...(tops as number[])) : 0);
  }
  return base;
}

export default function Circuit3D({ doc, readings, live, running, onLive }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef({ readings, live, running, onLive });
  state.current = { readings, live, running, onLive };
  const sceneRef = useRef<{ rebuild: (d: CircuitDoc) => void } | null>(null);
  const [noGL, setNoGL] = useState(false);

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      setNoGL(true);
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.setAttribute("data-testid", "circuit-3d");

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0a1430");
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.5;

    const camera = new THREE.PerspectiveCamera(38, 1, 1, 5000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 20;
    controls.maxDistance = 1500;

    // Bench: a cutting mat with a 10 mm grid.
    const matTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 512;
      const x = c.getContext("2d")!;
      x.fillStyle = "#123a2c";
      x.fillRect(0, 0, 512, 512);
      x.strokeStyle = "rgba(190,240,215,.22)";
      x.lineWidth = 2;
      for (let i = 0; i <= 512; i += 51.2) {
        x.beginPath();
        x.moveTo(i, 0);
        x.lineTo(i, 512);
        x.moveTo(0, i);
        x.lineTo(512, i);
        x.stroke();
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    })();
    const bench = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.92 }));
    matTex.repeat.set(40, 40);
    bench.rotation.x = -Math.PI / 2;
    bench.receiveShadow = true;
    scene.add(bench);

    scene.add(new THREE.HemisphereLight("#dfe9ff", "#20304a", 0.35));
    const sun = new THREE.DirectionalLight("#fff6ea", 1.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.4;
    sun.shadow.radius = 4;
    scene.add(sun, sun.target);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // Only light brighter than white (LED emission) blooms.
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.35, 1.6);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const root = new THREE.Group();
    scene.add(root);
    let models = new Map<string, Model>();
    let hits: { mesh: THREE.Object3D; part: string; action: "press" | "toggle" }[] = [];
    let fitted = false;

    const disposeTree = (o: THREE.Object3D) =>
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });

    const rebuild = (d: CircuitDoc) => {
      models.forEach((m) => m.dispose?.());
      disposeTree(root);
      root.clear();
      models = new Map();
      hits = [];
      for (const p of d.parts) {
        const m = buildModel(p);
        if (m) models.set(p.id, m);
      }
      const base = bases(d, models);
      for (const p of d.parts) {
        const m = models.get(p.id);
        if (!m) continue;
        m.group.position.set(p.x * U, base.get(p.id) ?? 0, p.y * U);
        m.group.rotation.y = (-p.rot * Math.PI) / 180;
        m.group.userData.part = p.id;
        root.add(m.group);
        for (const h of m.hits ?? []) hits.push({ ...h, part: p.id });
      }
      // Jumper wires: rise from each pin, run above the circuit through the bends, drop to the other pin.
      const pinY = (part: string) => {
        const m = models.get(part);
        if (!m) return 0;
        return m.hostTop ?? (base.get(part) ?? 0) + m.pinTop;
      };
      const pinPos = new Map(d.parts.flatMap((p) => worldPins(p).map((q) => [`${p.id}:${q.name}`, q] as const)));
      for (const w of d.wires) {
        const a = pinPos.get(`${w.a.part}:${w.a.pin}`);
        const b = pinPos.get(`${w.b.part}:${w.b.pin}`);
        if (!a || !b) continue;
        const ya = pinY(w.a.part);
        const yb = pinY(w.b.part);
        const cruise = Math.max(ya, yb) + 5 + Math.min(10, Math.hypot(a.x - b.x, a.y - b.y) * U * 0.06);
        const pts = [
          new THREE.Vector3(a.x * U, ya, a.y * U),
          new THREE.Vector3(a.x * U, ya + 3, a.y * U),
          ...(w.pts.length ? w.pts.map(([x, y]) => new THREE.Vector3(x * U, cruise, y * U)) : [new THREE.Vector3(((a.x + b.x) / 2) * U, cruise, ((a.y + b.y) / 2) * U)]),
          new THREE.Vector3(b.x * U, yb + 3, b.y * U),
          new THREE.Vector3(b.x * U, yb, b.y * U),
        ];
        const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.3);
        const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, pts.length * 16), 0.55, 10, false), new THREE.MeshStandardMaterial({ color: w.color, roughness: 0.42 }));
        cable.castShadow = true;
        root.add(cable);
        for (const [q, y] of [[a, ya], [b, yb]] as const) {
          const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 3.2, 12), new THREE.MeshStandardMaterial({ color: "#1b1b1b", roughness: 0.5 }));
          tip.position.set(q.x * U, y + 1.9, q.y * U);
          root.add(tip);
        }
      }
      // Frame the circuit (first time only, so the view stays where the user put it).
      const boxes = d.parts.map(worldBox);
      if (boxes.length) {
        const x0 = Math.min(...boxes.map((b) => b.x)) * U;
        const z0 = Math.min(...boxes.map((b) => b.y)) * U;
        const x1 = Math.max(...boxes.map((b) => b.x + b.w)) * U;
        const z1 = Math.max(...boxes.map((b) => b.y + b.h)) * U;
        const c = new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2);
        const size = Math.max(x1 - x0, z1 - z0, 60);
        sun.position.set(c.x - size * 0.6, size * 1.6, c.z + size * 0.9);
        sun.target.position.copy(c);
        const cam = sun.shadow.camera;
        cam.left = cam.bottom = -size;
        cam.right = cam.top = size;
        cam.near = 1;
        cam.far = size * 5;
        cam.updateProjectionMatrix();
        if (!fitted) {
          camera.position.set(c.x - size * 0.15, size * 1.25, c.z + size * 1.15);
          controls.target.copy(c);
          controls.update();
          fitted = true;
        }
      }
    };
    sceneRef.current = { rebuild };
    rebuild(doc);

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h);
      composer.setSize(w, h);
      bloom.resolution.set(w / 2, h / 2);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // Clicking a button or switch while the simulation runs.
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let pressed: string | null = null;
    const pick = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(hits.map((h) => h.mesh), true)[0];
      return hit ? hits.find((h) => h.mesh === hit.object || h.mesh.getObjectById(hit.object.id)) : undefined;
    };
    const down = (e: PointerEvent) => {
      if (!state.current.running) return;
      const h = pick(e);
      if (!h) return;
      controls.enabled = false;
      if (h.action === "press") {
        pressed = h.part;
        state.current.onLive(h.part, "pressed", true);
      } else state.current.onLive(h.part, "on", !(state.current.live[h.part]?.on ?? doc.parts.find((p) => p.id === h.part)?.props.on));
    };
    const up = () => {
      if (pressed) state.current.onLive(pressed, "pressed", false);
      pressed = null;
      controls.enabled = true;
    };
    renderer.domElement.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { readings: rd, live: lv, running: run } = state.current;
      models.forEach((m, id) => m.update?.(run ? rd[id] : undefined, lv[id] ?? {}, dt));
      controls.update();
      composer.render();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      models.forEach((m) => m.dispose?.());
      disposeTree(scene);
      matTex.dispose();
      env.dispose();
      pmrem.dispose();
      composer.dispose();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
    // The scene is created once; document changes rebuild its contents below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.rebuild(doc);
  }, [doc]);

  return (
    <div ref={host} className="size-full">
      {noGL && <p className="grid size-full place-items-center bg-[#0a1430] p-6 text-center text-sm text-mist" data-testid="no-webgl">3D needs WebGL, which this browser or device has turned off.</p>}
    </div>
  );
}
