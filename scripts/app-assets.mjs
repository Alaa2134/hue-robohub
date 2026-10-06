#!/usr/bin/env node
// Copies the ZXing WebAssembly barcode reader next to the BuildX App so it is served from our own
// origin (no CDN at scan time). Runs before dev/build; the copy is git-ignored.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const wasm = require.resolve("zxing-wasm/reader/zxing_reader.wasm");
mkdirSync(path.join(root, "public/app"), { recursive: true });
copyFileSync(wasm, path.join(root, "public/app/zxing_reader.wasm"));
console.log("[app-assets] zxing_reader.wasm → public/app/");
