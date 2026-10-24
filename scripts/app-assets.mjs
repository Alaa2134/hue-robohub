#!/usr/bin/env node
// Copies the ZXing WebAssembly barcode reader next to the BuildX App so it is served from our own
// origin (no CDN at scan time), and builds BuildX Lab's compiler pack. Runs before dev/build; the
// copies are git-ignored.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const wasm = require.resolve("zxing-wasm/reader/zxing_reader.wasm");
mkdirSync(path.join(root, "public/app"), { recursive: true });
copyFileSync(wasm, path.join(root, "public/app/zxing_reader.wasm"));
console.log("[app-assets] zxing_reader.wasm → public/app/");

// BuildX Lab's in-browser Arduino compiler (public/lab/toolchain, also git-ignored).
execFileSync(process.execPath, [path.join(root, "scripts/lab-toolchain.mjs")], { stdio: "inherit" });
// The 3D Studio's geometry kernel (public/lab/cad, also git-ignored).
execFileSync(process.execPath, [path.join(root, "scripts/lab-cad.mjs")], { stdio: "inherit" });
