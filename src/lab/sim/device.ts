/** Parts with behaviour over time (a buzzer's pitch, a servo's pulse, a sensor's protocol). */
import type { Solution } from "./mna";

export type PartReading = Record<string, number>;

/** What a device may ask of the simulation it belongs to. */
export interface DeviceHost {
  now(): number;
  /** Run `fn` after `seconds` of simulated time. */
  after(seconds: number, fn: () => void): void;
  /** Drive (or release, with null) an output pin modelled as a source with resistance. */
  setDrive(key: string, d: { v: number; r: number } | null): void;
  /** Change a part's state that changes the circuit (a relay's contacts). */
  setLive(part: string, key: string, value: number | boolean): void;
}

export abstract class DeviceLogic {
  protected sim!: DeviceHost;
  constructor(readonly part: string) {}
  attach(sim: DeviceHost) {
    this.sim = sim;
  }
  /** Keep timing state across a circuit rebuild. */
  adopt(next: DeviceLogic): DeviceLogic {
    return next;
  }
  abstract onSolve(s: Solution, t: number): void;
  abstract reading(span: number): PartReading;
}
