/**
 * The simulation: an ATmega328P (avr8js) running the compiled program, wired to the DC circuit solver.
 * Every time the program changes a pin (or a sensor changes an output), the circuit is solved again
 * at that exact CPU cycle; the board's inputs and ADC then read the solved voltages. What the UI shows
 * (LED brightness, meter readings, motor speed) is each quantity averaged over the time it held, so
 * PWM dims an LED by its real duty cycle. Nothing is estimated: if the model doesn't cover a part, the
 * part says so and contributes nothing.
 */
import { AVRADC, AVRIOPort, AVRTimer, AVRUSART, CPU, PinState, adcConfig, avrInstruction, portBConfig, portCConfig, portDConfig, timer0Config, timer1Config, timer2Config, usart0Config } from "avr8js";
import type { CircuitDoc, PartInstance } from "../circuit/model";
import { buildNetlist, key, type Netlist } from "../circuit/netlist";
import { ADC_ONLY, AVR_PINS, LED_COLORS, PART_BY_TYPE, propsOf } from "../circuit/parts";
import { checkCircuit, type SimDiagnostic } from "./diagnostics";
import { Circuit, type Drive, type Elem, type Solution } from "./mna";

export const F_CPU = 16_000_000;

export type { SimDiagnostic };
export type PartReading = Record<string, number>;
export type Frame = {
  /** Simulated seconds since start. */
  t: number;
  /** Simulated time / real time over the last frame (1 = real time). */
  speed: number;
  parts: Record<string, PartReading>;
  serial: string;
  diagnostics: SimDiagnostic[];
  /**
   * Board pin voltages at the exact moment they changed since the last frame (when tracing is on):
   * flat triples [t, channel, volts], channel = index in TRACE_PINS. `traceLost` counts changes
   * dropped because a frame overflowed.
   */
  trace?: number[];
  traceLost?: number;
};

/** The board pins the oscilloscope can probe, in channel order. */
export const TRACE_PINS = Object.keys(AVR_PINS);
const TRACE_MAX = 60_000;

type Probe = { part: string; name: string; read: (s: Solution) => number };

/** Parse Intel HEX into a 32 KB program image. */
export function loadHex(hex: string): Uint16Array {
  const bytes = new Uint8Array(0x8000);
  let base = 0;
  for (const raw of hex.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith(":")) continue;
    const n = parseInt(line.slice(1, 3), 16);
    const addr = parseInt(line.slice(3, 7), 16);
    const type = parseInt(line.slice(7, 9), 16);
    if (type === 0) for (let i = 0; i < n; i++) bytes[base + addr + i] = parseInt(line.slice(9 + i * 2, 11 + i * 2), 16);
    else if (type === 2) base = parseInt(line.slice(9, 13), 16) << 4;
    else if (type === 4) base = parseInt(line.slice(9, 13), 16) << 16;
  }
  return new Uint16Array(bytes.buffer);
}

const BOARD_DRIVE_R = 25;
const PULLUP_R = 35_000;

export class Simulation {
  readonly netlist: Netlist;
  readonly diagnostics: SimDiagnostic[] = [];
  private parts: Map<string, PartInstance>;
  private board: PartInstance | null = null;
  private cpu: CPU | null = null;
  private ports: Record<"B" | "C" | "D", AVRIOPort> | null = null;
  private adc: AVRADC | null = null;
  private usart: AVRUSART | null = null;
  private serialOut: number[] = [];
  private serialIn: number[] = [];

  private nodeOf = new Map<number, number>(); // net → solver node
  private nextNode = 1;
  private clock = 0;
  private circuit!: Circuit;
  private elemsOwner: { part: string; tag: string }[] = [];
  private probes: Probe[] = [];
  private drives = new Map<string, Drive>();
  private cache = new Map<string, Solution>();
  private sol!: Solution;
  private lastT = 0;
  private frameStart = 0;
  private acc = new Float64Array(0);
  private devices: DeviceLogic[] = [];
  private inputLevel = new Map<string, boolean>();
  private dynamicDiag = new Map<string, SimDiagnostic>();
  private tracing = false;
  private trace: number[] = [];
  private traceLost = 0;
  private traceLast = new Float64Array(TRACE_PINS.length).fill(NaN);

