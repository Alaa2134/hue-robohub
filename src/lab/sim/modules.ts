/**
 * Simulation of modules, displays, sensors and logic chips. Each part adds circuit elements (the
 * solver handles currents and voltages) and, where it has behaviour over time, a device: a relay's
 * coil switches its contacts after its operate time, a logic gate drives its output from its inputs,
 * a DHT sensor answers the start signal bit by bit at the datasheet timings.
 */
import type { PartInstance } from "../circuit/model";
import { propsOf } from "../circuit/parts";
import { DeviceLogic, type PartReading } from "./device";
import type { Drive, Elem, Solution } from "./mna";
import { Ssd1306Logic } from "./ssd1306";

export type ModuleCtx = {
  /** Solver node of one of this part's pins. */
  n: (pin: string) => number;
  add: (tag: string, e: Elem) => number;
  probe: (name: string, read: (s: Solution) => number) => void;
  device: (d: DeviceLogic) => void;
  live: (key: string) => number | boolean | undefined;
  /** Start an output pin in this state (kept across rebuilds once a device changes it). */
  initDrive: (pin: string, d: Drive) => void;
};

/** Segment forward voltage by colour (typical 0.56" displays). */
const SEG_VF: Record<string, number> = { red: 1.9, green: 2.1, yellow: 2.0, blue: 3.0, white: 3.0 };
export const SEGMENTS = ["a", "b", "c", "d", "e", "f", "g", "dp"] as const;

/** 74HC quad/hex gates: [inputs…, output] pin numbers and the function. */
export const GATES: Record<string, { gates: number[][]; fn: (a: boolean, b: boolean) => boolean; label: string }> = {
  "74hc08": { gates: [[1, 2, 3], [4, 5, 6], [10, 9, 8], [13, 12, 11]], fn: (a, b) => a && b, label: "AND" },
  "74hc32": { gates: [[1, 2, 3], [4, 5, 6], [10, 9, 8], [13, 12, 11]], fn: (a, b) => a || b, label: "OR" },
  "74hc00": { gates: [[1, 2, 3], [4, 5, 6], [10, 9, 8], [13, 12, 11]], fn: (a, b) => !(a && b), label: "NAND" },
  "74hc86": { gates: [[1, 2, 3], [4, 5, 6], [10, 9, 8], [13, 12, 11]], fn: (a, b) => a !== b, label: "XOR" },
  "74hc04": { gates: [[1, 2], [3, 4], [5, 6], [9, 8], [11, 10], [13, 12]], fn: (a) => !a, label: "NOT" },
};

