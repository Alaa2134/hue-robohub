/// <reference lib="webworker" />
/**
 * Runs the robot off the main thread: live (in step with the clock, at the chosen speed) or the lap
 * test (as fast as the device can, reporting progress), and posts what the page draws.
 */
import { DEFAULT_ROBOT, type RobotParams } from "./physics";
import { lapCheck, RobotSim } from "./sim";
import { trackById } from "./tracks";

export type RobotIn =
  | { type: "start"; hex: string; track: string; params?: Partial<RobotParams> }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "speed"; value: number }
  | { type: "stop" }
  | { type: "lap"; hex: string; track: string; params?: Partial<RobotParams>; limit: number };

export type LiveFrame = {
  t: number;
  x: number;
  y: number;
  heading: number;
  v: number;
  sensors: Record<string, boolean>;
  laps: number;
  progress: number;
  off: boolean;
  offSeconds: number;
  longestOff: number;
  left: number;
  right: number;
};
export type RobotOut =
  | { type: "frame"; frame: LiveFrame; serial?: string }
  | { type: "lapProgress"; t: number; progress: number }
  | { type: "lapResult"; passed: boolean; lapTime: number | null; longestOff: number; t: number; progress: number; trail: { x: number; y: number }[] }
  | { type: "error"; message: string };

declare const self: DedicatedWorkerGlobalScope;

let sim: RobotSim | null = null;
let running = false;
let speed = 1;
let last = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let serial = "";

const post = (m: RobotOut) => self.postMessage(m);

function frameOf(s: RobotSim): LiveFrame {
  const f = s.last;
  return { t: s.t, x: s.state.x, y: s.state.y, heading: s.state.heading, v: s.state.v, sensors: f.sensors, laps: f.laps, progress: s.progress, off: f.off, offSeconds: s.offSeconds, longestOff: s.longestOff, left: f.leftDuty, right: f.rightDuty };
}

function tick() {
  timer = undefined;
  if (!sim || !running) return;
  const now = performance.now();
  // At most 50 ms of real time per tick: a slow device runs the robot slower rather than skipping.
  const dt = Math.min(0.05, (now - last) / 1000) * speed;
  last = now;
  if (dt > 0) sim.run(dt);
  const out: RobotOut = { type: "frame", frame: frameOf(sim) };
  if (sim.mcu.serial !== serial) out.serial = serial = sim.mcu.serial;
  post(out);
  timer = setTimeout(tick, 16);
}

self.onmessage = (e: MessageEvent<RobotIn>) => {
  const m = e.data;
  try {
    if (m.type === "start") {
      sim = new RobotSim(m.hex, trackById(m.track), { ...DEFAULT_ROBOT, ...m.params });
      serial = "";
      running = true;
      last = performance.now();
      if (!timer) tick();
    } else if (m.type === "pause") running = false;
    else if (m.type === "resume" && sim) {
      running = true;
      last = performance.now();
      if (!timer) tick();
    } else if (m.type === "speed") speed = m.value;
    else if (m.type === "stop") {
      running = false;
      sim = null;
    } else if (m.type === "lap") {
      running = false;
      const s = new RobotSim(m.hex, trackById(m.track), { ...DEFAULT_ROBOT, ...m.params });
      let shown = 0;
      const r = lapCheck(s, m.limit, (x) => {
        if (x.t - shown >= 1) {
          shown = x.t;
          post({ type: "lapProgress", t: x.t, progress: x.progress });
        }
      });
      post({ type: "lapResult", ...r, t: s.t, progress: s.progress, trail: s.trail });
    }
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