  constructor(
    readonly doc: CircuitDoc,
    hex: string | null,
  ) {
    this.parts = new Map(doc.parts.map((p) => [p.id, p]));
    this.netlist = buildNetlist(doc);
    this.board = doc.parts.find((p) => PART_BY_TYPE.get(p.type)?.mcu) ?? null;
    this.diagnostics.push(...checkCircuit(doc, this.netlist, !!hex));

    if (this.board && hex) {
      const cpu = new CPU(loadHex(hex));
      this.cpu = cpu;
      new AVRTimer(cpu, timer0Config);
      new AVRTimer(cpu, timer1Config);
      new AVRTimer(cpu, timer2Config);
      this.ports = { B: new AVRIOPort(cpu, portBConfig), C: new AVRIOPort(cpu, portCConfig), D: new AVRIOPort(cpu, portDConfig) };
      this.adc = new AVRADC(cpu, adcConfig);
      this.usart = new AVRUSART(cpu, usart0Config, F_CPU);
      this.usart.onByteTransmit = (b) => this.serialOut.push(b);
      for (const port of Object.values(this.ports)) port.addListener(() => this.onPins());
    }

    this.build();
    this.updateDrives();
    this.resolve();
  }

  /* ── Circuit assembly ─────────────────────────────────────────────── */

  private node(part: string, pin: string): number {
    const net = this.netlist.netOf.get(key(part, pin));
    if (net === undefined) return 0;
    let n = this.nodeOf.get(net);
    if (n === undefined) {
      n = this.nextNode++;
      this.nodeOf.set(net, n);
    }
    return n;
  }

