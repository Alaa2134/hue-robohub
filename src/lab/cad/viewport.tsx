"use client";
/**
 * The 3D Studio viewport: the printer's bed and build volume, the design's solids (built by the
 * kernel), a move/rotate/scale gizmo with snapping, click / shift-click selection and lay-flat picking.
 * Z is up and one unit is one millimetre. Frames are drawn only when something changes.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { fromMatrix, matrixOf, solidOf, toGeometry, type Kernel } from "./geometry";
import { cadSettings, printerOf, unpackMesh, type CadDoc, type CadObject } from "./model";
import type { CadStore } from "./store";

export type ViewName = "iso" | "top" | "front" | "right" | "bottom";
export type ViewportApi = {
  view: (v: ViewName) => void;
  fit: () => void;
  /** World-space bounding box of each top-level object (mm). */
  boxes: () => Map<string, THREE.Box3>;
  /** Bounding box an object would have with different transforms (for lay flat). */
  boxOf: (o: CadObject) => THREE.Box3 | null;
  snapshot: () => string | undefined;
};
export type Mode = "translate" | "rotate" | "scale";

type Entry = { key: string; geom: THREE.BufferGeometry; ok: boolean };
/** What changes an object's own shape (not where it is). */
const shapeKey = (o: CadObject): string => JSON.stringify([o.kind, o.params, o.op, o.mesh ? `${o.id}:${o.mesh.v.length}` : 0, o.children?.map((c) => [shapeKey(c), c.position, c.rotation, c.scale, c.hole, c.hidden])]);