export function buildModule(p: PartInstance, c: ModuleCtx) {
  const pr = propsOf(p);
  const num = (k: string, d: number) => (Number.isFinite(Number(pr[k])) ? Number(pr[k]) : d);
  const liveNum = (k: string, d: number) => {
    const v = c.live(k) ?? pr[k];
    return Number.isFinite(Number(v)) ? Number(v) : d;
  };
  const volt = (a: number, b: number) => (s: Solution) => s.v[a] - s.v[b];

  switch (p.type) {
    case "seg7": {
      const anode = pr.common === "anode";
      const com = c.n("COM1");
      const vf = SEG_VF[String(pr.color)] ?? 1.9;
      for (const seg of SEGMENTS) {
        const x = c.n(seg);
        const i = c.add(seg, anode ? { t: "D", a: com, k: x, vf, ron: 12 } : { t: "D", a: x, k: com, vf, ron: 12 });
        c.probe(`i_${seg}`, (s) => Math.max(0, s.i[i]));
      }
      break;
    }
    case "relay": {
      const vcc = c.n("VCC");
      const g = c.n("GND");
      const inp = c.n("IN");
      const lowTrigger = pr.trigger === "low";
      // Input stage: an optocoupler LED from VCC (low-level trigger) or a transistor base resistor.
      c.add("IN", lowTrigger ? { t: "D", a: vcc, k: inp, vf: 1.2, ron: 1000 } : { t: "R", a: inp, b: g, r: 4700 });
      const on = Boolean(c.live("on"));
      // Coil (≈70 Ω for a 5 V SRD-05VDC) and the module's indicator LED, only while energised.
      const coil = c.add("COIL", { t: "R", a: vcc, b: g, r: on ? 70 : 1e9 });
      c.add("CONTACT", { t: "R", a: c.n("COM"), b: c.n(on ? "NO" : "NC"), r: 0.05 });
      c.probe("on", () => (on ? 1 : 0));
      c.probe("i_coil", (s) => Math.max(0, s.i[coil]));
      c.device(new RelayLogic(p.id, volt(vcc, g), volt(inp, g), lowTrigger, on));
      break;
    }
    case "joystick": {
      const vcc = c.n("+5V");
      const g = c.n("GND");
      for (const [axis, pin] of [["x", "VRx"], ["y", "VRy"]] as const) {
        const pos = Math.min(1, Math.max(0, liveNum(axis, 0.5)));
        const w = c.n(pin);
        c.add(`${axis}1`, { t: "R", a: vcc, b: w, r: Math.max(1, 10_000 * (1 - pos)) });
        c.add(`${axis}2`, { t: "R", a: w, b: g, r: Math.max(1, 10_000 * pos) });
        c.probe(`v_${axis}`, (s) => s.v[w] - s.v[g]);
      }
      // The stick's button pulls SW to GND when pressed (the module has no pull-up: use INPUT_PULLUP).
      c.add("SW", { t: "R", a: c.n("SW"), b: g, r: c.live("pressed") ? 0.05 : 1e10 });
      break;
    }
    case "pir": {
      const vcc = c.n("VCC");
      const g = c.n("GND");
      c.add("SUPPLY", { t: "R", a: vcc, b: g, r: 50_000 });
      c.add("OUT", { t: "X", a: c.n("OUT"), b: g, key: `${p.id}:OUT` });
      c.initDrive("OUT", { v: 0, r: 100 });
      c.probe("out", (s) => s.v[c.n("OUT")] - s.v[g]);
      c.device(new PirLogic(p.id, volt(vcc, g), () => Boolean(c.live("motion") ?? pr.motion), num("hold", 3)));
      break;
    }
    case "ir-obstacle": {
      const vcc = c.n("VCC");
      const g = c.n("GND");
      c.add("SUPPLY", { t: "R", a: vcc, b: g, r: 250 });
      // LM393 comparator output: open collector with a 10 kΩ pull-up on the module; LOW = obstacle.
      const blocked = Boolean(c.live("obstacle") ?? pr.obstacle);
      c.add("PULLUP", { t: "R", a: vcc, b: c.n("OUT"), r: 10_000 });
      c.add("OUT", { t: "R", a: c.n("OUT"), b: g, r: blocked ? 30 : 1e10 });
      c.probe("out", (s) => s.v[c.n("OUT")] - s.v[g]);
      c.probe("obstacle", () => (blocked ? 1 : 0));
      break;
    }
    case "line-sensor":
    case "soil": {
      const vcc = c.n("VCC");
      const g = c.n("GND");
      c.add("SUPPLY", { t: "R", a: vcc, b: g, r: 400 });
      // Analog output as a fraction of VCC, through the module's 1 kΩ output resistance.
      const level = p.type === "soil" ? Math.min(100, Math.max(0, liveNum("moisture", 30))) / 100 : Math.min(1, Math.max(0, liveNum("dark", 0)));
      const frac = p.type === "soil" ? 0.95 - 0.65 * level : 0.1 + 0.85 * level;
      c.add("A0", { t: "X", a: c.n("A0"), b: g, key: `${p.id}:A0` });
      c.initDrive("A0", null);
      c.device(new RatioOutput(p.id, `${p.id}:A0`, volt(vcc, g), frac, 1000));
      // Digital output: the LM393 comparator against the threshold knob, open collector with a pull-up.
      // Soil: LOW when wetter than the threshold. Line: LOW over a light surface, HIGH over a black line.
      const thr = Math.min(1, Math.max(0, num("threshold", 0.5)));
      const pullLow = p.type === "soil" ? level > thr : level <= thr;
      c.add("PULLUP", { t: "R", a: vcc, b: c.n("D0"), r: 10_000 });
      c.add("D0", { t: "R", a: c.n("D0"), b: g, r: pullLow ? 30 : 1e10 });
      c.probe("a0", (s) => s.v[c.n("A0")] - s.v[g]);
      c.probe("d0", (s) => s.v[c.n("D0")] - s.v[g]);
      break;
    }
    case "dht11":
    case "dht22": {
      const vcc = c.n("VCC");
      const g = c.n("GND");
      c.add("SUPPLY", { t: "R", a: vcc, b: g, r: 3300 });
      c.add("DATA", { t: "X", a: c.n("DATA"), b: g, key: `${p.id}:DATA` });
      c.initDrive("DATA", null);
      c.device(new DhtLogic(p.id, p.type === "dht11" ? 11 : 22, volt(c.n("DATA"), g), volt(vcc, g), () => liveNum("temp", 24), () => liveNum("humidity", 45)));
      break;
    }
    case "oled-ssd1306": {
      const vcc = c.n("VCC");
      const g = c.n("GND");
      // A typical 5 mA draw (a screen of text), and the module's 4.7 kΩ pull-ups on SDA and SCL.
      c.add("SUPPLY", { t: "R", a: vcc, b: g, r: 1000 });
      c.add("PU_SDA", { t: "R", a: c.n("SDA"), b: vcc, r: 4700 });
      c.add("PU_SCL", { t: "R", a: c.n("SCL"), b: vcc, r: 4700 });
      c.device(new Ssd1306Logic(p.id, pr.address === "0x3D" ? 0x3d : 0x3c, c.n("SDA"), c.n("SCL"), volt(vcc, g)));
      break;
    }
    default: {
      const chip = GATES[p.type];
      if (!chip) break;
      const vcc = c.n("14");
      const g = c.n("7");
      c.add("SUPPLY", { t: "R", a: vcc, b: g, r: 200_000 });
      for (const pins of chip.gates) {
        const out = String(pins[pins.length - 1]);
        c.add(`OUT${out}`, { t: "X", a: c.n(out), b: g, key: `${p.id}:${out}` });
        c.initDrive(out, null);
      }
      c.device(new GateLogic(p.id, chip, (pin) => (s: Solution) => s.v[c.n(String(pin))] - s.v[g], volt(vcc, g)));
    }
  }
}

