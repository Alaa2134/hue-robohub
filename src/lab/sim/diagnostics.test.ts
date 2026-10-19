import { describe, expect, it } from "vitest";
import { emptyDoc, type CircuitDoc, type PartInstance, type Wire } from "../circuit/model";
import { checkCircuit, diagHelp, diagText, partLabels } from "./diagnostics";

let n = 0;
const part = (type: string, x: number, props: PartInstance["props"] = {}): PartInstance => ({ id: `${type}${n++}`, type, x, y: 0, rot: 0, props });
const wire = (a: [PartInstance, string], b: [PartInstance, string]): Wire => ({ id: `w${n++}`, a: { part: a[0].id, pin: a[1] }, b: { part: b[0].id, pin: b[1] }, pts: [], color: "#fff" });
const doc = (parts: PartInstance[], wires: Wire[], code = "void setup(){}\nvoid loop(){}\n"): CircuitDoc => ({ ...emptyDoc(), parts, wires, files: [{ name: "sketch.ino", text: code }] });
const codes = (d: CircuitDoc) => checkCircuit(d).map((x) => x.code);

describe("wiring checks", () => {
  const uno = () => part("arduino-uno", 0);

  it("an LED straight from a pin to ground needs a resistor", () => {
    const b = uno();
    const led = part("led", 600);
    const d = doc([b, led], [wire([b, "D13"], [led, "A"]), wire([led, "K"], [b, "GND1"])]);
    expect(codes(d)).toContain("led_no_resistor");
    const r = part("resistor", 800);
    const ok = doc([b, led, r], [wire([b, "D13"], [r, "1"]), wire([r, "2"], [led, "A"]), wire([led, "K"], [b, "GND1"])]);
    expect(codes(ok)).not.toContain("led_no_resistor");
  });

  it("a backwards LED is flagged", () => {
    const b = uno();
    const led = part("led", 600);
    const r = part("resistor", 800);
    const d = doc([b, led, r], [wire([b, "5V"], [r, "1"]), wire([r, "2"], [led, "K"]), wire([b, "5V"], [led, "K"]), wire([led, "A"], [b, "GND2"])]);
    expect(codes(d)).toContain("led_reversed");
  });

  it("5V wired to GND is a short; a 9 V battery on the 5V pin is over-voltage, on VIN it's fine", () => {
    const b = uno();
    expect(codes(doc([b], [wire([b, "5V"], [b, "GND1"])]))).toContain("rail_short");
    const bat = part("battery-9v", 600);
    const bad = checkCircuit(doc([b, bat], [wire([bat, "-"], [b, "GND1"]), wire([bat, "+"], [b, "5V"])]));
    expect(bad.find((x) => x.code === "overvoltage")).toMatchObject({ part: bat.id, pin: "5V", detail: { v: 9, max: 5.5 } });
    expect(codes(doc([b, bat], [wire([bat, "-"], [b, "GND1"]), wire([bat, "+"], [b, "VIN"])]))).not.toContain("overvoltage");
  });

  it("two batteries in series are not a short", () => {
    const a = part("battery-aa", 0);
    const c = part("battery-aa", 400);
    const motor = part("dc-motor", 800);
    const d = doc([a, c, motor], [wire([a, "+"], [c, "-"]), wire([c, "+"], [motor, "1"]), wire([motor, "2"], [a, "-"])]);
    expect(codes(d)).not.toContain("rail_short");
  });

  it("joined board pins, a floating button input and a duplicate wire", () => {
    const b = uno();
    const btn = part("pushbutton", 600);
    const d = doc([b, btn], [wire([b, "D3"], [b, "D5"]), wire([b, "D2"], [btn, "1a"]), wire([btn, "2a"], [b, "GND1"]), wire([btn, "2a"], [b, "GND1"])], "void setup(){ pinMode(2, INPUT); }\nvoid loop(){}\n");
    const c = codes(d);
    expect(c).toContain("pins_joined");
    expect(c).toContain("floating_input");
    expect(c).toContain("duplicate_wire");
    const pulled = doc(d.parts, d.wires, "void setup(){ pinMode(2, INPUT_PULLUP); }\nvoid loop(){}\n");
    expect(codes(pulled)).not.toContain("floating_input");
  });

  it("every finding reads as a sentence, and the serious ones say how to fix them", () => {
    const b = uno();
    const led = part("led", 600);
    const d = doc([b, led], [wire([b, "D13"], [led, "A"]), wire([led, "K"], [b, "GND1"]), wire([b, "5V"], [b, "GND2"])]);
    const l = (x: { en: string }) => x.en;
    const labels = partLabels(d, l);
    for (const f of checkCircuit(d)) {
      const text = diagText(f, l, labels);
      expect(text).not.toMatch(/\{|\}/);
      if (f.level !== "info") expect(diagHelp(f, l).fix, f.code).toBeTruthy();
    }
  });
});
