import { describe, expect, it } from "vitest";
import { exampleBySlug } from "../examples";
import { bom, bomCsv, eng, guideHtml, partNames, wiring } from "./bom";
import type { L } from "./parts";

const en = (x: L) => x.en;

describe("build it for real", () => {
  it("formats values like a parts shop", () => {
    expect(eng(220, "Ω")).toBe("220 Ω");
    expect(eng(4700, "Ω")).toBe("4.7 kΩ");
    expect(eng(0.0001, "F")).toBe("100 µF");
  });

  it("the traffic light's parts: one board, three 220 Ω resistors, one LED of each colour, and its wires", () => {
    const doc = exampleBySlug("traffic-light")!.doc;
    const lines = bom(doc, en);
    const res = lines.find((x) => x.type === "resistor")!;
    expect(res.qty).toBe(3);
    expect(res.spec).toBe("220 Ω");
    const leds = lines.filter((x) => x.type === "led");
    expect(leds.map((x) => x.qty)).toEqual([1, 1, 1]);
    expect(new Set(leds.map((x) => x.spec)).size).toBe(3);
    expect(lines.find((x) => x.type === "arduino-uno")?.qty).toBe(1);
    expect(lines.at(-1)).toMatchObject({ type: "wire", qty: doc.wires.length });
    expect(bomCsv(lines, en).split("\r\n")).toHaveLength(lines.length + 1);
  });

  it("wiring steps follow the canvas wires, with numbered names for repeated parts", () => {
    const doc = exampleBySlug("traffic-light")!.doc;
    const names = partNames(doc, en);
    expect([...names.values()]).toContain("LED 2");
    const steps = wiring(doc, en);
    expect(steps).toHaveLength(doc.wires.length);
    expect(steps[0].from).toMatch(/Arduino|Breadboard|LED|Resistor/);
    const html = guideHtml({ title: "Traffic <light>", description: "", svg: null, lines: bom(doc, en), steps, code: "void setup(){}", lang: "en", l: en });
    expect(html).toContain("Traffic &lt;light&gt;");
    expect(html).toContain("void setup(){}");
  });
});
