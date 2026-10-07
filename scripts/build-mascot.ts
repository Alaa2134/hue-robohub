/**
 * Builds public/mascot/buildx-mascot.glb from src/lib/mascot (model + animation clips):
 *
 *   npx tsx scripts/build-mascot.ts
 *
 * The file is then deduplicated, its animations resampled (keyframes that add nothing removed) and
 * its normals, UVs and colours quantized. Positions stay float: quantizing them adds node scales,
 * which would stretch the fur shells. None of this needs a decoder at runtime (unlike Draco or
 * Meshopt, whose WebAssembly the site's Content-Security-Policy doesn't allow).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, quantize, resample, weld } from "@gltf-transform/functions";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { buildClips } from "../src/lib/mascot/clips";
import { buildMascot } from "../src/lib/mascot/model";

// GLTFExporter reads Blobs with FileReader, which Node doesn't have.
if (typeof (globalThis as { FileReader?: unknown }).FileReader === "undefined") {
  (globalThis as { FileReader?: unknown }).FileReader = class {
    result: ArrayBuffer | string | null = null;
    onload: (() => void) | null = null;
    onloadend: (() => void) | null = null;
    readAsArrayBuffer(blob: Blob) {
      blob.arrayBuffer().then((b) => {
        this.result = b;
        this.onload?.();
        this.onloadend?.();
      });
    }
    readAsDataURL(blob: Blob) {
      blob.arrayBuffer().then((b) => {
        this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(b).toString("base64")}`;
        this.onload?.();
        this.onloadend?.();
      });
    }
  };
}

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public/mascot/buildx-mascot.glb");

const scene = new THREE.Scene();
scene.add(buildMascot());
const clips = buildClips();

const raw = await new Promise<ArrayBuffer>((resolve, reject) =>
  new GLTFExporter().parse(scene, (r) => resolve(r as ArrayBuffer), reject, { binary: true, animations: clips, onlyVisible: false }),
);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc: Document = await io.readBinary(new Uint8Array(raw));
await doc.transform(dedup(), weld(), resample({ tolerance: 1e-4 }), prune({ keepAttributes: true }), quantize({ pattern: /^(NORMAL|TEXCOORD|COLOR)/, quantizeNormal: 10 }));
const glb = await io.writeBinary(doc);

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, glb);
const anims = doc.getRoot().listAnimations().map((a) => a.getName());
console.log(`[mascot] ${path.relative(root, out)}: ${(glb.byteLength / 1024).toFixed(0)} KB (raw ${(raw.byteLength / 1024).toFixed(0)} KB), ${anims.length} clips: ${anims.join(", ")}`);
