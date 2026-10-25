/// <reference lib="webworker" />
/** Runs a challenge's check off the main thread: seconds of simulated time can take a while. */
import type { CircuitDoc } from "../circuit/model";
import { challengeBySlug, runChallenge } from "./challenges";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<{ id: number; slug: string; doc: CircuitDoc; hex: string }>) => {
  const { id, slug, doc, hex } = e.data;
  const ch = challengeBySlug(slug);
  if (!ch) return self.postMessage({ id, error: "unknown_challenge" });
  self.postMessage({ id, outcome: runChallenge(ch, doc, hex) });
};
