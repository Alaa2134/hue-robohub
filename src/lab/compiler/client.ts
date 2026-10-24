"use client";
/** Main-thread side of the compiler worker. */
import type { BuildResult } from "./build";
import type { SourceFile } from "./sketch";
import { BASE } from "../router";

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: BuildResult) => void; reject: (e: Error) => void }>();
const listeners = new Set<(e: { type: "progress"; loaded: number } | { type: "ready" }) => void>();

function get() {
  if (worker) return worker;
  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data;
    if (m.type === "progress" || m.type === "ready") listeners.forEach((l) => l(m));
    else if (m.type === "result") pending.get(m.id)?.resolve(m.result), pending.delete(m.id);
    else if (m.type === "error") pending.get(m.id)?.reject(new Error(m.message)), pending.delete(m.id);
  };
  worker.onerror = (e) => {
    pending.forEach((p) => p.reject(new Error(e.message || "compiler_crashed")));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function compile(files: SourceFile[], main: string): Promise<BuildResult> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    get().postMessage({ type: "build", id, base: location.origin + BASE, files, main });
  });
}

export function onCompilerEvent(fn: Parameters<typeof listeners.add>[0]) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
