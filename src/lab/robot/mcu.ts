/**
 * The robot's brain: the same ATmega328P (avr8js) the circuit simulator uses, wired straight to the
 * robot instead of through a circuit — motor-driver inputs are read from the pins (PWM as the real
 * fraction of time each pin is high, measured at the cycle it changes), sensors drive input pins.
 */
import { AVRIOPort, AVRTimer, AVRUSART, CPU, PinState, avrInstruction, portBConfig, portCConfig, portDConfig, timer0Config, timer1Config, timer2Config, usart0Config } from "avr8js";
import { F_CPU, loadHex } from "../sim/engine";

type Port = "B" | "C" | "D";
/** Arduino Uno pin number (0–13, A0–A5 = 14–19) → port and bit. */
export function portOf(pin: number): [Port, number] {
  if (pin <= 7) return ["D", pin];
  if (pin <= 13) return ["B", pin - 8];
  return ["C", pin - 14];
}

export class RobotMcu {
  readonly cpu: CPU;
  private ports: Record<Port, AVRIOPort>;
  private watched: number[];
  private high: Map<number, { on: boolean; since: number; acc: number }> = new Map();
  private windowStart = 0;
  serial = "";

  constructor(hex: string, watch: number[]) {
    this.cpu = new CPU(loadHex(hex));
    new AVRTimer(this.cpu, timer0Config);
    new AVRTimer(this.cpu, timer1Config);
    new AVRTimer(this.cpu, timer2Config);
    this.ports = { B: new AVRIOPort(this.cpu, portBConfig), C: new AVRIOPort(this.cpu, portCConfig), D: new AVRIOPort(this.cpu, portDConfig) };
    const usart = new AVRUSART(this.cpu, usart0Config, F_CPU);
    usart.onByteTransmit = (b) => {
      this.serial += String.fromCharCode(b);
      if (this.serial.length > 4000) this.serial = this.serial.slice(-3000);
    };
    this.watched = watch;
    for (const p of watch) this.high.set(p, { on: false, since: 0, acc: 0 });
    for (const port of Object.values(this.ports)) port.addListener(() => this.onPins());
  }

  private level(pin: number) {
    const [port, bit] = portOf(pin);
    return this.ports[port].pinState(bit) === PinState.High;
  }

  private onPins() {
    const now = this.cpu.cycles;
    for (const p of this.watched) {
      const h = this.high.get(p)!;
      const on = this.level(p);
      if (on !== h.on) {
        if (h.on) h.acc += now - Math.max(h.since, this.windowStart);
        h.on = on;
        h.since = now;
      }
    }
  }

  /** Drive an input pin (a sensor's output). */
  setInput(pin: number, high: boolean) {
    const [port, bit] = portOf(pin);
    this.ports[port].setPin(bit, high);
  }

  run(cycles: number) {
    const end = this.cpu.cycles + cycles;
    while (this.cpu.cycles < end) {
      avrInstruction(this.cpu);
      this.cpu.tick();
    }
  }

  /** Fraction of the time since the last call each watched pin was high (0–1), then start a new window. */
  duties(): Record<number, number> {
    const now = this.cpu.cycles;
    const span = Math.max(1, now - this.windowStart);
    const out: Record<number, number> = {};
    for (const p of this.watched) {
      const h = this.high.get(p)!;
      const acc = h.acc + (h.on ? now - Math.max(h.since, this.windowStart) : 0);
      out[p] = Math.min(1, acc / span);
      h.acc = 0;
    }
    this.windowStart = now;
    return out;
  }

  get seconds() {
    return this.cpu.cycles / F_CPU;
  }
}
