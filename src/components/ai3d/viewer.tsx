"use client";
/**
 * Looks at a finished model: loads the GLB, centres it on a turntable, orbit and zoom with the mouse
 * or fingers. The same model can be saved as STL (3D printing) or OBJ, made here in the browser.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type Loaded = { scene: THREE.Object3D };

export function ModelViewer({ url, onLoaded, className }: { url: string; onLoaded?: (m: Loaded) => void; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const loaded = useRef(onLoaded);
  loaded.current = onLoaded;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    pm.dispose();
    scene.add(new THREE.HemisphereLight("#cfe8ff", "#0b1838", 0.6));
    const sun = new THREE.DirectionalLight("#ffffff", 1.4);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    camera.position.set(0, 0.6, 3.6);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.autoRotateSpeed = 1.2;
    controls.minDistance = 1;
    controls.maxDistance = 10;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.25, 64), new THREE.MeshStandardMaterial({ color: "#0b1838", metalness: 0.5, roughness: 0.6 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -1.002;
    scene.add(disc);

    const size = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);

    let model: THREE.Object3D | null = null;
    let stop = false;
    new GLTFLoader().load(
      url,
      (g) => {
        if (stop) return;
        model = g.scene;
        const b = new THREE.Box3().setFromObject(model);
        const s = 2 / Math.max(...b.getSize(new THREE.Vector3()).toArray(), 0.001);
        model.scale.setScalar(s);
        const b2 = new THREE.Box3().setFromObject(model);
        const c = b2.getCenter(new THREE.Vector3());
        model.position.sub(new THREE.Vector3(c.x, b2.min.y + 1, c.z));
        scene.add(model);
        setState("ready");
        loaded.current?.({ scene: model });
      },
      undefined,
      () => !stop && setState("error"),
    );

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      env.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [url]);

  return (
    <div ref={box} className={className ?? "relative h-full w-full"} data-testid="ai3d-viewer" data-state={state}>
      {state !== "ready" && (
        <div className="absolute inset-0 grid place-items-center text-sm text-fog">
          {state === "loading" ? <span className="size-8 animate-spin rounded-full border-2 border-cyan/30 border-t-cyan" /> : "⚠"}
        </div>
      )}
    </div>
  );
}

function save(data: BlobPart, name: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** STL (binary) for printing — in millimetres, about 100 mm tall. */
export function saveStl(model: THREE.Object3D, name: string) {
  const copy = model.clone(true);
  copy.scale.multiplyScalar(50);
  copy.updateMatrixWorld(true);
  const data = new STLExporter().parse(copy, { binary: true }) as DataView;
  save(data.buffer as ArrayBuffer, `${name}.stl`, "model/stl");
}

export function saveObj(model: THREE.Object3D, name: string) {
  save(new OBJExporter().parse(model), `${name}.obj`, "text/plain");
}