export const Viewport = forwardRef<ViewportApi, { store: CadStore; doc: CadDoc; selection: string[]; kernel: Kernel; mode: Mode; layFlat: boolean; onLaidFlat: () => void; readOnly: boolean; onFailed: (ids: string[]) => void }>(function Viewport(
  { store, doc, selection, kernel, mode, layFlat, onLaidFlat, readOnly, onFailed },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{
    sync: (doc: CadDoc, sel: string[]) => void;
    setMode: (m: Mode, snapMm: number, snapDeg: number) => void;
    view: (v: ViewName) => void;
    fit: () => void;
    boxes: () => Map<string, THREE.Box3>;
    boxOf: (o: CadObject) => THREE.Box3 | null;
    snapshot: () => string | undefined;
  } | null>(null);
  const state = useRef({ layFlat, onLaidFlat, readOnly, onFailed });
  state.current = { layFlat, onLaidFlat, readOnly, onFailed };

  useImperativeHandle(ref, () => ({
    view: (v) => api.current?.view(v),
    fit: () => api.current?.fit(),
    boxes: () => api.current?.boxes() ?? new Map(),
    boxOf: (o) => api.current?.boxOf(o) ?? null,
    snapshot: () => api.current?.snapshot(),
  }));

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      el.innerHTML = '<p class="grid size-full place-items-center p-6 text-center text-sm text-mist" data-testid="no-webgl">3D needs WebGL, which this browser or device has turned off.</p>';
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("data-testid", "cad-canvas");
    renderer.domElement.style.touchAction = "none";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0a1430");
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.6;
    scene.add(new THREE.HemisphereLight("#eaf2ff", "#24304d", 0.6));
    const sun = new THREE.DirectionalLight("#ffffff", 1.6);
    sun.position.set(-200, -300, 500);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(40, 1, 1, 20000);
    camera.up.set(0, 0, 1);
    camera.position.set(260, -420, 320);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.target.set(0, 0, 20);
    controls.update();

    // Bed and build volume, rebuilt when the printer changes.
    const bed = new THREE.Group();
    scene.add(bed);
    let bedKey = "";
    let volume: THREE.LineSegments | null = null;
    const buildBed = (d: CadDoc) => {
      const p = printerOf(d);
      const key = p.bed.join("x");
      if (key === bedKey) return;
      bedKey = key;
      bed.traverse((o) => ((o as THREE.Mesh).geometry?.dispose(), ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose?.()));
      bed.clear();
      const [w, dd, h] = p.bed;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(w, dd), new THREE.MeshStandardMaterial({ color: "#1a2747", roughness: 0.9, metalness: 0.1 }));
      plate.position.z = -0.05;
      plate.name = "plate";
      bed.add(plate);
      const lines: number[] = [];
      for (let x = -w / 2; x <= w / 2 + 1e-6; x += 10) lines.push(x, -dd / 2, 0, x, dd / 2, 0);
      for (let y = -dd / 2; y <= dd / 2 + 1e-6; y += 10) lines.push(-w / 2, y, 0, w / 2, y, 0);
      const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(lines, 3)), new THREE.LineBasicMaterial({ color: "#2f4170", transparent: true, opacity: 0.7 }));
      grid.position.z = 0.02;
      bed.add(grid);
      const axes: [number[], string][] = [
        [[-w / 2, -dd / 2, 0.05, -w / 2 + 40, -dd / 2, 0.05], "#ff5a5f"],
        [[-w / 2, -dd / 2, 0.05, -w / 2, -dd / 2 + 40, 0.05], "#3cff9a"],
        [[-w / 2, -dd / 2, 0, -w / 2, -dd / 2, 40], "#3c9bff"],
      ];
      for (const [pts, c] of axes) bed.add(new THREE.Line(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)), new THREE.LineBasicMaterial({ color: c })));
      volume = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, dd, h)), new THREE.LineBasicMaterial({ color: "#3d5a99", transparent: true, opacity: 0.5 }));
      volume.position.z = h / 2;
      bed.add(volume);
    };

    const root = new THREE.Group();
    scene.add(root);
    const meshes = new Map<string, THREE.Mesh>();
    const cache = new Map<string, Entry>();
    const failed = new Set<string>();

    const gizmo = new TransformControls(camera, renderer.domElement);
    gizmo.setSize(0.8);
    const gizmoHelper = gizmo.getHelper();
    scene.add(gizmoHelper);
    let dragging = false;
    gizmo.addEventListener("dragging-changed", (e) => {
      dragging = !!e.value;
      controls.enabled = !dragging;
      if (!dragging) store.endDrag();
    });
    gizmo.addEventListener("objectChange", () => {
      const o = gizmo.object;
      if (!o) return;
      o.updateMatrix();
      store.set(o.name, fromMatrix(o.matrix), `drag:${o.name}`);
    });
    gizmo.addEventListener("change", () => (dirty = true));

    const material = (o: CadObject, selected: boolean) =>
      o.hole
        ? new THREE.MeshStandardMaterial({ color: "#ff5a5f", transparent: true, opacity: selected ? 0.45 : 0.3, depthWrite: false, roughness: 0.6 })
        : new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.55, metalness: 0.05, emissive: selected ? new THREE.Color("#1d4ed8") : new THREE.Color(0), emissiveIntensity: selected ? 0.35 : 0 });

    const geometryOf = (o: CadObject): Entry => {
      const key = shapeKey(o);
      const hit = cache.get(key);
      if (hit) return hit;
      let geom: THREE.BufferGeometry | null = null;
      let ok = true;
      try {
        const m = solidOf(kernel, o);
        if (m) {
          geom = toGeometry(m);
          m.delete();
        }
      } catch {
        geom = null;
      }
      if (!geom && o.kind === "mesh" && o.mesh) {
        // Not watertight: show the triangles as imported, flagged.
        const { v, i } = unpackMesh(o.mesh);
        geom = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(v, 3));
        geom.setIndex(new THREE.BufferAttribute(i, 1));
        geom.computeVertexNormals();
        ok = false;
      }
      if (!geom) {
        geom = new THREE.BufferGeometry();
        ok = false;
      }
      const e = { key, geom, ok };
      cache.set(key, e);
      return e;
    };

    let dirty = true;
    let lastDoc: CadDoc | null = null;
    const sync = (d: CadDoc, sel: string[]) => {
      lastDoc = d;
      buildBed(d);
      const used = new Set<string>();
      const live = new Set<string>();
      failed.clear();
      for (const o of d.objects) {
        live.add(o.id);
        const e = geometryOf(o);
        used.add(e.key);
        if (!e.ok && !o.hidden) failed.add(o.id);
        let mesh = meshes.get(o.id);
        if (!mesh) {
          mesh = new THREE.Mesh();
          mesh.name = o.id;
          mesh.matrixAutoUpdate = true;
          root.add(mesh);
          meshes.set(o.id, mesh);
        }
        if (mesh.geometry !== e.geom) mesh.geometry = e.geom;
        (mesh.material as THREE.Material | undefined)?.dispose?.();
        mesh.material = material(o, sel.includes(o.id));
        mesh.visible = !o.hidden;
        mesh.renderOrder = o.hole ? 1 : 0;
        // Don't fight the gizmo while it's dragging this object.
        if (!(dragging && gizmo.object === mesh)) {
          const m = matrixOf(o);
          m.decompose(mesh.position, mesh.quaternion, mesh.scale);
          mesh.rotation.order = "ZYX";
        }
        // Selection outline.
        mesh.children.forEach((c) => ((c as THREE.LineSegments).geometry.dispose(), ((c as THREE.LineSegments).material as THREE.Material).dispose()));
        mesh.clear();
        if (sel.includes(o.id) && e.geom.getAttribute("position")) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(e.geom, 25), new THREE.LineBasicMaterial({ color: "#7dd3fc" })));
      }
      for (const [id, mesh] of meshes)
        if (!live.has(id)) {
          (mesh.material as THREE.Material).dispose();
          root.remove(mesh);
          meshes.delete(id);
        }
      for (const [k, e] of cache)
        if (!used.has(k)) {
          e.geom.dispose();
          cache.delete(k);
        }
      // The gizmo follows a single selected, unlocked object.
      const one = sel.length === 1 ? d.objects.find((o) => o.id === sel[0]) : undefined;
      const target = one && !one.locked && !state.current.readOnly ? meshes.get(one.id) : undefined;
      if (target && gizmo.object !== target) gizmo.attach(target);
      else if (!target && gizmo.object) gizmo.detach();
      // Out of the build volume: the outline turns red.
      if (volume) {
        const p = printerOf(d);
        const out = [...boxesNow().entries()].some(([id, b]) => {
          const o = d.objects.find((x) => x.id === id);
          return o && !o.hole && !o.hidden && (b.min.x < -p.bed[0] / 2 - 1e-3 || b.max.x > p.bed[0] / 2 + 1e-3 || b.min.y < -p.bed[1] / 2 - 1e-3 || b.max.y > p.bed[1] / 2 + 1e-3 || b.min.z < -1e-3 || b.max.z > p.bed[2] + 1e-3);
        });
        (volume.material as THREE.LineBasicMaterial).color.set(out ? "#ff5a5f" : "#3d5a99");
      }
      state.current.onFailed([...failed]);
      dirty = true;
    };

    const boxesNow = () => {
      const out = new Map<string, THREE.Box3>();
      for (const [id, mesh] of meshes) {
        if (!mesh.geometry.getAttribute("position")) continue;
        mesh.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromBufferAttribute(mesh.geometry.getAttribute("position") as THREE.BufferAttribute);
        // Exact world box: transform the mesh's vertices, not just its local box corners.
        const exact = new THREE.Box3();
        const pos = mesh.geometry.getAttribute("position");
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) exact.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
        out.set(id, pos.count ? exact : b.applyMatrix4(mesh.matrixWorld));
      }
      return out;
    };
    const boxOf = (o: CadObject) => {
      const e = geometryOf(o);
      const pos = e.geom.getAttribute("position");
      if (!pos) return null;
      const m = matrixOf(o);
      const b = new THREE.Box3();
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) b.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(m));
      return b;
    };

    const setView = (v: ViewName) => {
      const b = new THREE.Box3();
      for (const m of meshes.values()) if (m.visible && m.geometry.getAttribute("position")) b.expandByObject(m);
      const c = b.isEmpty() ? new THREE.Vector3(0, 0, 20) : b.getCenter(new THREE.Vector3());
      const size = b.isEmpty() ? 120 : Math.max(40, b.getSize(new THREE.Vector3()).length());
      const dist = size * 1.6;
      const dir = { iso: [0.55, -0.85, 0.65], top: [0, -0.0001, 1], bottom: [0, 0.0001, -1], front: [0, -1, 0.0001], right: [1, 0, 0.0001] }[v];
      camera.position.copy(c).add(new THREE.Vector3(...dir).normalize().multiplyScalar(dist));
      controls.target.copy(c);
      controls.update();
      dirty = true;
    };

    // Picking: a click (not a drag) selects; with lay flat on, a click picks the face to put down.
    const ray = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || dragging) return;
      down = null;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects([...meshes.values()].filter((m) => m.visible), false)[0];
      const id = hit?.object.name;
      if (state.current.layFlat && hit?.face && id && lastDoc) {
        const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        store.layFlat(id, n, boxOf);
        state.current.onLaidFlat();
        return;
      }
      if (!id) store.select([]);
      else if (e.shiftKey || e.ctrlKey || e.metaKey) store.select(store.selection.includes(id) ? store.selection.filter((x) => x !== id) : [...store.selection, id]);
      else store.select([id]);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    controls.addEventListener("change", () => (dirty = true));

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      dirty = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const moved = controls.update();
      if (!moved && !dirty) return;
      dirty = false;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    api.current = {
      sync,
      setMode: (m, snapMm, snapDeg) => {
        gizmo.setMode(m);
        gizmo.setTranslationSnap(snapMm > 0 ? snapMm : null);
        gizmo.setRotationSnap(snapDeg > 0 ? (snapDeg * Math.PI) / 180 : null);
        gizmo.setScaleSnap(0.05);
        dirty = true;
      },
      view: setView,
      fit: () => setView("iso"),
      boxes: boxesNow,
      boxOf,
      snapshot: () => {
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL("image/jpeg", 0.7);
      },
    };
    setView("iso");

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      gizmo.detach();
      gizmo.dispose();
      controls.dispose();
      for (const e of cache.values()) e.geom.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      api.current = null;
    };
    // The scene is created once; the document is synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kernel]);

  useEffect(() => {
    api.current?.sync(doc, selection);
  }, [doc, selection]);

  const s = cadSettings(doc);
  useEffect(() => {
    api.current?.setMode(mode, s.snap, s.angleSnap);
  }, [mode, s.snap, s.angleSnap]);

  return <div ref={host} className={layFlat ? "size-full cursor-crosshair" : "size-full"} />;
});