  /** Rebuild the solver's element list (after a button press, knob turn, sensor change…). */
  private build() {
    this.nodeOf = new Map();
    this.nextNode = 1;
    // Ground: the board's GND, else the negative terminal of the first source.
    const gndPin = this.board ? [this.board.id, "GND1"] : (() => {
      const src = this.doc.parts.find((p) => ["battery-9v", "battery-aa", "power-supply"].includes(p.type));
      return src ? [src.id, "-"] : null;
    })();
    if (gndPin) {
      const net = this.netlist.netOf.get(key(gndPin[0], gndPin[1]));
      if (net !== undefined) this.nodeOf.set(net, 0);
    }
    const elems: Elem[] = [];
    const owners: { part: string; tag: string }[] = [];
    const add = (part: string, tag: string, e: Elem) => {
      owners.push({ part, tag });
      return elems.push(e) - 1;
    };
    const probes: Probe[] = [];
    const devices: DeviceLogic[] = [];
    const n = (p: PartInstance, pin: string) => this.node(p.id, pin);

    for (const p of this.doc.parts) {
      const def = PART_BY_TYPE.get(p.type);
      if (!def || def.support !== "sim") continue;
      const pr = propsOf(p);
      const num = (k: string, d: number) => (Number.isFinite(Number(pr[k])) ? Number(pr[k]) : d);
      const volt = (a: number, b: number) => (s: Solution) => s.v[a] - s.v[b];
      switch (p.type) {
        case "arduino-uno":
        case "arduino-nano": {
          if (p !== this.board) break;
          const g = n(p, "GND1");
          const i5 = add(p.id, "5V", { t: "V", a: n(p, "5V"), b: g, v: 5, r: 0.05 });
          const i3 = add(p.id, "3V3", { t: "V", a: n(p, "3V3"), b: g, v: 3.3, r: 1 });
          probes.push({ part: p.id, name: "i5V", read: (s) => s.i[i5] }, { part: p.id, name: "i3V3", read: (s) => s.i[i3] });
          for (const pin of Object.keys(AVR_PINS)) {
            const idx = add(p.id, pin, { t: "X", a: n(p, pin), b: g, key: `${p.id}:${pin}` });
            probes.push({ part: p.id, name: `i${pin}`, read: (s) => s.i[idx] });
            const node = n(p, pin);
            probes.push({ part: p.id, name: `v${pin}`, read: (s) => s.v[node] });
          }
          break;
        }
        case "resistor": {
          const a = n(p, "1");
          const b = n(p, "2");
          const i = add(p.id, "R", { t: "R", a, b, r: num("r", 220) });
          probes.push({ part: p.id, name: "i", read: (s) => s.i[i] }, { part: p.id, name: "v", read: volt(a, b) });
          break;
        }
        case "led": {
          const c = LED_COLORS[String(pr.color)] ?? LED_COLORS.red;
          const a = n(p, "A");
          const k = n(p, "K");
          const i = add(p.id, "D", { t: "D", a, k, vf: c.vf, ron: 15 });
          probes.push({ part: p.id, name: "i", read: (s) => Math.max(0, s.i[i]) }, { part: p.id, name: "v", read: volt(a, k) });
          break;
        }
        case "rgb-led": {
          const anode = pr.common === "anode";
          const com = n(p, "COM");
          for (const [ch, vf] of [["R", 1.9], ["G", 2.9], ["B", 3.0]] as const) {
            const x = n(p, ch);
            const i = add(p.id, ch, anode ? { t: "D", a: com, k: x, vf, ron: 15 } : { t: "D", a: x, k: com, vf, ron: 15 });
            probes.push({ part: p.id, name: `i${ch}`, read: (s) => Math.max(0, s.i[i]) });
          }
          break;
        }
        case "pushbutton": {
          const pressed = Boolean(this.live(p.id, "pressed"));
          add(p.id, "SW", { t: "R", a: n(p, "1a"), b: n(p, "2a"), r: pressed ? 0.05 : 1e10 });
          break;
        }
        case "slide-switch": {
          const on = Boolean(this.live(p.id, "on") ?? pr.on);
          add(p.id, "SW", { t: "R", a: n(p, "C"), b: n(p, on ? "B" : "A"), r: 0.05 });
          break;
        }
        case "potentiometer": {
          const r = num("r", 10000);
          const pos = Math.min(1, Math.max(0, Number(this.live(p.id, "pos") ?? pr.pos ?? 0.5)));
          const w = n(p, "W");
          add(p.id, "R1", { t: "R", a: n(p, "1"), b: w, r: Math.max(1, r * pos) });
          add(p.id, "R2", { t: "R", a: w, b: n(p, "2"), r: Math.max(1, r * (1 - pos)) });
          probes.push({ part: p.id, name: "vW", read: (s) => s.v[w] });
          break;
        }
        case "capacitor": {
          const a = n(p, "+");
          const b = n(p, "-");
          probes.push({ part: p.id, name: "v", read: volt(a, b) });
          break;
        }
        case "diode": {
          const i = add(p.id, "D", { t: "D", a: n(p, "A"), k: n(p, "K"), vf: 0.7, ron: 0.3 });
          probes.push({ part: p.id, name: "i", read: (s) => Math.max(0, s.i[i]) });
          break;
        }
        case "npn":
        case "pnp": {
          const i = add(p.id, "Q", { t: "Q", c: n(p, "C"), b: n(p, "B"), e: n(p, "E"), beta: num("beta", 150), pnp: p.type === "pnp" });
          probes.push({ part: p.id, name: "ic", read: (s) => s.i[i] });
          break;
        }
        case "nmos": {
          const i = add(p.id, "M", { t: "M", d: n(p, "D"), g: n(p, "G"), s: n(p, "S"), vth: 2, ron: 0.025, p: false });
          probes.push({ part: p.id, name: "id", read: (s) => s.i[i] });
          break;
        }
        case "buzzer": {
          const a = n(p, "+");
          const b = n(p, "-");
          const active = Boolean(pr.active);
          add(p.id, "R", { t: "R", a, b, r: active ? 170 : 1000 });
          probes.push({ part: p.id, name: "v", read: volt(a, b) });
          if (!active) devices.push(new EdgeCounter(p.id, volt(a, b)));
          break;
        }
        case "servo": {
          const vp = n(p, "V+");
          const g = n(p, "GND");
          add(p.id, "R", { t: "R", a: vp, b: g, r: 500 });
          probes.push({ part: p.id, name: "power", read: volt(vp, g) });
          devices.push(new PulseMeter(p.id, volt(n(p, "SIG"), g), volt(vp, g)));
          break;
        }
        case "dc-motor": {
          const a = n(p, "+");
          const b = n(p, "-");
          add(p.id, "R", { t: "R", a, b, r: 10 });
          const rated = num("rated", 6);
          probes.push({ part: p.id, name: "speed", read: (s) => Math.max(-1.5, Math.min(1.5, (s.v[a] - s.v[b]) / rated)) }, { part: p.id, name: "v", read: volt(a, b) });
          break;
        }
        case "battery-9v":
        case "battery-aa":
        case "power-supply": {
          const v = p.type === "battery-9v" ? 9 : p.type === "battery-aa" ? 1.5 * Math.max(1, Math.round(num("cells", 2))) : num("v", 5);
          const r = p.type === "battery-9v" ? 1.5 : p.type === "battery-aa" ? 0.3 * Math.max(1, Math.round(num("cells", 2))) : 0.01;
          const i = add(p.id, "V", { t: "V", a: n(p, "+"), b: n(p, "-"), v, r });
          probes.push({ part: p.id, name: "i", read: (s) => s.i[i] });
          break;
        }
        case "ldr": {
          const lux = Math.max(0, Number(this.live(p.id, "lux") ?? pr.lux ?? 300));
          const r = Math.min(1e6, Math.max(100, 10_000 * Math.pow(Math.max(lux, 0.01) / 10, -0.7)));
          add(p.id, "R", { t: "R", a: n(p, "1"), b: n(p, "2"), r });
          break;
        }
        case "thermistor": {
          const t = Number(this.live(p.id, "temp") ?? pr.temp ?? 25);
          const r = 10_000 * Math.exp(3950 * (1 / (t + 273.15) - 1 / 298.15));
          add(p.id, "R", { t: "R", a: n(p, "1"), b: n(p, "2"), r });
          break;
        }
        case "hc-sr04": {
          const vcc = n(p, "VCC");
          const g = n(p, "GND");
          add(p.id, "R", { t: "R", a: vcc, b: g, r: 330 });
          add(p.id, "ECHO", { t: "X", a: n(p, "ECHO"), b: g, key: `${p.id}:ECHO` });
          if (!this.drives.has(`${p.id}:ECHO`)) this.drives.set(`${p.id}:ECHO`, { v: 0, r: 50 });
          devices.push(new Sonar(p.id, volt(n(p, "TRIG"), g), volt(vcc, g), () => Number(this.live(p.id, "cm") ?? pr.cm ?? 50)));
          break;
        }
        case "voltmeter": {
          probes.push({ part: p.id, name: "v", read: volt(n(p, "V"), n(p, "COM")) });
          break;
        }
        case "ammeter": {
          const i = add(p.id, "R", { t: "R", a: n(p, "IN"), b: n(p, "OUT"), r: 0.01 });
          probes.push({ part: p.id, name: "i", read: (s) => s.i[i] });
          break;
        }
      }
    }
    this.circuit = new Circuit(this.nextNode, elems);
    this.elemsOwner = owners;
    this.probes = probes;
    this.acc = new Float64Array(probes.length);
    this.cache.clear();
    const old = new Map(this.devices.map((d) => [d.part, d]));
    this.devices = devices.map((d) => old.get(d.part)?.adopt(d) ?? d);
    for (const d of this.devices) d.attach(this);
  }

