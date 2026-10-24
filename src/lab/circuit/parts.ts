/**
 * The part catalog: what each part is called, where its pins are (local units, 10 = 0.1 inch, so legs
 * drop into breadboard holes), which pins are joined inside the part, its settings, and how far the
 * simulator models it. Drawing lives in render.tsx; electrical behaviour in ../sim/devices.ts.
 */
import type { PartInstance, Rot } from "./model";
import { MODULE_PARTS, modulePinRole } from "./parts-modules";

export type L = { en: string; ar: string };
/**
 * sim: modelled electrically/behaviourally. partial: simulated, but part of its behaviour is set by
 * hand or approximated (stated in its note). visual: placed and wired, not simulated (marked in the UI).
 */
export type Support = "sim" | "partial" | "visual";
export type PinDef = { name: string; x: number; y: number; label?: string };
export type PropDef =
  | { key: string; label: L; type: "number"; unit?: string; min?: number; max?: number; step?: number; presets?: number[]; live?: boolean }
  | { key: string; label: L; type: "select"; options: { value: string; label: L }[]; live?: boolean }
  | { key: string; label: L; type: "bool"; live?: boolean };
export type Category = "boards" | "breadboards" | "basic" | "input" | "output" | "displays" | "semis" | "logic" | "sensors" | "motors" | "power" | "instruments";

export type PartDef = {
  type: string;
  name: L;
  category: Category;
  support: Support;
  /** What the model covers and leaves out (shown in the inspector). */
  note?: L;
  box: { x: number; y: number; w: number; h: number };
  pins: (p: PartInstance["props"]) => PinDef[];
  /** Pins joined inside the part (zero ohms). */
  internal?: (p: PartInstance["props"]) => string[][];
  defaults: PartInstance["props"];
  props: PropDef[];
  mcu?: "uno" | "nano";
  keywords?: string;
};

export const CATEGORIES: { key: Category; label: L }[] = [
  { key: "boards", label: { en: "Boards", ar: "البوردات" } },
  { key: "breadboards", label: { en: "Breadboards", ar: "البريدبورد" } },
  { key: "basic", label: { en: "Basic", ar: "أساسيات" } },
  { key: "input", label: { en: "Input", ar: "إدخال" } },
  { key: "output", label: { en: "Output", ar: "إخراج" } },
  { key: "displays", label: { en: "Displays", ar: "شاشات" } },
  { key: "semis", label: { en: "Semiconductors", ar: "أشباه موصلات" } },
  { key: "logic", label: { en: "Logic chips", ar: "شرائح منطقية" } },
  { key: "sensors", label: { en: "Sensors", ar: "حساسات" } },
  { key: "motors", label: { en: "Motors", ar: "موتورات" } },
  { key: "power", label: { en: "Power", ar: "باور" } },
  { key: "instruments", label: { en: "Instruments", ar: "أجهزة قياس" } },
];

const row = (names: string[], x0: number, y: number, step = 10): PinDef[] => names.map((name, i) => ({ name, x: x0 + i * step, y }));
const two = (a: string, b: string, gap: number): PinDef[] => [
  { name: a, x: 0, y: 0 },
  { name: b, x: gap, y: 0 },
];

/* ─── Boards ───────────────────────────────────────────────────────────── */

