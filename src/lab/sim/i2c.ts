/**
 * I2C on the ATmega328P's TWI: the program's Wire calls reach the devices wired to A4 (SDA) and A5
 * (SCL). Each transfer takes its real time on the bus (9 clocks per byte at the program's SCL
 * frequency), so a 400 kHz display refresh costs the ~25 ms it would on hardware. A device answers
 * only when its SDA and SCL are on the board's pins and it has power; otherwise its address NACKs.
 */
import type { AVRTWI, TWIEventHandler } from "avr8js";
import { DeviceLogic } from "./device";
import type { Solution } from "./mna";

export abstract class I2CDevice extends DeviceLogic {
  /** Supply voltage at the last solve. */
  protected vcc = 0;
  constructor(
    part: string,
    readonly address: number,
    /** Solver nodes of the device's SDA and SCL pins (0 = not connected). */
    readonly sda: number,
    readonly scl: number,
    private power: (s: Solution) => number,
    /** Lowest supply it runs from. */
    private vmin = 3,
  ) {
    super(part);
  }
  get powered() {
    return this.vcc >= this.vmin;
  }
  onSolve(s: Solution) {
    this.vcc = this.power(s);
  }
  /** Addressed: `write` true for a write transfer, false for a read. */
  abstract begin(write: boolean): void;
  /** A byte from the controller; return true to ACK it. */
  abstract write(value: number): boolean;
  /** The next byte the controller reads. */
  abstract read(): number;
  /** STOP (or a repeated START) ends the transfer. */
  abstract end(): void;
}

export class I2CBus implements TWIEventHandler {
  private current: I2CDevice | null = null;
  constructor(
    private twi: AVRTWI,
    /** Devices that are wired to the board's SDA/SCL and powered right now. */
    private devices: () => I2CDevice[],
    private after: (seconds: number, fn: () => void) => void,
  ) {}
  private bits(n: number) {
    return n / Math.max(1000, this.twi.sclFrequency);
  }
  start() {
    this.current?.end();
    this.current = null;
    this.after(this.bits(1), () => this.twi.completeStart());
  }
  stop() {
    this.current?.end();
    this.current = null;
    this.after(this.bits(1), () => this.twi.completeStop());
  }
  connectToSlave(addr: number, write: boolean) {
    const dev = this.devices().find((d) => d.address === addr) ?? null;
    this.current = dev;
    dev?.begin(write);
    this.after(this.bits(9), () => this.twi.completeConnect(!!dev));
  }
  writeByte(value: number) {
    const ack = this.current?.write(value) ?? false;
    this.after(this.bits(9), () => this.twi.completeWrite(ack));
  }
  readByte() {
    // With no device the line stays released by the pull-ups.
    const v = this.current?.read() ?? 0xff;
    this.after(this.bits(9), () => this.twi.completeRead(v));
  }
}