  /* ── Live interaction (button presses, knobs, sensor values) ──────── */

  private liveState = new Map<string, unknown>();
  private live(part: string, k: string) {
    return this.liveState.get(`${part}:${k}`) as number | boolean | undefined;
  }
  setLive(part: string, k: string, value: number | boolean) {
    this.advance(this.now());
    this.liveState.set(`${part}:${k}`, value);
    this.build();
    this.resolve();
  }

  /* ── Time ─────────────────────────────────────────────────────────── */

  now() {
    return this.cpu ? this.cpu.cycles / F_CPU : this.clock;
  }
  get cycles() {
    return this.cpu?.cycles ?? 0;
  }
  /** Schedule a callback after `seconds` of simulated time. */
  after(seconds: number, fn: () => void) {
    if (this.cpu) this.cpu.addClockEvent(fn, Math.max(1, Math.round(seconds * F_CPU)));
  }

  /** Integrate every probe up to time t with the solution that held until then. */
  private advance(t: number) {
    const dt = t - this.lastT;
    if (dt > 0 && this.sol) for (let i = 0; i < this.probes.length; i++) this.acc[i] += this.probes[i].read(this.sol) * dt;
    this.lastT = Math.max(this.lastT, t);
  }

  /* ── Pins ↔ circuit ───────────────────────────────────────────────── */