const UNO_TOP = [...row(["SCL", "SDA", "AREF", "GND1", "D13", "D12", "D11", "D10", "D9", "D8"], 100, 10), ...row(["D7", "D6", "D5", "D4", "D3", "D2", "D1", "D0"], 200, 10)];
const UNO_BOTTOM = [...row(["IOREF", "RESET", "3V3", "5V", "GND2", "GND3", "VIN"], 100, 200), ...row(["A0", "A1", "A2", "A3", "A4", "A5"], 180, 200)];
const NANO_TOP = row(["D12", "D11", "D10", "D9", "D8", "D7", "D6", "D5", "D4", "D3", "D2", "GND1", "RST1", "D0", "D1"], 10, 10);
const NANO_BOTTOM = row(["D13", "3V3", "AREF", "A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "5V", "RST2", "GND2", "VIN"], 10, 70);

/** Arduino pin name → ATmega328P port and bit. */
export const AVR_PINS: Record<string, { port: "B" | "C" | "D"; bit: number; adc?: number; pwm?: boolean }> = {
  D0: { port: "D", bit: 0 }, D1: { port: "D", bit: 1 }, D2: { port: "D", bit: 2 }, D3: { port: "D", bit: 3, pwm: true },
  D4: { port: "D", bit: 4 }, D5: { port: "D", bit: 5, pwm: true }, D6: { port: "D", bit: 6, pwm: true }, D7: { port: "D", bit: 7 },
  D8: { port: "B", bit: 0 }, D9: { port: "B", bit: 1, pwm: true }, D10: { port: "B", bit: 2, pwm: true }, D11: { port: "B", bit: 3, pwm: true },
  D12: { port: "B", bit: 4 }, D13: { port: "B", bit: 5 },
  A0: { port: "C", bit: 0, adc: 0 }, A1: { port: "C", bit: 1, adc: 1 }, A2: { port: "C", bit: 2, adc: 2 },
  A3: { port: "C", bit: 3, adc: 3 }, A4: { port: "C", bit: 4, adc: 4 }, A5: { port: "C", bit: 5, adc: 5 },
};
/** Analog-only inputs of the Nano (no digital port). */
export const ADC_ONLY: Record<string, number> = { A6: 6, A7: 7 };

/* ─── Breadboards ──────────────────────────────────────────────────────── */

export const BB_ROWS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] as const;
const BB_ROW_Y: Record<string, number> = { tp: 10, tn: 20, a: 50, b: 60, c: 70, d: 80, e: 90, f: 120, g: 130, h: 140, i: 150, j: 160, bn: 190, bp: 200 };
export function breadboardPins(cols: number): PinDef[] {
  const out: PinDef[] = [];
  for (let c = 1; c <= cols; c++) {
    const x = 10 + c * 10;
    for (const r of Object.keys(BB_ROW_Y)) out.push({ name: `${r}${c}`, x, y: BB_ROW_Y[r] });
  }
  return out;
}
function breadboardInternal(cols: number): string[][] {
  const groups: string[][] = [];
  for (let c = 1; c <= cols; c++) {
    groups.push(["a", "b", "c", "d", "e"].map((r) => `${r}${c}`));
    groups.push(["f", "g", "h", "i", "j"].map((r) => `${r}${c}`));
  }
  for (const r of ["tp", "tn", "bp", "bn"]) groups.push(Array.from({ length: cols }, (_, i) => `${r}${i + 1}`));
  return groups;
}
export const bbCols = (type: string) => (type === "breadboard" ? 63 : type === "breadboard-half" ? 30 : 17);

/* ─── Values ───────────────────────────────────────────────────────────── */

export const LED_COLORS: Record<string, { vf: number; fill: string; glow: string; label: L }> = {
  red: { vf: 1.8, fill: "#c81e1e", glow: "#ff3b30", label: { en: "Red", ar: "أحمر" } },
  green: { vf: 2.1, fill: "#15803d", glow: "#3cff6a", label: { en: "Green", ar: "أخضر" } },
  yellow: { vf: 2.0, fill: "#ca8a04", glow: "#ffe54a", label: { en: "Yellow", ar: "أصفر" } },
  orange: { vf: 2.0, fill: "#c2410c", glow: "#ff9a3c", label: { en: "Orange", ar: "برتقالي" } },
  blue: { vf: 3.0, fill: "#1d4ed8", glow: "#4aa8ff", label: { en: "Blue", ar: "أزرق" } },
  white: { vf: 3.0, fill: "#d4d4d8", glow: "#ffffff", label: { en: "White", ar: "أبيض" } },
};
const colorOptions = Object.entries(LED_COLORS).map(([value, c]) => ({ value, label: c.label }));
const RES_PRESETS = [10, 47, 100, 150, 220, 330, 470, 680, 1000, 2200, 4700, 10000, 22000, 47000, 100000, 1000000];

const L = (en: string, ar: string): L => ({ en, ar });

export const PARTS: PartDef[] = [
  {
    type: "arduino-uno",
    name: L("Arduino Uno R3", "أردوينو أونو R3"),
    category: "boards",
    support: "sim",
    note: L("Real ATmega328P at 16 MHz running your compiled program: GPIO, PWM (timers 0-2), ADC, USART serial, interrupts.", "معالج ATmega328P حقيقي بسرعة 16 ميجا بيشغّل البرنامج بعد الكومبايل: المداخل والمخارج، PWM، ADC، السيريال والإنتربت."),
    box: { x: 0, y: 0, w: 280, h: 210 },
    pins: () => [...UNO_TOP, ...UNO_BOTTOM],
    internal: () => [["GND1", "GND2", "GND3"], ["SDA", "A4"], ["SCL", "A5"]],
    defaults: {},
    props: [],
    mcu: "uno",
    keywords: "arduino uno atmega328p microcontroller board",
  },
  {
    type: "arduino-nano",
    name: L("Arduino Nano", "أردوينو نانو"),
    category: "boards",
    support: "sim",
    note: L("Same ATmega328P as the Uno; A6 and A7 are analog inputs only.", "نفس معالج الأونو؛ A6 وA7 مداخل أنالوج بس."),
    box: { x: 0, y: 0, w: 160, h: 80 },
    pins: () => [...NANO_TOP, ...NANO_BOTTOM],
    internal: () => [["GND1", "GND2"], ["RST1", "RST2"]],
    defaults: {},
    props: [],
    mcu: "nano",
    keywords: "arduino nano atmega328p",
  },
  {
    type: "breadboard",
    name: L("Breadboard (830)", "بريدبورد كبيرة (830)"),
    category: "breadboards",
    support: "sim",
    box: { x: 0, y: 0, w: 660, h: 210 },
    pins: () => breadboardPins(63),
    internal: () => breadboardInternal(63),
    defaults: {},
    props: [],
    keywords: "breadboard full 830",
  },
  {
    type: "breadboard-half",
    name: L("Half breadboard (400)", "نص بريدبورد (400)"),
    category: "breadboards",
    support: "sim",
    box: { x: 0, y: 0, w: 330, h: 210 },
    pins: () => breadboardPins(30),
    internal: () => breadboardInternal(30),
    defaults: {},
    props: [],
    keywords: "breadboard half 400",
  },
  {
    type: "breadboard-mini",
    name: L("Mini breadboard (170)", "بريدبورد صغيرة (170)"),
    category: "breadboards",
    support: "sim",
    box: { x: 0, y: 30, w: 200, h: 150 },
    pins: () => breadboardPins(17).filter((p) => p.y > 30 && p.y < 180),
    internal: () => breadboardInternal(17).slice(0, 34),
    defaults: {},
    props: [],
    keywords: "breadboard mini 170",
  },
  {
    type: "resistor",
    name: L("Resistor", "مقاومة"),
    category: "basic",
    support: "sim",
    box: { x: -4, y: -6, w: 48, h: 12 },
    pins: () => two("1", "2", 40),
    defaults: { r: 220 },
    props: [{ key: "r", label: L("Resistance", "المقاومة"), type: "number", unit: "Ω", min: 0.1, max: 1e8, presets: RES_PRESETS }],
    keywords: "resistor ohm",
  },
  {
    type: "led",
    name: L("LED", "ليد"),
    category: "output",
    support: "sim",
    note: L("Forward voltage by colour with a series resistance; brightness follows the real (averaged) current. Over 30 mA is flagged.", "فولت التشغيل حسب اللون؛ الإضاءة على حسب التيار الحقيقي. أكتر من 30 مللي أمبير بيتعلّم عليه."),
    box: { x: -6, y: -34, w: 22, h: 38 },
    pins: () => [
      { name: "A", x: 0, y: 0, label: "+" },
      { name: "K", x: 10, y: 0, label: "−" },
    ],
    defaults: { color: "red" },
    props: [{ key: "color", label: L("Colour", "اللون"), type: "select", options: colorOptions }],
    keywords: "led light diode",
  },
  {
    type: "rgb-led",
    name: L("RGB LED", "ليد RGB"),
    category: "output",
    support: "sim",
    box: { x: -6, y: -34, w: 42, h: 38 },
    pins: () => row(["R", "COM", "G", "B"], 0, 0),
    defaults: { common: "cathode" },
    props: [
      {
        key: "common",
        label: L("Common pin", "الطرف المشترك"),
        type: "select",
        options: [
          { value: "cathode", label: L("Cathode (−)", "كاثود (−)") },
          { value: "anode", label: L("Anode (+)", "أنود (+)") },
        ],
      },
    ],
    keywords: "rgb led colour",
  },
  {
    type: "pushbutton",
    name: L("Push button", "زرار ضغط"),
    category: "input",
    support: "sim",
    note: L("Legs on the same side (1a-1b, 2a-2b) are always joined; pressing joins 1 to 2.", "الرجلين اللي في نفس الناحية متوصلين دايمًا؛ الضغط بيوصّل 1 بـ 2."),
    box: { x: -6, y: -6, w: 32, h: 42 },
    pins: () => [
      { name: "1a", x: 0, y: 0 },
      { name: "1b", x: 0, y: 30 },
      { name: "2a", x: 20, y: 0 },
      { name: "2b", x: 20, y: 30 },
    ],
    internal: () => [["1a", "1b"], ["2a", "2b"]],
    defaults: {},
    props: [],
    keywords: "button push tactile switch",
  },
  {
    type: "slide-switch",
    name: L("Slide switch", "سويتش"),
    category: "input",
    support: "sim",
    box: { x: -6, y: -20, w: 32, h: 24 },
    pins: () => row(["A", "C", "B"], 0, 0),
    defaults: { on: false },
    props: [{ key: "on", label: L("Switched to B", "على B"), type: "bool", live: true }],
    keywords: "switch slide spdt toggle",
  },
  {
    type: "potentiometer",
    name: L("Potentiometer", "بوتنشوميتر"),
    category: "input",
    support: "sim",
    box: { x: -8, y: -42, w: 36, h: 46 },
    pins: () => row(["1", "W", "2"], 0, 0),
    defaults: { r: 10000, pos: 0.5 },
    props: [
      { key: "r", label: L("Resistance", "المقاومة"), type: "number", unit: "Ω", min: 100, max: 1e6, presets: [1000, 5000, 10000, 50000, 100000] },
      { key: "pos", label: L("Knob", "المؤشر"), type: "number", min: 0, max: 1, step: 0.01, live: true },
    ],
    keywords: "potentiometer pot knob variable resistor",
  },
  {
    type: "capacitor",
    name: L("Capacitor", "مكثف"),
    category: "basic",
    support: "sim",
    note: L("The solver is DC: a capacitor is an open circuit (charging over time isn't modelled).", "الحساب DC: المكثف بيتعامل كدايرة مفتوحة (الشحن مع الوقت مش متمثّل)."),
    box: { x: -6, y: -26, w: 22, h: 30 },
    pins: () => [
      { name: "+", x: 0, y: 0, label: "+" },
      { name: "-", x: 10, y: 0, label: "−" },
    ],
    defaults: { c: 100e-9, polar: false },
    props: [
      { key: "c", label: L("Capacitance", "السعة"), type: "number", unit: "F", min: 1e-12, max: 1, presets: [1e-11, 1e-9, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3] },
      { key: "polar", label: L("Electrolytic", "إلكتروليتي"), type: "bool" },
    ],
    keywords: "capacitor cap",
  },
  {
    type: "diode",
    name: L("Diode 1N4007", "دايود 1N4007"),
    category: "semis",
    support: "sim",
    box: { x: -4, y: -6, w: 48, h: 12 },
    pins: () => two("A", "K", 40),
    defaults: {},
    props: [],
    keywords: "diode rectifier 1n4007",
  },
  {
    type: "npn",
    name: L("NPN transistor 2N2222", "ترانزستور NPN ‏2N2222"),
    category: "semis",
    support: "sim",
    note: L("Piecewise-linear model: cut-off, active (β·Ib) and saturation (Vce ≈ 0.2 V).", "موديل خطي على مراحل: قطع، تكبير (β·Ib) وتشبّع."),
    box: { x: -6, y: -28, w: 32, h: 32 },
    pins: () => row(["E", "B", "C"], 0, 0),
    defaults: { beta: 150 },
    props: [{ key: "beta", label: L("Gain (β)", "الكسب (β)"), type: "number", min: 10, max: 1000 }],
    keywords: "transistor npn bjt 2n2222",
  },
  {
    type: "pnp",
    name: L("PNP transistor 2N3906", "ترانزستور PNP ‏2N3906"),
    category: "semis",
    support: "sim",
    box: { x: -6, y: -28, w: 32, h: 32 },
    pins: () => row(["E", "B", "C"], 0, 0),
    defaults: { beta: 150 },
    props: [{ key: "beta", label: L("Gain (β)", "الكسب (β)"), type: "number", min: 10, max: 1000 }],
    keywords: "transistor pnp bjt 2n3906",
  },
  {
    type: "nmos",
    name: L("N-MOSFET IRLZ44N", "موسفت N ‏IRLZ44N"),
    category: "semis",
    support: "sim",
    note: L("Switch model: on (Rds 25 mΩ) above Vgs 2 V.", "موديل سويتش: بيشتغل لما Vgs تعدّي 2 فولت."),
    box: { x: -8, y: -40, w: 36, h: 44 },
    pins: () => row(["G", "D", "S"], 0, 0),
    defaults: {},
    props: [],
    keywords: "mosfet transistor n-channel irlz44n",
  },
  {
    type: "buzzer",
    name: L("Buzzer", "بازر"),
    category: "output",
    support: "sim",
    note: L("Active: sounds on DC. Passive: plays the frequency your program toggles (tone()).", "أكتيف: بيصفّر على DC. باسيف: بيطلع التردد اللي البرنامج بيعمله (tone())."),
    box: { x: -10, y: -34, w: 40, h: 38 },
    pins: () => [
      { name: "+", x: 0, y: 0, label: "+" },
      { name: "-", x: 20, y: 0, label: "−" },
    ],
    defaults: { active: false },
    props: [{ key: "active", label: L("Active (built-in oscillator)", "أكتيف (فيه أوسيليتور)"), type: "bool" }],
    keywords: "buzzer piezo sound tone speaker",
  },
  {
    type: "servo",
    name: L("Servo SG90", "سيرفو SG90"),
    category: "motors",
    support: "sim",
    note: L("Angle from the measured pulse width (544–2400 µs → 0–180°), needs power on V+.", "الزاوية من عرض النبضة المقاس (544–2400 ميكروثانية)، ومحتاج باور على V+."),
    box: { x: -48, y: -150, w: 132, h: 158 },
    pins: () => row(["GND", "V+", "SIG"], 0, 0),
    defaults: {},
    props: [],
    keywords: "servo motor sg90",
  },
  {
    type: "dc-motor",
    name: L("DC motor", "موتور DC"),
    category: "motors",
    support: "sim",
    note: L("Electrically a 10 Ω winding; speed shown in proportion to its voltage (no load or inertia).", "كهربيًا ملف 10 أوم؛ السرعة على قد الفولت (من غير حمل أو قصور)."),
    box: { x: -22, y: -150, w: 84, h: 156 },
    pins: () => two("+", "-", 20),
    defaults: { rated: 6 },
    props: [{ key: "rated", label: L("Rated voltage", "الفولت المقنن"), type: "number", unit: "V", min: 1, max: 24 }],
    keywords: "motor dc",
  },
  {
    type: "battery-9v",
    name: L("9V battery", "بطارية 9 فولت"),
    category: "power",
    support: "sim",
    box: { x: -14, y: -228, w: 110, h: 234 },
    pins: () => two("+", "-", 20),
    defaults: { v: 9 },
    props: [],
    keywords: "battery 9v power",
  },
  {
    type: "battery-aa",
    name: L("AA battery pack", "بطاريات AA"),
    category: "power",
    support: "sim",
    box: { x: -50, y: -258, w: 140, h: 264 },
    pins: () => two("+", "-", 40),
    defaults: { cells: 2 },
    props: [{ key: "cells", label: L("Cells (1.5 V each)", "عدد الخلايا (1.5 فولت)"), type: "number", min: 1, max: 8, step: 1 }],
    keywords: "battery aa pack",
  },
  {
    type: "power-supply",
    name: L("Bench power supply", "باور سبلاي"),
    category: "power",
    support: "sim",
    box: { x: -70, y: -200, w: 240, h: 206 },
    pins: () => two("+", "-", 50),
    defaults: { v: 5 },
    props: [{ key: "v", label: L("Voltage", "الفولت"), type: "number", unit: "V", min: 0, max: 30, step: 0.1 }],
    keywords: "power supply bench dc voltage",
  },
  {
    type: "ldr",
    name: L("Photoresistor (LDR)", "حساس ضوء (LDR)"),
    category: "sensors",
    support: "sim",
    note: L("GL5528-style curve: about 10 kΩ at 10 lux, 1 MΩ in the dark.", "منحنى زي GL5528: حوالي 10 كيلو عند 10 لوكس، و1 ميجا في الضلمة."),
    box: { x: -6, y: -24, w: 22, h: 28 },
    pins: () => two("1", "2", 10),
    defaults: { lux: 300 },
    props: [{ key: "lux", label: L("Light", "الإضاءة"), type: "number", unit: "lux", min: 0, max: 10000, live: true }],
    keywords: "ldr photoresistor light sensor",
  },
  {
    type: "thermistor",
    name: L("NTC thermistor 10k", "ثيرمستور NTC ‏10k"),
    category: "sensors",
    support: "sim",
    note: L("Beta model: 10 kΩ at 25 °C, β = 3950.", "موديل بيتا: 10 كيلو عند 25 درجة، β = 3950."),
    box: { x: -6, y: -24, w: 22, h: 28 },
    pins: () => two("1", "2", 10),
    defaults: { temp: 25 },
    props: [{ key: "temp", label: L("Temperature", "الحرارة"), type: "number", unit: "°C", min: -40, max: 125, live: true }],
    keywords: "thermistor ntc temperature sensor",
  },
  {
    type: "hc-sr04",
    name: L("Ultrasonic HC-SR04", "ألتراسونيك HC-SR04"),
    category: "sensors",
    support: "sim",
    note: L("Answers a ≥10 µs TRIG pulse with an ECHO pulse of 58 µs per cm, timed in CPU cycles; needs 5 V.", "بيرد على نبضة TRIG ‏(10 ميكرو أو أكتر) بنبضة ECHO طولها 58 ميكرو لكل سنتي، متوقّتة بدورات المعالج؛ محتاج 5 فولت."),
    box: { x: -76, y: -60, w: 184, h: 66 },
    pins: () => row(["VCC", "TRIG", "ECHO", "GND"], 0, 0),
    defaults: { cm: 50 },
    props: [{ key: "cm", label: L("Distance", "المسافة"), type: "number", unit: "cm", min: 2, max: 400, live: true }],
    keywords: "ultrasonic distance sonar hc-sr04",
  },
  {
    type: "voltmeter",
    name: L("Voltmeter", "فولتميتر"),
    category: "instruments",
    support: "sim",
    note: L("Reads the solved voltage between its probes (averaged over each frame).", "بيقرا الفولت المحسوب بين طرفيه (متوسط كل فريم)."),
    box: { x: -66, y: -318, w: 164, h: 324 },
    pins: () => [
      { name: "V", x: 0, y: 0, label: "V" },
      { name: "COM", x: 30, y: 0, label: "COM" },
    ],
    defaults: {},
    props: [],
    keywords: "voltmeter multimeter meter volt",
  },
  {
    type: "ammeter",
    name: L("Ammeter", "أميتر"),
    category: "instruments",
    support: "sim",
    note: L("Goes in series (10 mΩ) and reads the current through it.", "بيتوصّل على التوالي (10 مللي أوم) وبيقرا التيار اللي معدّي فيه."),
    box: { x: -66, y: -318, w: 164, h: 324 },
    pins: () => [
      { name: "IN", x: 0, y: 0, label: "+" },
      { name: "OUT", x: 30, y: 0, label: "−" },
    ],
    defaults: {},
    props: [],
    keywords: "ammeter multimeter meter current amp",
  },
];

PARTS.push(...MODULE_PARTS);
export const PART_BY_TYPE = new Map(PARTS.map((p) => [p.type, p]));

export function rotate(x: number, y: number, rot: Rot): [number, number] {
  switch (rot) {
    case 90:
      return [-y, x];
    case 180:
      return [-x, -y];
    case 270:
      return [y, -x];
    default:
      return [x, y];
  }
}

/** Where a part's pins are on the canvas. */
export function worldPins(p: PartInstance): { name: string; x: number; y: number }[] {
  const def = PART_BY_TYPE.get(p.type);
  if (!def) return [];
  return def.pins({ ...def.defaults, ...p.props }).map((pin) => {
    const [x, y] = rotate(pin.x, pin.y, p.rot);
    return { name: pin.name, x: p.x + x, y: p.y + y };
  });
}

/** Canvas bounding box of a part. */
export function worldBox(p: PartInstance) {
  const def = PART_BY_TYPE.get(p.type);
  const b = def?.box ?? { x: -10, y: -10, w: 20, h: 20 };
  const c = [rotate(b.x, b.y, p.rot), rotate(b.x + b.w, b.y + b.h, p.rot)];
  const x0 = Math.min(c[0][0], c[1][0]);
  const y0 = Math.min(c[0][1], c[1][1]);
  return { x: p.x + x0, y: p.y + y0, w: Math.abs(c[1][0] - c[0][0]), h: Math.abs(c[1][1] - c[0][1]) };
}

export const propsOf = (p: PartInstance) => ({ ...(PART_BY_TYPE.get(p.type)?.defaults ?? {}), ...p.props });

/* ─── Pin roles (hover tooltips, pin colours, wiring checks) ───────────── */

export type PinKind = "power" | "ground" | "digital" | "pwm" | "analog" | "i2c" | "uart" | "spi" | "passive" | "control" | "hole";
export const PIN_COLORS: Record<PinKind, string> = {
  power: "#ff5a5f",
  ground: "#9aa4b2",
  digital: "#3cc4ff",
  pwm: "#b48cff",
  analog: "#ffb547",
  i2c: "#33d69f",
  uart: "#f78fb3",
  spi: "#f5d90a",
  passive: "#cfd6df",
  control: "#63a0ff",
  hole: "#cfd6df",
};

const BOARD_ROLE: Record<string, { kind: PinKind; note: string }> = {
  "5V": { kind: "power", note: "5 V supply (USB)" },
  "3V3": { kind: "power", note: "3.3 V supply, 50 mA max" },
  VIN: { kind: "power", note: "Input to the regulator (7–12 V); unpowered on USB" },
  IOREF: { kind: "power", note: "I/O reference voltage (5 V)" },
  AREF: { kind: "analog", note: "ADC reference input" },
  RESET: { kind: "control", note: "Reset (active low)" },
  RST1: { kind: "control", note: "Reset (active low)" },
  RST2: { kind: "control", note: "Reset (active low)" },
  D0: { kind: "uart", note: "Digital 0 · RX (Serial)" },
  D1: { kind: "uart", note: "Digital 1 · TX (Serial)" },
  D10: { kind: "spi", note: "Digital 10 · PWM · SPI SS" },
  D11: { kind: "spi", note: "Digital 11 · PWM · SPI MOSI" },
  D12: { kind: "spi", note: "Digital 12 · SPI MISO" },
  D13: { kind: "spi", note: "Digital 13 · SPI SCK · on-board LED" },
  A4: { kind: "i2c", note: "Analog 4 · I2C SDA" },
  A5: { kind: "i2c", note: "Analog 5 · I2C SCL" },
  SDA: { kind: "i2c", note: "I2C SDA (same as A4)" },
  SCL: { kind: "i2c", note: "I2C SCL (same as A5)" },
  A6: { kind: "analog", note: "Analog input only" },
  A7: { kind: "analog", note: "Analog input only" },
};

/** What a pin is for: its kind (for colour) and a short description. */
export function pinRole(p: PartInstance, pin: string): { kind: PinKind; note: string } {
  const def = PART_BY_TYPE.get(p.type);
  if (def?.category === "breadboards") return { kind: "hole", note: /^(tp|bp)/.test(pin) ? "+ rail" : /^(tn|bn)/.test(pin) ? "− rail" : `column ${pin.replace(/\D/g, "")}, row ${pin.replace(/\d/g, "")}` };
  if (def?.mcu) {
    if (BOARD_ROLE[pin]) return BOARD_ROLE[pin];
    if (/^GND/.test(pin)) return { kind: "ground", note: "Ground" };
    const m = AVR_PINS[pin];
    if (m?.adc !== undefined) return { kind: "analog", note: `Analog input ${m.adc} · digital ${14 + m.adc}` };
    if (m?.pwm) return { kind: "pwm", note: `Digital ${pin.slice(1)} · PWM (analogWrite)` };
    if (m) return { kind: "digital", note: `Digital ${pin.slice(1)}` };
  }
  const named: Record<string, { kind: PinKind; note: string }> = {
    "led:A": { kind: "passive", note: "Anode (+), the longer leg" },
    "led:K": { kind: "passive", note: "Cathode (−), the flat side" },
    "rgb-led:COM": { kind: "passive", note: "Common pin" },
    "capacitor:+": { kind: "passive", note: "Positive lead" },
    "capacitor:-": { kind: "passive", note: "Negative lead (stripe)" },
    "diode:A": { kind: "passive", note: "Anode" },
    "diode:K": { kind: "passive", note: "Cathode (band)" },
    "potentiometer:W": { kind: "analog", note: "Wiper (middle)" },
    "servo:GND": { kind: "ground", note: "Ground (brown)" },
    "servo:V+": { kind: "power", note: "Power 4.8–6 V (red)" },
    "servo:SIG": { kind: "pwm", note: "Signal pulses (orange)" },
    "hc-sr04:VCC": { kind: "power", note: "5 V" },
    "hc-sr04:GND": { kind: "ground", note: "Ground" },
    "hc-sr04:TRIG": { kind: "digital", note: "Trigger input (10 µs pulse)" },
    "hc-sr04:ECHO": { kind: "digital", note: "Echo output (58 µs per cm)" },
    "npn:B": { kind: "control", note: "Base" },
    "npn:C": { kind: "passive", note: "Collector" },
    "npn:E": { kind: "passive", note: "Emitter" },
    "pnp:B": { kind: "control", note: "Base" },
    "pnp:C": { kind: "passive", note: "Collector" },
    "pnp:E": { kind: "passive", note: "Emitter" },
    "nmos:G": { kind: "control", note: "Gate" },
    "nmos:D": { kind: "passive", note: "Drain" },
    "nmos:S": { kind: "passive", note: "Source" },
  };
  const n = named[`${p.type}:${pin}`] ?? modulePinRole(p.type, pin);
  if (n) return n;
  if (pin === "+" || pin === "V+" || pin === "VCC") return { kind: "power", note: "Positive" };
  if (pin === "-" || pin === "GND" || pin === "COM") return { kind: "ground", note: "Negative" };
  return { kind: "passive", note: `Pin ${pin}` };
}