/* ── Devices ────────────────────────────────────────────────────────── */

/** Relay module: the coil pulls in 10 ms after the input asks for it and drops out 5 ms after it stops (SRD-05VDC). */
class RelayLogic extends DeviceLogic {
  private want: boolean;
  private pending = false;
  private clicks = 0;
  constructor(
    part: string,
    private power: (s: Solution) => number,
    private input: (s: Solution) => number,
    private low: boolean,
    private on: boolean,
  ) {
    super(part);
    this.want = on;
  }
  adopt(next: DeviceLogic) {
    Object.assign(next, { pending: this.pending, clicks: this.clicks });
    return next;
  }
  onSolve(s: Solution) {
    const powered = this.power(s) > 3.5;
    const vin = this.input(s);
    const want = powered && (this.low ? this.power(s) - vin > 2.5 : vin > 2.5);
    this.want = want;
    if (want === this.on || this.pending) return;
    this.pending = true;
    this.sim.after(want ? 10e-3 : 5e-3, () => {
      this.pending = false;
      if (this.want !== this.on) {
        this.clicks++;
        this.sim.setLive(this.part, "on", this.want);
      }
    });
  }
  reading() {
    const n = this.clicks;
    this.clicks = 0;
    return { clicks: n };
  }
}

/** HC-SR501: OUT goes high (3.3 V) on motion and stays high for the hold time after it stops. */
class PirLogic extends DeviceLogic {
  private high = false;
  private gen = 0;
  constructor(
    part: string,
    private power: (s: Solution) => number,
    private motion: () => boolean,
    private hold: number,
  ) {
    super(part);
  }
  adopt(next: DeviceLogic) {
    Object.assign(next, { high: this.high, gen: this.gen });
    return next;
  }
  onSolve(s: Solution) {
    const powered = this.power(s) > 4.5;
    const m = powered && this.motion();
    if (m && !this.high) {
      this.high = true;
      this.gen++;
      this.sim.after(1e-6, () => this.sim.setDrive(`${this.part}:OUT`, { v: 3.3, r: 100 }));
    } else if (!m && this.high) {
      const g = ++this.gen;
      this.sim.after(Math.max(0.3, this.hold), () => {
        if (g !== this.gen) return;
        this.high = false;
        this.sim.setDrive(`${this.part}:OUT`, { v: 0, r: 100 });
      });
    } else if (m) this.gen++;
  }
  reading() {
    return { motion: this.motion() ? 1 : 0, out: this.high ? 1 : 0 };
  }
}

/** An analog output that follows a fraction of the module's supply. */
class RatioOutput extends DeviceLogic {
  private last = -1;
  constructor(
    part: string,
    private key: string,
    private power: (s: Solution) => number,
    private frac: number,
    private r: number,
  ) {
    super(part);
  }
  onSolve(s: Solution) {
    const v = Math.max(0, this.power(s)) * this.frac;
    if (Math.abs(v - this.last) < 1e-3) return;
    this.last = v;
    this.sim.after(1e-6, () => this.sim.setDrive(this.key, { v, r: this.r }));
  }
  reading() {
    return {};
  }
}