  setDrive(k: string, d: Drive) {
    this.advance(this.now());
    this.drives.set(k, d);
    this.resolve();
  }

  private updateDrives() {
    if (!this.board) return;
    for (const [pin, m] of Object.entries(AVR_PINS)) {
      const port = this.ports?.[m.port];
      let d: Drive = null;
      if (port) {
        const s = port.pinState(m.bit);
        d = s === PinState.High ? { v: 5, r: BOARD_DRIVE_R } : s === PinState.Low ? { v: 0, r: BOARD_DRIVE_R } : s === PinState.InputPullUp ? { v: 5, r: PULLUP_R } : null;
      }
      this.drives.set(`${this.board.id}:${pin}`, d);
    }
  }

  private onPins() {
    this.advance(this.now());
    this.updateDrives();
    this.resolve();
  }

  private resolve() {
    let k = "";
    for (const [name, d] of this.drives) k += d ? `${name}=${d.v}/${d.r};` : `${name}=z;`;
    let s = this.cache.get(k);
    if (!s) {
      s = this.circuit.solve(this.drives);
      if (this.cache.size > 256) this.cache.clear();
      this.cache.set(k, s);
    }
    this.sol = s;
    const t = this.now();
    if (this.tracing) this.record(t);
    for (const d of this.devices) d.onSolve(s, t);
    this.feedInputs();
  }

  /** Turn recording of pin voltage changes on or off (it costs a little on every pin change). */
  setTracing(on: boolean) {
    this.tracing = on;
    this.trace = [];
    this.traceLost = 0;
    this.traceLast.fill(NaN);
    if (on) this.record(this.now());
  }

  private record(t: number) {
    if (!this.board) return;
    for (let ch = 0; ch < TRACE_PINS.length; ch++) {
      const net = this.netlist.netOf.get(key(this.board.id, TRACE_PINS[ch]));
      const node = net === undefined ? undefined : this.nodeOf.get(net);
      const v = node === undefined ? 0 : this.sol.v[node];
      if (Math.abs(v - this.traceLast[ch]) < 1e-3) continue;
      this.traceLast[ch] = v;
      if (this.trace.length >= TRACE_MAX * 3) this.traceLost++;
      else this.trace.push(t, ch, v);
    }
  }

  private feedInputs() {
    if (!this.board || !this.ports || !this.adc) return;
    const s = this.sol;
    for (const [pin, m] of Object.entries(AVR_PINS)) {
      const net = this.netlist.netOf.get(key(this.board.id, pin));
      const node = net === undefined ? undefined : this.nodeOf.get(net);
      const v = node === undefined ? 0 : s.v[node];
      if (m.adc !== undefined) this.adc.channelValues[m.adc] = Math.max(0, Math.min(5, v));
      const port = this.ports[m.port];
      const st = port.pinState(m.bit);
      if (st === PinState.Input || st === PinState.InputPullUp) {
        const id = `${pin}`;
        const prev = this.inputLevel.get(id) ?? false;
        const level = v > 3.0 ? true : v < 1.5 ? false : prev;
        if (level !== prev || !this.inputLevel.has(id)) {
          this.inputLevel.set(id, level);
          port.setPin(m.bit, level);
        }
      }
    }
    for (const [pin, ch] of Object.entries(ADC_ONLY)) {
      const net = this.netlist.netOf.get(key(this.board.id, pin));
      const node = net === undefined ? undefined : this.nodeOf.get(net);
      this.adc.channelValues[ch] = node === undefined ? 0 : Math.max(0, Math.min(5, s.v[node]));
    }
  }

  /* ── Running ──────────────────────────────────────────────────────── */

