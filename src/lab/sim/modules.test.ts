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
const part = (type: string, x = 0, props: PartInstance["props"] = {}): PartInstance => ({ id: `${type}${n++}`, type, x, y: 500 + n * 300, rot: 0, props });
const w = (a: [PartInstance, string], b: [PartInstance, string]): Wire => ({ id: `w${n++}`, a: { part: a[0].id, pin: a[1] }, b: { part: b[0].id, pin: b[1] }, pts: [], color: "#fff" });
const uno = () => ({ id: "uno", type: "arduino-uno", x: 0, y: 0, rot: 0 as const, props: {} });

async function sim(parts: PartInstance[], wires: Wire[], code?: string) {
  const doc: CircuitDoc = { ...emptyDoc(), parts, wires, files: [{ name: "sketch.ino", text: code ?? "void setup(){}\nvoid loop(){}\n" }] };
  let hex: string | null = null;
  if (code) {
    const r = await buildSketch(tc, doc.files, doc.main);
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    hex = r.hex!;
  }
  const s = new Simulation(doc, hex);
  const frames: Frame[] = [];
  const run = (seconds: number, step = 0.02) => {
    let last: Frame | undefined;
    for (let t = 0; t < seconds - 1e-9; t += step) {
      s.run(Math.round(step * F_CPU));
      last = s.frame(step);
      frames.push(last);
    }
    return last!;
  };
  return { s, run, serial: () => frames.map((f) => f.serial).join("") };
}

