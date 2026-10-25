"use client";
/** Compile the learner's sketch and run the challenge's check on it (both off the main thread). */
import type { CircuitDoc } from "../circuit/model";
import { compile } from "../compiler/client";
import type { Diagnostic } from "../compiler/sketch";
import type { Outcome } from "./challenges";

let worker: Worker | null = null;
let seq = 0;

function run(slug: string, doc: CircuitDoc, hex: string): Promise<Outcome> {
  worker ??= new Worker(new URL("./check-worker.ts", import.meta.url), { type: "module" });
  const w = worker;
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      w.terminate();
      if (worker === w) worker = null;
      reject(new Error("timeout"));
    }, 90_000);
    const on = (e: MessageEvent<{ id: number; outcome?: Outcome; error?: string }>) => {
      if (e.data.id !== id) return;
      clearTimeout(timer);
      w.removeEventListener("message", on);
      if (e.data.outcome) resolve(e.data.outcome);
      else reject(new Error(e.data.error ?? "check_failed"));
    };
    w.addEventListener("message", on);
    w.postMessage({ id, slug, doc, hex });
  });
}

export type CheckRun = { compiled: false; errors: Diagnostic[] } | { compiled: true; outcome: Outcome };

export async function checkChallenge(slug: string, doc: CircuitDoc): Promise<CheckRun> {
  const build = await compile(doc.files, doc.main);
  if (!build.ok || !build.hex) return { compiled: false, errors: build.diagnostics.filter((d) => d.severity === "error") };
  return { compiled: true, outcome: await run(slug, doc, build.hex) };
}