  /** Run the CPU for `cycles` (or just let time pass when there's no program). */
  run(cycles: number) {
    const cpu = this.cpu;
    if (!cpu) {
      this.clock += cycles / F_CPU;
      return;
    }
    const end = cpu.cycles + cycles;
    const usart = this.usart!;
    while (cpu.cycles < end) {
      if (this.serialIn.length && !usart.rxBusy) usart.writeByte(this.serialIn.shift()!);
      for (let i = 0; i < 1000 && cpu.cycles < end; i++) {
        avrInstruction(cpu);
        cpu.tick();
      }
    }
  }

  serialWrite(text: string) {
    for (const b of new TextEncoder().encode(text)) this.serialIn.push(b);
  }

  /** Averages since the last frame, then start a new frame. */
  frame(realSeconds: number): Frame {
    const t = this.now();
    this.advance(t);
    const span = Math.max(1e-9, t - this.frameStart);
    const parts: Record<string, PartReading> = {};
    this.probes.forEach((p, i) => {
      (parts[p.part] ??= {})[p.name] = this.acc[i] / span;
    });
    // Instantaneous values where an average means nothing.
    this.probes.forEach((p) => {
      if (p.name.startsWith("v") && p.part === this.board?.id) (parts[p.part] ??= {})[`now_${p.name}`] = p.read(this.sol);
    });
    for (const d of this.devices) Object.assign((parts[d.part] ??= {}), d.reading(span));
    if (this.board && this.ports) {
      const st: Record<string, number> = {};
      for (const [pin, m] of Object.entries(AVR_PINS)) st[`mode${pin}`] = this.ports[m.port].pinState(m.bit);
      Object.assign((parts[this.board.id] ??= {}), st, { tx: this.serialOut.length ? 1 : 0 });
    }
    this.checkLimits(parts);
    this.acc.fill(0);
    const speed = realSeconds > 0 ? span / realSeconds : 1;
    this.frameStart = t;
    const serial = this.serialOut.length ? String.fromCharCode(...this.serialOut.splice(0)) : "";
    const out: Frame = { t, speed, parts, serial, diagnostics: [...this.diagnostics, ...this.dynamicDiag.values()] };
    if (this.tracing) {
      out.trace = this.trace;
      out.traceLost = this.traceLost;
      this.trace = [];
      this.traceLost = 0;
    }
    return out;
  }

  /** Over-current and short-circuit warnings from the averaged readings. */
  private checkLimits(parts: Record<string, PartReading>) {
    const flag = (id: string, d: SimDiagnostic) => this.dynamicDiag.set(id, d);
    for (const p of this.doc.parts) {
      const r = parts[p.id];
      if (!r) continue;
      if (p.type === "led" && r.i > 0.03) flag(`led:${p.id}`, { level: "warning", code: "led_overcurrent", part: p.id, detail: { mA: Math.round(r.i * 1000) } });
      if (p.type === "rgb-led" && Math.max(r.iR ?? 0, r.iG ?? 0, r.iB ?? 0) > 0.03) flag(`led:${p.id}`, { level: "warning", code: "led_overcurrent", part: p.id, detail: { mA: Math.round(Math.max(r.iR, r.iG, r.iB) * 1000) } });
      if (p === this.board) {
        if (Math.abs(r.i5V) > 0.5) flag("short5", { level: "error", code: "short", part: p.id, pin: "5V", detail: { mA: Math.round(r.i5V * 1000) } });
        if (Math.abs(r.i3V3) > 0.15) flag("short3", { level: "error", code: "short", part: p.id, pin: "3V3", detail: { mA: Math.round(r.i3V3 * 1000) } });
        for (const pin of Object.keys(AVR_PINS))
          if (Math.abs(r[`i${pin}`] ?? 0) > 0.04) flag(`pin:${pin}`, { level: "warning", code: "pin_overcurrent", part: p.id, pin, detail: { mA: Math.round(Math.abs(r[`i${pin}`]) * 1000) } });
      }
      if ((p.type === "battery-9v" || p.type === "battery-aa" || p.type === "power-supply") && Math.abs(r.i) > 2) flag(`short:${p.id}`, { level: "error", code: "short", part: p.id, detail: { mA: Math.round(r.i * 1000) } });
    }
  }

  /** Voltage at a part's pin right now (tests, the inspector). */
  pinVoltage(part: string, pin: string) {
    const net = this.netlist.netOf.get(key(part, pin));
    const node = net === undefined ? undefined : this.nodeOf.get(net);
    return node === undefined ? 0 : this.sol.v[node];
  }
  get owners() {
    return this.elemsOwner;
  }
}

