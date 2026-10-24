/**
 * SSD1306 128 × 64 OLED controller on I2C, from the datasheet: the control byte (Co, D/C#) selects a
 * command or data stream; commands set the addressing mode, column/page windows, contrast, remaps,
 * inversion and power; data bytes fill the 1 KB display RAM (8 pages of 128 columns, one bit per
 * pixel, LSB on top). The panel only lights with the display on and the charge pump enabled, as on
 * the real 0.96" modules. Hardware scrolling is accepted but not animated.
 */
import { I2CDevice } from "./i2c";
import type { Solution } from "./mna";

const W = 128;
const H = 64;
/** Argument bytes that follow each multi-byte command. */
const ARGS: Record<number, number> = { 0x20: 1, 0x21: 2, 0x22: 2, 0x26: 6, 0x27: 6, 0x29: 5, 0x2a: 5, 0x81: 1, 0x8d: 1, 0xa3: 2, 0xa8: 1, 0xd3: 1, 0xd5: 1, 0xd6: 1, 0xd9: 1, 0xda: 1, 0xdb: 1 };

const STATE = ["ram", "mode", "colStart", "colEnd", "pageStart", "pageEnd", "col", "page", "on", "pump", "invert", "allOn", "segRemap", "comDec", "startLine", "offset", "contrast", "bytes", "version", "shown", "expect", "data", "cmd", "vcc"];

export class Ssd1306Logic extends I2CDevice {
  ram = new Uint8Array(W * (H / 8));
  private mode = 2; // page addressing after reset
  private colStart = 0;
  private colEnd = W - 1;
  private pageStart = 0;
  private pageEnd = 7;
  private col = 0;
  private page = 0;
  on = false;
  private pump = false;
  private invert = false;
  private allOn = false;
  private segRemap = false;
  private comDec = false;
  private startLine = 0;
  private offset = 0;
  contrast = 0x7f;
  /** Bytes received since the last frame (activity, for the inspector). */
  private bytes = 0;
  private version = 0;

  // Transfer state.
  private expect: "ctrl" | "single" | "stream" = "ctrl";
  private data = false;
  private cmd: number[] = [];

  constructor(part: string, address: number, sda: number, scl: number, power: (s: Solution) => number) {
    super(part, address, sda, scl, power);
  }

  /** Keep the RAM and registers across a circuit rebuild (the new instance has the new wiring). */
  adopt(next: Ssd1306Logic) {
    for (const k of STATE) (next as unknown as Record<string, unknown>)[k] = (this as unknown as Record<string, unknown>)[k];
    return next;
  }

  begin() {
    this.expect = "ctrl";
  }
  end() {
    // A pending command keeps waiting for its arguments: Adafruit_SSD1306 sends some in a new transfer.
    this.expect = "ctrl";
  }
  read() {
    // Status byte: bit 6 = display off.
    return this.on ? 0 : 0x40;
  }
  write(b: number) {
    this.bytes++;
    if (this.expect === "ctrl") {
      this.data = (b & 0x40) !== 0;
      this.expect = b & 0x80 ? "single" : "stream";
      return true;
    }
    if (this.data) this.dataByte(b);
    else this.commandByte(b);
    if (this.expect === "single") this.expect = "ctrl";
    return true;
  }

  private dataByte(b: number) {
    this.ram[this.page * W + this.col] = b;
    this.version++;
    if (this.mode === 0) {
      if (++this.col > this.colEnd) {
        this.col = this.colStart;
        if (++this.page > this.pageEnd) this.page = this.pageStart;
      }
    } else if (this.mode === 1) {
      if (++this.page > this.pageEnd) {
        this.page = this.pageStart;
        if (++this.col > this.colEnd) this.col = this.colStart;
      }
    } else if (++this.col > W - 1) this.col = 0;
  }

  private commandByte(b: number) {
    this.cmd.push(b);
    const op = this.cmd[0];
    if (this.cmd.length <= (ARGS[op] ?? 0)) return;
    const a = this.cmd.slice(1);
    this.cmd = [];
    this.version++;
    if (op <= 0x0f) this.col = (this.col & 0xf0) | op;
    else if (op <= 0x1f) this.col = ((op & 0x0f) << 4) | (this.col & 0x0f);
    else if (op === 0x20) this.mode = a[0] & 3;
    else if (op === 0x21) {
      this.colStart = a[0] & 0x7f;
      this.colEnd = a[1] & 0x7f;
      this.col = this.colStart;
    } else if (op === 0x22) {
      this.pageStart = a[0] & 7;
      this.pageEnd = a[1] & 7;
      this.page = this.pageStart;
    } else if (op >= 0x40 && op <= 0x7f) this.startLine = op & 0x3f;
    else if (op === 0x81) this.contrast = a[0];
    else if (op === 0x8d) this.pump = (a[0] & 0x04) !== 0;
    else if (op === 0xa0 || op === 0xa1) this.segRemap = op === 0xa1;
    else if (op === 0xa4 || op === 0xa5) this.allOn = op === 0xa5;
    else if (op === 0xa6 || op === 0xa7) this.invert = op === 0xa7;
    else if (op === 0xae || op === 0xaf) this.on = op === 0xaf;
    else if (op >= 0xb0 && op <= 0xb7) this.page = op & 7;
    else if (op === 0xc0 || op === 0xc8) this.comDec = op === 0xc8;
    else if (op === 0xd3) this.offset = a[0] & 0x3f;
  }

  /** Is the glass lit at all? */
  get lit() {
    return this.on && this.pump && this.powered;
  }

  /**
   * What the glass shows, upright, in the same page layout as the RAM (bit y&7 of byte (y>>3)*128+x).
   * The usual init (segment remap A1, COM scan C8) shows RAM column 0 / row 0 at the top left.
   */
  picture(): Uint8Array {
    const out = new Uint8Array(W * (H / 8));
    if (!this.lit) return out;
    for (let y = 0; y < H; y++) {
      const row = this.comDec ? (y + this.startLine + this.offset) & 63 : (H - 1 - y + this.startLine + this.offset) & 63;
      for (let x = 0; x < W; x++) {
        const col = this.segRemap ? x : W - 1 - x;
        let px = this.allOn || ((this.ram[(row >> 3) * W + col] >> (row & 7)) & 1) === 1;
        if (this.invert) px = !px;
        if (px) out[(y >> 3) * W + x] |= 1 << (y & 7);
      }
    }
    return out;
  }
  private shown = -1;
  /** A new picture when anything changed since the last frame, else null. */
  screen(): Uint8Array | null {
    const v = this.version * 2 + (this.lit ? 1 : 0);
    if (v === this.shown) return null;
    this.shown = v;
    return this.picture();
  }

  reading() {
    const n = this.bytes;
    this.bytes = 0;
    return { on: this.lit ? 1 : 0, contrast: this.contrast, bytes: n };
  }
}