describe("modules", () => {
  it("7-segment: the sketch's digit lights exactly its segments", async () => {
    const b = uno();
    const d = part("seg7");
    const res = ["a", "b", "c", "d", "e", "f", "g"].map((s, i) => [s, part("resistor", 0, { r: 330 }), `D${2 + i}`] as const);
    const wires = [w([d, "COM1"], [b, "GND1"]), ...res.flatMap(([s, r, pin]) => [w([b, pin], [r, "1"]), w([r, "2"], [d, s])])];
    // "2" = a, b, d, e, g.
    const code = "const byte P[]={2,3,4,5,6,7,8};\nconst bool TWO[]={1,1,0,1,1,0,1};\nvoid setup(){for(int i=0;i<7;i++){pinMode(P[i],OUTPUT);digitalWrite(P[i],TWO[i]);}}\nvoid loop(){}\n";
    const { run } = await sim([b, d, ...res.map(([, r]) => r)], wires, code);
    const f = run(0.1);
    const lit = ["a", "b", "c", "d", "e", "f", "g"].filter((s) => f.parts[d.id][`i_${s}`] > 0.003);
    expect(lit).toEqual(["a", "b", "d", "e", "g"]);
    expect(f.parts[d.id].i_a).toBeLessThan(0.012);
  });

  it("relay: IN HIGH pulls the contacts over after 10 ms and an LED on NO lights", async () => {
    const b = uno();
    const r = part("relay");
    const led = part("led");
    const res = part("resistor", 0, { r: 220 });
    const wires = [w([r, "VCC"], [b, "5V"]), w([r, "GND"], [b, "GND1"]), w([r, "IN"], [b, "D7"]), w([r, "COM"], [b, "5V"]), w([r, "NO"], [res, "1"]), w([res, "2"], [led, "A"]), w([led, "K"], [b, "GND2"])];
    const code = "void setup(){pinMode(7,OUTPUT);delay(100);digitalWrite(7,HIGH);}\nvoid loop(){}\n";
    const { run } = await sim([b, r, led, res], wires, code);
    let f = run(0.1, 0.005);
    expect(f.parts[r.id].on).toBe(0);
    expect(f.parts[led.id].i).toBeLessThan(1e-4);
    f = run(0.05, 0.005);
    expect(f.parts[r.id].on).toBe(1);
    expect(f.parts[led.id].i).toBeGreaterThan(0.01);
    // The coil draws about 70 mA from VCC.
    expect(f.parts[r.id].i_coil).toBeGreaterThan(0.06);
  });

  it("logic chips work without an Arduino: a 74HC08 lights its LED only when both switches are on", async () => {
    const bat = part("power-supply", 0, { v: 5 });
    const chip = part("74hc08");
    const s1 = part("slide-switch");
    const s2 = part("slide-switch");
    const led = part("led");
    const r = part("resistor", 0, { r: 330 });
    const wires = [
      w([chip, "14"], [bat, "+"]),
      w([chip, "7"], [bat, "-"]),
      w([s1, "C"], [chip, "1"]),
      w([s1, "B"], [bat, "+"]),
      w([s1, "A"], [bat, "-"]),
      w([s2, "C"], [chip, "2"]),
      w([s2, "B"], [bat, "+"]),
      w([s2, "A"], [bat, "-"]),
      w([chip, "3"], [r, "1"]),
      w([r, "2"], [led, "A"]),
      w([led, "K"], [bat, "-"]),
    ];
    const { s, run } = await sim([bat, chip, s1, s2, led, r], wires);
    const lit = () => run(0.01).parts[led.id].i > 0.005;
    s.setLive(s1.id, "on", false);
    s.setLive(s2.id, "on", false);
    expect(lit()).toBe(false);
    s.setLive(s1.id, "on", true);
    expect(lit()).toBe(false);
    s.setLive(s2.id, "on", true);
    expect(lit()).toBe(true);
    s.setLive(s1.id, "on", false);
    expect(lit()).toBe(false);
  });

  it("DHT22: the DHT library reads the temperature and humidity set on the sensor", async () => {
    const b = uno();
    const dht = part("dht22", 0, { temp: -3.4, humidity: 61.7 });
    const wires = [w([dht, "VCC"], [b, "5V"]), w([dht, "GND"], [b, "GND1"]), w([dht, "DATA"], [b, "D2"])];
    const code = '#include <DHT.h>\nDHT dht(2, DHT22);\nvoid setup(){Serial.begin(115200);dht.begin();delay(2100);Serial.print(dht.readTemperature(),1);Serial.print(" ");Serial.println(dht.readHumidity(),1);}\nvoid loop(){}\n';
    const { run, serial } = await sim([b, dht], wires, code);
    run(2.4, 0.05);
    expect(serial().trim()).toBe("-3.4 61.7");
  });

  it("DHT11: whole numbers through the same protocol", async () => {
    const b = uno();
    const dht = part("dht11", 0, { temp: 27, humidity: 38 });
    const wires = [w([dht, "VCC"], [b, "5V"]), w([dht, "GND"], [b, "GND1"]), w([dht, "DATA"], [b, "D4"])];
    const code = '#include <DHT.h>\nDHT dht(4, DHT11);\nvoid setup(){Serial.begin(115200);dht.begin();delay(2100);Serial.print(dht.readTemperature(),0);Serial.print(" ");Serial.println(dht.readHumidity(),0);}\nvoid loop(){}\n';
    const { run, serial } = await sim([b, dht], wires, code);
    run(2.4, 0.05);
    expect(serial().trim()).toBe("27 38");
  });

  it("PIR: OUT follows motion and holds for the hold time", async () => {
    const b = uno();
    const pir = part("pir", 0, { hold: 1 });
    const wires = [w([pir, "VCC"], [b, "5V"]), w([pir, "GND"], [b, "GND1"]), w([pir, "OUT"], [b, "D3"])];
    const code = "void setup(){pinMode(3,INPUT);}\nvoid loop(){}\n";
    const { s, run } = await sim([b, pir], wires, code);
    run(0.1);
    expect(s.pinVoltage(b.id, "D3")).toBeLessThan(0.5);
    s.setLive(pir.id, "motion", true);
    run(0.1);
    expect(s.pinVoltage(b.id, "D3")).toBeCloseTo(3.3, 1);
    s.setLive(pir.id, "motion", false);
    run(0.5);
    expect(s.pinVoltage(b.id, "D3")).toBeCloseTo(3.3, 1);
    run(0.7);
    expect(s.pinVoltage(b.id, "D3")).toBeLessThan(0.5);
  });

  it("joystick, soil and line sensors feed the ADC; the IR sensor pulls OUT low", async () => {
    const b = uno();
    const joy = part("joystick", 0, { x: 0.25, y: 0.75 });
    const soil = part("soil", 0, { moisture: 100 });
    const ir = part("ir-obstacle", 0, { obstacle: true });
    const wires = [
      w([joy, "+5V"], [b, "5V"]),
      w([joy, "GND"], [b, "GND1"]),
      w([joy, "VRx"], [b, "A0"]),
      w([joy, "VRy"], [b, "A1"]),
      w([soil, "VCC"], [b, "5V"]),
      w([soil, "GND"], [b, "GND2"]),
      w([soil, "A0"], [b, "A2"]),
      w([ir, "VCC"], [b, "5V"]),
      w([ir, "GND"], [b, "GND3"]),
      w([ir, "OUT"], [b, "D8"]),
    ];
    const code = 'void setup(){Serial.begin(115200);delay(50);Serial.print(analogRead(A0));Serial.print(" ");Serial.print(analogRead(A1));Serial.print(" ");Serial.print(analogRead(A2));Serial.print(" ");Serial.println(digitalRead(8));}\nvoid loop(){}\n';
    const { run, serial } = await sim([b, joy, soil, ir], wires, code);
    run(0.2);
    const [x, y, m, d8] = serial().trim().split(" ").map(Number);
    expect(x).toBeGreaterThan(240);
    expect(x).toBeLessThan(270);
    expect(y).toBeGreaterThan(750);
    expect(y).toBeLessThan(785);
    // Soaked soil: about 30 % of VCC.
    expect(m).toBeGreaterThan(280);
    expect(m).toBeLessThan(340);
    expect(d8).toBe(0);
  });
});
