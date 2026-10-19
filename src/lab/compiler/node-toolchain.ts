/** The compiler toolchain in Node (unit tests), read from public/lab/toolchain (scripts/lab-toolchain.mjs). */
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { unpackSysroot, type EmModule, type Toolchain, type ToolName } from "./build";

export async function nodeToolchain(root = process.cwd()): Promise<Toolchain> {
  const dir = path.join(root, "public/lab/toolchain");
  const manifest = JSON.parse(readFileSync(path.join(dir, "toolchain.json"), "utf8")) as { includes: string[]; files: Record<string, string> };
  const sysroot = unpackSysroot(new Uint8Array(gunzipSync(readFileSync(path.join(dir, manifest.files.sysroot)))));
  const wasm = new Map<ToolName, Uint8Array>();
  const factories = new Map<ToolName, (o: object) => Promise<EmModule>>();
  return {
    sysroot,
    includes: manifest.includes,
    async instantiate(tool, opts) {
      if (!factories.has(tool)) {
        factories.set(tool, (await import(pathToFileURL(path.join(dir, manifest.files[`${tool}.mjs`])).href)).default);
        wasm.set(tool, new Uint8Array(gunzipSync(readFileSync(path.join(dir, manifest.files[`${tool}.wasm`])))));
      }
      return factories.get(tool)!({ ...opts, wasmBinary: wasm.get(tool) });
    },
  };
}
