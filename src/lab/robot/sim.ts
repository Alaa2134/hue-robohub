/**
 * The robot run: the Arduino program and the physics, advanced together in 2 ms steps (the motors
 * see the pins' average duty over each step; the physics integrates in 0.5 ms sub-steps). Keeps the
 * distance travelled along the line (laps), the time off the line, and a trail to draw.
 */
import { F_CPU } from "../sim/engine";
import { RobotMcu } from "./mcu";
import { DEFAULT_ROBOT, nearest, onLine, sensorAt, startState, step, type RobotParams, type RobotState, type Track } from "./physics";
import { PINS } from "./tracks";

const STEP = 0.002;
const SUB = 4;
/** Further than this from the line's centre counts as off the track (m). */
export const OFF_TRACK = 0.06;

export type RobotFrame = { t: number; state: RobotState; sensors: Record<string, boolean>; laps: number; along: number; off: boolean; offSeconds: number; leftDuty: number; rightDuty: number };

export class RobotSim {
  readonly mcu: RobotMcu;
  state: RobotState;
  t = 0;
  progress = 0;
  offSeconds = 0;
  longestOff = 0;
  private offRun = 0;
  private lastAlong: number;
  trail: { x: number; y: number }[] = [];
  last: RobotFrame;

  constructor(
    hex: string,
    readonly track: Track,
    readonly params: RobotParams = DEFAULT_ROBOT,
  ) {
    this.mcu = new RobotMcu(hex, [PINS.ena, PINS.in1, PINS.in2, PINS.enb, PINS.in3, PINS.in4]);
    this.state = startState(track.start, track.heading);
    this.lastAlong = nearest(track, track.start).along;
    this.last = this.frame({}, 0, 0, false);
  }

  private sensors(): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const s of this.params.sensors) {
      const seen = onLine(this.track, sensorAt(this.state, s));
      out[s.name] = seen;
      const pin = PINS.sensors[s.name];
      if (pin !== undefined) this.mcu.setInput(pin, seen);
    }
    return out;
  }

  private frame(sensors: Record<string, boolean>, l: number, r: number, off: boolean): RobotFrame {
    return { t: this.t, state: this.state, sensors, laps: Math.floor(Math.max(0, this.progress)), along: this.progress, off, offSeconds: this.offSeconds, leftDuty: l, rightDuty: r };
  }

  /** Advance by `seconds` of simulated time. */
  run(seconds: number): RobotFrame {
    const steps = Math.max(1, Math.round(seconds / STEP));
    let f = this.last;
    for (let i = 0; i < steps; i++) {
      const sensors = this.sensors();
      this.mcu.run(Math.round(STEP * F_CPU));
      const d = this.mcu.duties();
      const left = { en: d[PINS.ena], a: d[PINS.in1], b: d[PINS.in2] };
      const right = { en: d[PINS.enb], a: d[PINS.in3], b: d[PINS.in4] };
      for (let k = 0; k < SUB; k++) this.state = step(this.params, this.state, left, right, STEP / SUB);
      this.t += STEP;
      const near = nearest(this.track, this.state);
      let delta = near.along - this.lastAlong;
      if (delta < -0.5) delta += 1;
      if (delta > 0.5) delta -= 1;
      this.progress += delta;
      this.lastAlong = near.along;
      const off = near.d > OFF_TRACK;
      if (off) {
        this.offSeconds += STEP;
        this.offRun += STEP;
        this.longestOff = Math.max(this.longestOff, this.offRun);
      } else this.offRun = 0;
      if (i % 10 === 0) {
        this.trail.push({ x: this.state.x, y: this.state.y });
        if (this.trail.length > 3000) this.trail.splice(0, 500);
      }
      f = this.frame(sensors, left.en * (left.a - left.b), right.en * (right.a - right.b), off);
    }
    this.last = f;
    return f;
  }
}

/** The lap challenge: one full lap, never more than half a second off the line, within the time limit. */
export function lapCheck(sim: RobotSim, limit = 60, onProgress?: (sim: RobotSim) => void): { passed: boolean; lapTime: number | null; longestOff: number } {
  while (sim.t < limit && sim.progress < 1) {
    sim.run(0.1);
    onProgress?.(sim);
  }
  const done = sim.progress >= 1;
  return { passed: done && sim.longestOff <= 0.5, lapTime: done ? Math.round(sim.t * 10) / 10 : null, longestOff: Math.round(sim.longestOff * 100) / 100 };
}