/** 74HC logic: each output follows its inputs (CMOS thresholds 30 % / 70 % of VCC) after ~10 ns. */
class GateLogic extends DeviceLogic {
  private out = new Map<number, boolean | null>();
  constructor(
    part: string,
    private chip: (typeof GATES)[string],
    private pin: (n: number) => (s: Solution) => number,
    private power: (s: Solution) => number,
  ) {
    super(part);
  }
  adopt(next: DeviceLogic) {
    Object.assign(next, { out: this.out });
    return next;
  }
  onSolve(s: Solution) {
    const vcc = this.power(s);
    for (const pins of this.chip.gates) {
      const o = pins[pins.length - 1];
      let level: boolean | null;
      if (vcc < 2) level = null;
      else {
        const read = (n: number) => {
          const v = this.pin(n)(s);
          return v >= 0.7 * vcc ? true : v <= 0.3 * vcc ? false : null;
        };
        const a = read(pins[0]);
        const b = pins.length > 2 ? read(pins[1]) : false;
        level = a === null || b === null ? (this.out.get(o) ?? false) : this.chip.fn(a, b);
      }
      if (this.out.get(o) === level) continue;
      this.out.set(o, level);
      const v = vcc;
      this.sim.after(10e-9, () => this.sim.setDrive(`${this.part}:${o}`, level === null ? null : { v: level ? v : 0, r: 25 }));
    }
  }
  reading() {
    const r: PartReading = {};
    for (const [o, l] of this.out) r[`o${o}`] = l === null ? -1 : l ? 1 : 0;
    return r;
  }
}

/**
 * DHT11 / DHT22 single-wire protocol. The host holds DATA low (≥ 18 ms for a DHT11, ≥ 1 ms for a
 * DHT22) then releases it; the sensor answers 20–40 µs later with 80 µs low, 80 µs high, then 40
 * bits (50 µs low, then 26–28 µs high for 0 or 70 µs for 1), most significant first, and a checksum.
 */
class DhtLogic extends DeviceLogic {
  private low = false;
  private fell = 0;
  private busy = false;
  private reads = 0;
  constructor(
    part: string,
    private model: 11 | 22,
    private data: (s: Solution) => number,
    private power: (s: Solution) => number,
    private temp: () => number,
    private hum: () => number,
  ) {
    super(part);
  }
  adopt(next: DeviceLogic) {
    Object.assign(next, { low: this.low, fell: this.fell, busy: this.busy, reads: this.reads });
    return next;
  }
  onSolve(s: Solution, t: number) {
    if (this.busy) return;
    const v = this.data(s);
    const vcc = this.power(s);
    const isLow = v < 0.3 * Math.max(3, vcc);
    if (isLow && !this.low) this.fell = t;
    if (!isLow && this.low && vcc > 3 && t - this.fell >= (this.model === 11 ? 18e-3 : 1e-3)) this.respond();
    this.low = isLow;
  }
  /** The 40 bits for the current temperature and humidity. */
  frame(): number[] {
    const T = this.temp();
    const H = Math.min(100, Math.max(0, this.hum()));
    let b: number[];
    if (this.model === 11) {
      const t = Math.min(50, Math.max(0, T));
      b = [Math.round(H), 0, Math.floor(t), Math.round((t % 1) * 10) % 10];
    } else {
      const h = Math.round(H * 10);
      const t = Math.round(Math.min(80, Math.max(-40, T)) * 10);
      const ta = Math.abs(t);
      b = [h >> 8, h & 255, ((ta >> 8) & 0x7f) | (t < 0 ? 0x80 : 0), ta & 255];
    }
    b.push((b[0] + b[1] + b[2] + b[3]) & 255);
    return b.flatMap((byte) => [7, 6, 5, 4, 3, 2, 1, 0].map((i) => (byte >> i) & 1));
  }
  private respond() {
    this.busy = true;
    this.reads++;
    const key = `${this.part}:DATA`;
    const steps: [number, Drive][] = [[30e-6, { v: 0, r: 60 }], [80e-6, null], [80e-6, { v: 0, r: 60 }]];
    for (const bit of this.frame()) steps.push([50e-6, null], [bit ? 70e-6 : 27e-6, { v: 0, r: 60 }]);
    steps.push([50e-6, null]);
    // Each step: after its delay, set the line (pulled low, or released to the pull-up).
    let i = 0;
    const next = () => {
      if (i >= steps.length) return void (this.busy = false);
      const [dt, d] = steps[i++];
      this.sim.after(dt, () => {
        this.sim.setDrive(key, d);
        next();
      });
    };
    next();
  }
  reading() {
    const n = this.reads;
    this.reads = 0;
    return { reads: n, temp: this.temp(), humidity: this.hum() };
  }
}
