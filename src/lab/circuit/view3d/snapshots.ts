/**
 * Pictures of every part rendered from its 3D model (for the parts library and the components page).
 * Rendered once per session with one offscreen renderer; null where WebGL isn't available.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { PARTS, PART_BY_TYPE } from "../parts";
import { U, buildModel } from "./models";

let done: Promise<Map<string, string> | null> | null = null;

export function partSnapshots(size = 160): Promise<Map<string, string> | null> {
  done ??= new Promise((resolve) => {
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch {
      return resolve(null);
    }
    renderer.setSize(size, size);
    renderer.setPixelRatio(2);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.7;
    scene.add(new THREE.HemisphereLight("#ffffff", "#334", 0.6));
    const sun = new THREE.DirectionalLight("#ffffff", 1.6);
    sun.position.set(-1, 2, 1.4);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 5000);
    const out = new Map<string, string>();
    const types = PARTS.map((p) => p.type);
    let i = 0;
    // One part per frame keeps the page responsive while the pictures are made.
    const next = () => {
      if (i >= types.length) {
        pmrem.dispose();
        renderer.dispose();
        return resolve(out);
      }
      const type = types[i++];
      const def = PART_BY_TYPE.get(type)!;
      const m = buildModel({ id: type, type, x: 0, y: 0, rot: 0, props: { ...def.defaults } });
      if (m) {
        m.update?.(undefined, {}, 0);
        scene.add(m.group);
        const box = new THREE.Box3().setFromObject(m.group);
        const c = box.getCenter(new THREE.Vector3());
        const r = box.getSize(new THREE.Vector3()).length() / 2 || 10 * U;
        const dir = new THREE.Vector3(0.55, 0.75, 0.9).normalize();
        camera.position.copy(c).addScaledVector(dir, r / Math.sin((camera.fov * Math.PI) / 360) * 0.92);
        camera.lookAt(c);
        camera.near = r / 20;
        camera.far = r * 20;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        out.set(type, renderer.domElement.toDataURL("image/png"));
        scene.remove(m.group);
        m.dispose?.();
      }
      requestAnimationFrame(next);
    };
    next();
  });
  return done;
}
