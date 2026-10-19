/// <reference lib="webworker" />
/**
 * Compiler worker: downloads the WebAssembly toolchain once (kept in the browser's Cache Storage under
 * content-hashed names), then builds sketches on request. Runs off the main thread, in the page's own
 * sandbox: a sketch is compiled, never executed, here.
 */
import { buildSketch, unpackSysroot, type EmModule, type EmOptions, type Toolchain, type ToolName } from "./build";
import type { SourceFile } from "./sketch";

declare const self: DedicatedWorkerGlobalScope;

type Manifest = { version: string; includes: string[]; files: Record<string, string> };
const CACHE = "bx-lab-toolchain";

let toolchain: Promise<Toolchain> | null = null;

async function fetchBytes(url: string, onProgress: (n: number) => void): Promise<Uint8Array> {
  const cache = await caches.open(CACHE).catch(() => null);
  let res = (await cache?.match(url)) ?? null;
  if (!res) {
    const net = await fetch(url);
    if (!net.ok) throw new Error(`download_failed ${net.status}`);
    await cache?.put(url, net.clone()).catch(() => {});
    res = net;
  }
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(got);
  }
  const all = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) (all.set(c, at), (at += c.length));
  return all;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function load(base: string): Promise<Toolchain> {
  const dir = `${base}/lab/toolchain/`;
  const manifest = (await (await fetch(`${dir}toolchain.json`, { cache: "no-cache" })).json()) as Manifest;
  // Forget files from older toolchain versions.
  const cache = await caches.open(CACHE).catch(() => null);
  if (cache) for (const req of await cache.keys()) if (!Object.values(manifest.files).some((f) => req.url.endsWith(f))) await cache.delete(req);

  const names = ["sysroot", "cc1plus.wasm", "avr-as.wasm", "avr-ld.wasm", "avr-objcopy.wasm"];
  const progress = new Map<string, number>();
  const report = () => self.postMessage({ type: "progress", loaded: [...progress.values()].reduce((a, b) => a + b, 0) });
  const raw = await Promise.all(names.map((n) => fetchBytes(dir + manifest.files[n], (k) => (progress.set(n, k), report()))));
  const [sysrootGz, ...wasmGz] = raw;
  const sysroot = unpackSysroot(await gunzip(sysrootGz));
  const tools: ToolName[] = ["cc1plus", "avr-as", "avr-ld", "avr-objcopy"];
  const modules = new Map<ToolName, WebAssembly.Module>();
  const factories = new Map<ToolName, (o: object) => Promise<EmModule>>();
  await Promise.all(
    tools.map(async (t, i) => {
      modules.set(t, await WebAssembly.compile((await gunzip(wasmGz[i])) as BufferSource));
      const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${dir}${manifest.files[`${t}.mjs`]}`);
      factories.set(t, mod.default);
    }),
  );
  return {
    sysroot,
    includes: manifest.includes,
    instantiate(tool: ToolName, opts: EmOptions) {
      const wasm = modules.get(tool)!;
      return factories.get(tool)!({
        ...opts,
        instantiateWasm(imports: WebAssembly.Imports, done: (i: WebAssembly.Instance, m: WebAssembly.Module) => void) {
          WebAssembly.instantiate(wasm, imports).then((inst) => done(inst, wasm));
          return {};
        },
      });
    },
  };
}

self.onmessage = async (e: MessageEvent<{ type: "build"; id: number; base: string; files: SourceFile[]; main: string }>) => {
  const { id, base, files, main } = e.data;
  try {
    toolchain ??= load(base).catch((err) => {
      toolchain = null;
      throw err;
    });
    const tc = await toolchain;
    self.postMessage({ type: "ready" });
    const result = await buildSketch(tc, files, main);
    self.postMessage({ type: "result", id, result });
  } catch (err) {
    self.postMessage({ type: "error", id, message: String((err as Error)?.message ?? err) });
  }
};