/* ── Devices with behaviour over time ─────────────────────────────────── */

abstract class DeviceLogic {
  protected sim!: Simulation;
  constructor(readonly part: string) {}
  attach(sim: Simulation) {
    this.sim = sim;
  }
  /** Keep timing state across a circuit rebuild. */
  adopt(next: DeviceLogic): DeviceLogic {
    return next;
  }
  abstract onSolve(s: Solution, t: number): void;
  abstract reading(span: number): PartReading;
}

/** Passive buzzer: counts rising edges of the voltage across it → frequency. */
class EdgeCounter extends DeviceLogic {
  private high = false;
  private edges = 0;
  constructor(
    part: string,
    private v: (s: Solution) => number,
  ) {
    super(part);
  }
  adopt(next: DeviceLogic) {
    Object.assign(next, { high: this.high, edges: this.edges });
    return next;
  }
  onSolve(s: Solution) {
    const h = Math.abs(this.v(s)) > 1.5;
    if (h && !this.high) this.edges++;
    this.high = h;
  }
  reading(span: number) {
    const f = this.edges / span;
    this.edges = 0;
    return { freq: f >= 20 ? f : 0 };
  }
}

/** Servo: measures the width of each high pulse on SIG. */
class PulseMeter extends DeviceLogic {
  private high = false;
  private rose = 0;
  private width = 0;
  private lastPulse = -1;
  constructor(
    part: string,
    private sig: (s: Solution) => number,
    private power: (s: Solution) => number,
  ) {
    super(part);
  }
  adopt(next: DeviceLogic) {
    Object.assign(next, { high: this.high, rose: this.rose, width: this.width, lastPulse: this.lastPulse });
    return next;
  }
  onSolve(s: Solution, t: number) {
    const h = this.sig(s) > 2.5;
    if (h && !this.high) this.rose = t;
    if (!h && this.high) {
      const w = t - this.rose;
      if (w > 400e-6 && w < 2600e-6 && this.power(s) > 4) {
        this.width = w;
        this.lastPulse = t;
      }
    }
    this.high = h;
  }
  reading() {
    const fresh = this.lastPulse >= 0 && this.sim.now() - this.lastPulse < 0.1;
    const w = Math.min(2400e-6, Math.max(544e-6, this.width));
    return { angle: this.lastPulse < 0 ? -1 : ((w - 544e-6) / (2400e-6 - 544e-6)) * 180, holding: fresh ? 1 : 0, pulse_us: this.width * 1e6 };
  }
}

/** HC-SR04: a TRIG pulse ≥ 10 µs starts a measurement; ECHO goes high for 58 µs per cm. */
class Sonar extends DeviceLogic {
  private high = false;
  private rose = 0;
  private busy = false;
  private pings = 0;
  constructor(
    part: string,
    private trig: (s: Solution) => number,
    private power: (s: Solution) => number,
    private cm: () => number,
  ) {
    super(part);
  }
  adopt(next: DeviceLogic) {
    Object.assign(next, { high: this.high, rose: this.rose, busy: this.busy, pings: this.pings });
    return next;
  }
  onSolve(s: Solution, t: number) {
    const h = this.trig(s) > 2.5;
    if (h && !this.high) this.rose = t;
    if (!h && this.high && t - this.rose >= 10e-6 && !this.busy && this.power(s) > 4.5) {
      this.busy = true;
      this.pings++;
      const v = Math.max(4.5, Math.min(5.5, this.power(s)));
      const echo = Math.min(38e-3, Math.max(2, Math.min(400, this.cm())) * 58e-6);
      // 8 × 40 kHz burst ≈ 200 µs, then ECHO high for the round trip.
      this.sim.after(200e-6, () => {
        this.sim.setDrive(`${this.part}:ECHO`, { v, r: 50 });
        this.sim.after(echo, () => {
          this.sim.setDrive(`${this.part}:ECHO`, { v: 0, r: 50 });
          this.busy = false;
        });
      });
    }
    this.high = h;
  }
  reading() {
    const n = this.pings;
    this.pings = 0;
    return { pings: n };
  }
}
