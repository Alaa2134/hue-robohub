/// <reference lib="webworker" />
/**
 * Simulation worker: runs the ATmega328P and the circuit in real time (or as close as the device
 * manages, reported as "speed"), and sends the averaged readings about 30 times a second.
 */
import type { CircuitDoc } from "../circuit/model";
import { F_CPU, Simulation } from "./engine";

declare const self: DedicatedWorkerGlobalScope;

type In =
  | { type: "start"; doc: CircuitDoc; hex: string | null }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "stop" }
  | { type: "live"; part: string; key: string; value: number | boolean }
  | { type: "serial"; text: string }
  | { type: "speed"; value: number }
  | { type: "trace"; on: boolean };

let sim: Simulation | null = null;
let running = false;
let last = 0;
let lastFrame = 0;
let realSinceFrame = 0;
/** Simulated seconds per real second asked for (the device may not keep up; "speed" reports what it did). */
let rate = 1;
let tracing = false;
const channel = new MessageChannel();

function tick() {
  if (!sim || !running) return;
  const now = performance.now();
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  realSinceFrame += real;
  const budgetEnd = now + 12;
  let todo = Math.round(real * rate * F_CPU);
  try {
    while (todo > 0 && performance.now() < budgetEnd) {
      const step = Math.min(todo, 16000);
      sim.run(step);
      todo -= step;
    }
    if (now - lastFrame >= 33) {
      self.postMessage({ type: "frame", frame: sim.frame(realSinceFrame) });
      lastFrame = now;
      realSinceFrame = 0;
    }
  } catch (e) {
    running = false;
    self.postMessage({ type: "crash", message: String((e as Error)?.message ?? e) });
    return;
  }
  channel.port2.postMessage(0);
}
channel.port1.onmessage = tick;

self.onmessage = (e: MessageEvent<In>) => {
  const m = e.data;
  switch (m.type) {
    case "start":
      try {
        sim = new Simulation(m.doc, m.hex);
      } catch (err) {
        self.postMessage({ type: "crash", message: String((err as Error)?.message ?? err) });
        return;
      }
      sim.setTracing(tracing);
      running = true;
      last = lastFrame = performance.now();
      realSinceFrame = 0;
      self.postMessage({ type: "frame", frame: sim.frame(0) });
      tick();
      break;
    case "pause":
      running = false;
      if (sim) self.postMessage({ type: "frame", frame: sim.frame(realSinceFrame) });
      break;
    case "resume":
      if (!sim || running) break;
      running = true;
      last = performance.now();
      tick();
      break;
    case "stop":
      running = false;
      sim = null;
      break;
    case "live":
      sim?.setLive(m.part, m.key, m.value);
      break;
    case "serial":
      sim?.serialWrite(m.text);
      break;
    case "speed":
      rate = Math.min(8, Math.max(0.01, m.value));
      break;
    case "trace":
      tracing = m.on;
      sim?.setTracing(m.on);
      break;
  }
};
