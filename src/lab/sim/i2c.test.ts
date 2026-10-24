import { beforeAll, describe, expect, it } from "vitest";
import { buildSketch, type Toolchain } from "../compiler/build";
import { nodeToolchain } from "../compiler/node-toolchain";
import { emptyDoc, type CircuitDoc, type PartInstance, type Wire } from "../circuit/model";
import { F_CPU, Simulation, type Frame } from "./engine";

let tc: Toolchain;
beforeAll(async () => {
  tc = await nodeToolchain();
});

let n = 0;
const part = (type: string, props: PartInstance["props"] = {}): PartInstance => ({ id: `${type}${n++}`, type, x: 0, y: 500 + n * 300, rot: 0, props });
const w = (a: [PartInstance, string], b: [PartInstance, string]): Wire => ({ id: `w${n++}`, a: { part: a[0].id, pin: a[1] }, b: { part: b[0].id, pin: b[1] }, pts: [], color: "#fff" });
const uno = (): PartInstance => ({ id: "uno", type: "arduino-uno", x: 0, y: 0, rot: 0, props: {} });

async function run(parts: PartInstance[], wires: Wire[], code: string, seconds: number) {
  const doc: CircuitDoc = { ...emptyDoc(), parts, wires, files: [{ name: "sketch.ino", text: code }] };
  const r = await buildSketch(tc, doc.files, doc.main);
  expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const s = new Simulation(doc, r.hex!);
  const frames: Frame[] = [];
  for (let t = 0; t < seconds; t += 0.05) {
    s.run(Math.round(0.05 * F_CPU));
    frames.push(s.frame(0.05));
  }
  const screens = Object.assign({}, ...frames.map((f) => f.screens ?? {})) as Record<string, Uint8Array>;
  return { frames, screens, serial: frames.map((f) => f.serial).join("") };
}
const px = (pic: Uint8Array, x: number, y: number) => ((pic[(y >> 3) * 128 + x] >> (y & 7)) & 1) === 1;
const count = (pic: Uint8Array) => pic.reduce((a, b) => a + popcount(b), 0);
const popcount = (b: number) => b.toString(2).replace(/0/g, "").length;

const OLED_SKETCH = `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
void setup() {
  Serial.begin(115200);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { Serial.println("no display"); for (;;); }
  display.clearDisplay();
  display.drawPixel(3, 5, SSD1306_WHITE);
  display.fillRect(100, 40, 10, 6, SSD1306_WHITE);
  display.display();
  Serial.println("ok");
}
void loop() {}
`;

describe("I2C", () => {
  it("SSD1306: Adafruit_SSD1306 draws on the simulated OLED, pixel for pixel", async () => {
    const b = uno();
    const oled = part("oled-ssd1306");
    const wires = [w([oled, "GND"], [b, "GND1"]), w([oled, "VCC"], [b, "5V"]), w([oled, "SDA"], [b, "A4"]), w([oled, "SCL"], [b, "A5"])];
    const { screens, serial, frames } = await run([b, oled], wires, OLED_SKETCH, 0.6);
    expect(serial.trim()).toBe("ok");
    const pic = screens[oled.id];
    expect(pic).toBeDefined();
    expect(px(pic, 3, 5)).toBe(true);
    expect(px(pic, 4, 5)).toBe(false);
    for (const [x, y] of [[100, 40], [109, 45], [105, 43]]) expect(px(pic, x, y), `${x},${y}`).toBe(true);
    expect(px(pic, 110, 40)).toBe(false);
    expect(px(pic, 100, 46)).toBe(false);
    expect(count(pic)).toBe(1 + 60);
    expect(frames.at(-1)!.parts[oled.id].on).toBe(1);
  });

  it("an I2C scanner finds the OLED at its address, and nothing when it's on the wrong pins", async () => {
    const SCAN = `#include <Wire.h>
void setup() {
  Serial.begin(115200);
  Wire.begin();
  for (byte a = 1; a < 127; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) { Serial.print(a, HEX); Serial.print(" "); }
  }
  Serial.println("done");
}
void loop() {}
`;
    const b = uno();
    const right = part("oled-ssd1306", { address: "0x3D" });
    const ok = await run([b, right], [w([right, "GND"], [b, "GND1"]), w([right, "VCC"], [b, "5V"]), w([right, "SDA"], [b, "SDA"]), w([right, "SCL"], [b, "SCL"])], SCAN, 0.3);
    expect(ok.serial.trim()).toBe("3D done");

    const wrong = part("oled-ssd1306");
    const bad = await run([b, wrong], [w([wrong, "GND"], [b, "GND1"]), w([wrong, "VCC"], [b, "5V"]), w([wrong, "SDA"], [b, "D2"]), w([wrong, "SCL"], [b, "D3"])], SCAN, 0.3);
    expect(bad.serial.trim()).toBe("done");

    const unpowered = part("oled-ssd1306");
    const off = await run([b, unpowered], [w([unpowered, "GND"], [b, "GND1"]), w([unpowered, "SDA"], [b, "A4"]), w([unpowered, "SCL"], [b, "A5"])], SCAN, 0.3);
    expect(off.serial.trim()).toBe("done");
  });

  it("the drawing stays dark when the program never turns the display on", async () => {
    const b = uno();
    const oled = part("oled-ssd1306");
    const code = OLED_SKETCH.replace("display.display();", "display.display();\n  display.ssd1306_command(SSD1306_DISPLAYOFF);");
    const { screens, serial } = await run([b, oled], [w([oled, "GND"], [b, "GND1"]), w([oled, "VCC"], [b, "5V"]), w([oled, "SDA"], [b, "A4"]), w([oled, "SCL"], [b, "A5"])], code, 0.6);
    expect(serial.trim()).toBe("ok");
    expect(count(screens[oled.id])).toBe(0);
  });
});
