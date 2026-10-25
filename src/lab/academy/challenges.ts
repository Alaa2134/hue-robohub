/**
 * Lab challenges: a goal, a circuit to start from (an example's wiring with the code left to write)
 * and a check that runs the learner's own compiled program in the simulator and looks at what it
 * actually does — LED current, serial output, servo angle, buzzer frequency. The checks look for
 * parts by type, so a learner who rewires to other pins still passes. The unit tests run each
 * reference solution (it must pass) and each starter (it must not).
 */
import type { CircuitDoc, PartInstance } from "../circuit/model";
import type { L } from "../circuit/parts";
import { exampleBySlug } from "../examples";
import { F_CPU, Simulation, type Frame } from "../sim/engine";

export type Check = { label: L; ok: boolean; got?: string };
export type Probe = {
  doc: CircuitDoc;
  sim: Simulation;
  /** Run the program for `seconds` of simulated time, one frame every `step`; returns this run's frames. */
  run(seconds: number, step?: number): Frame[];
  serial(): string;
  ids(type: string, where?: (p: PartInstance) => boolean): string[];
};
export type Challenge = {
  slug: string;
  level: 1 | 2 | 3;
  title: L;
  goal: L;
  hints: L[];
  /** The example whose circuit the challenge starts from. */
  base: string;
  /** The sketch the learner starts with. */
  starter: string;
  check(p: Probe): Check[];
};
export type Outcome = { slug: string; passed: boolean; checks: Check[]; seconds: number };

const L = (en: string, ar: string): L => ({ en, ar });
const LED_ON = 0.005;
const r1 = (x: number) => Math.round(x * 10) / 10;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** On/off of one part's current over frames taken every `step`: frequency and duty after `skip` s. */
function blinking(frames: Frame[], id: string, step: number, skip = 0.3) {
  const on = frames.map((f) => (f.parts[id]?.i ?? 0) > LED_ON);
  const from = Math.round(skip / step);
  const rises: number[] = [];
  for (let i = Math.max(1, from); i < on.length; i++) if (on[i] && !on[i - 1]) rises.push(i * step);
  const span = (on.length - from) * step;
  const duty = on.slice(from).filter(Boolean).length / Math.max(1, on.length - from);
  const freq = rises.length >= 2 ? (rises.length - 1) / (rises.at(-1)! - rises[0]) : 0;
  return { any: on.some(Boolean), freq, duty, span };
}

const needs = (ok: boolean, what: L): Check => ({ label: what, ok });

export const CHALLENGES: Challenge[] = [
  {
    slug: "blink-2hz",
    level: 1,
    title: L("Faster blink", "ليد بيرمش أسرع"),
    goal: L("Make the LED blink twice a second: 250 ms on, 250 ms off.", "خلّي الليد يرمش مرتين في الثانية: 250 مللي ثانية منوّر و250 مطفي."),
    hints: [L("pinMode(13, OUTPUT) in setup().", "pinMode(13, OUTPUT) جوه setup()."), L("digitalWrite then delay(250), twice.", "digitalWrite وبعدها delay(250)، مرتين.")],
    base: "blink",
    starter: `
// Faster blink: the LED on pin 13 should blink twice a second (250 ms on, 250 ms off).
void setup() {
  // Set pin 13 as an output.
}

void loop() {
  // Turn it on, wait, turn it off, wait.
}`,
    check(p) {
      const led = p.ids("led")[0];
      if (!led) return [needs(false, L("There's an LED in the circuit", "فيه ليد في الدايرة"))];
      const b = blinking(p.run(3.3, 0.01), led, 0.01);
      return [
        { label: L("The LED lights up", "الليد بينوّر"), ok: b.any },
        { label: L("Blinks 2 times a second", "بيرمش مرتين في الثانية"), ok: Math.abs(b.freq - 2) <= 0.2, got: `${r1(b.freq)} Hz` },
        { label: L("On half the time", "منوّر نص الوقت"), ok: b.duty > 0.4 && b.duty < 0.6, got: pct(b.duty) },
      ];
    },
  },
  {
    slug: "button-hold",
    level: 1,
    title: L("Hold to light", "دوس ونوّر"),
    goal: L("The LED is on only while the button is held down.", "الليد ينوّر بس طول ما الزرار مضغوط."),
    hints: [L("The button pulls pin 2 to GND: use INPUT_PULLUP, pressed reads LOW.", "الزرار بيوصّل بن 2 بالأرضي: استخدم INPUT_PULLUP، والضغط بيقرا LOW.")],
    base: "button-led",
    starter: `
// Hold to light: the LED on pin 13 is on only while the button on pin 2 is pressed.
const int BUTTON = 2;
const int LED = 13;

void setup() {
  // Button with the internal pull-up, LED as an output.
}

void loop() {
  // Read the button and set the LED.
}`,
    check(p) {
      const led = p.ids("led")[0];
      const btn = p.ids("pushbutton")[0];
      if (!led || !btn) return [needs(false, L("There's a button and an LED", "فيه زرار وليد"))];
      const lit = () => (p.run(0.3).at(-1)?.parts[led]?.i ?? 0) > LED_ON;
      const idle = lit();
      p.sim.setLive(btn, "pressed", true);
      const held = lit();
      p.sim.setLive(btn, "pressed", false);
      const after = lit();
      return [
        { label: L("Off before pressing", "مطفي قبل الضغط"), ok: !idle },
        { label: L("On while pressed", "منوّر وهو مضغوط"), ok: held },
        { label: L("Off again after letting go", "يطفي تاني لما تسيبه"), ok: !after },
      ];
    },
  },
  {
    slug: "traffic-cycle",
    level: 2,
    title: L("Traffic light", "إشارة مرور"),
    goal: L("Red 2 s → green 2 s → yellow 1 s, over and over. Never two lights at once.", "أحمر ثانيتين ← أخضر ثانيتين ← أصفر ثانية، وتعيد. عمر ما نورين يولّعوا مع بعض."),
    hints: [L("A helper show(r, y, g, ms) keeps loop() short.", "دالة show(r, y, g, ms) بتخلّي loop() قصيرة.")],
    base: "traffic-light",
    starter: `
// Traffic light: red 2 s, then green 2 s, then yellow 1 s, repeating.
const int RED = 13, YELLOW = 12, GREEN = 11;

void setup() {
  // All three pins are outputs.
}

void loop() {
  // One light at a time.
}`,
    check(p) {
      const by = (c: string) => p.ids("led", (x) => x.props.color === c)[0];
      const [red, yellow, green] = [by("red"), by("yellow"), by("green")];
      if (!red || !yellow || !green) return [needs(false, L("Red, yellow and green LEDs", "ليد أحمر وأصفر وأخضر"))];
      const step = 0.05;
      const frames = p.run(10.2, step);
      const state = frames.map((f) => [red, green, yellow].map((id) => (f.parts[id]?.i ?? 0) > LED_ON));
      const two = state.slice(1).some((s) => s.filter(Boolean).length > 1);
      const seq: number[] = [];
      for (const s of state) {
        const k = s.indexOf(true);
        if (k >= 0 && s.filter(Boolean).length === 1 && seq.at(-1) !== k) seq.push(k);
      }
      const order = seq.length >= 3 && seq.every((k, i) => i === 0 || k === (seq[i - 1] + 1) % 3);
      /** Lengths of the whole times light k was on alone (not the one at the start or one cut off at the end). */
      const runs = (k: number) => {
        const out: number[] = [];
        let from = -1;
        state.forEach((s, i) => {
          const alone = s[k] && s.filter(Boolean).length === 1;
          if (alone && from < 0) from = i;
          if (!alone && from >= 0) {
            if (from > 1) out.push((i - from) * step);
            from = -1;
          }
        });
        return out;
      };
      const redRuns = runs(0);
      const redS = redRuns.length ? redRuns[0] : 0;
      return [
        { label: L("Never two lights at once", "عمر ما نورين مع بعض"), ok: !two },
        { label: L("All three light up", "التلاتة بينوّروا"), ok: new Set(seq).size === 3 },
        { label: L("Order: red → green → yellow", "الترتيب: أحمر ← أخضر ← أصفر"), ok: order },
        { label: L("Red stays about 2 s", "الأحمر بيفضل حوالي ثانيتين"), ok: Math.abs(redS - 2) <= 0.2, got: `${r1(redS)} s` },
      ];
    },
  },
  {
    slug: "dimmer-knob",
    level: 2,
    title: L("Knob dimmer", "تحكم في الإضاءة بالبوتنشوميتر"),
    goal: L("Turn the knob and the LED's brightness follows: knob at zero = LED off.", "لف البوتنشوميتر وإضاءة الليد تمشي معاه: عند الصفر الليد مطفي."),
    hints: [L("analogRead(A0) gives 0–1023, analogWrite(9, …) takes 0–255.", "analogRead(A0) بيدي 0–1023، وanalogWrite(9, …) بياخد 0–255.")],
    base: "potentiometer-dimmer",
    starter: `
// Knob dimmer: the LED on pin 9 gets brighter as the knob on A0 turns up.
void setup() {
  pinMode(9, OUTPUT);
}

void loop() {
  // Read A0, scale it, write it to pin 9.
}`,
    check(p) {
      const led = p.ids("led")[0];
      const pot = p.ids("potentiometer")[0];
      if (!led || !pot) return [needs(false, L("A potentiometer and an LED", "بوتنشوميتر وليد"))];
      const at = (pos: number) => {
        p.sim.setLive(pot, "pos", pos);
        p.run(0.5);
        return (p.run(0.2).at(-1)?.parts[led]?.i ?? 0) * 1000;
      };
      const zero = at(0);
      const low = at(0.25);
      const half = at(0.5);
      const high = at(0.9);
      const mid = high > 0 ? half / high : 0;
      return [
        { label: L("Off with the knob at zero", "مطفي والبوتنشوميتر على الصفر"), ok: zero < 0.3, got: `${r1(zero)} mA` },
        { label: L("Brighter as the knob turns up", "بيزيد كل ما تلف"), ok: low > 0.3 && half > low * 1.3 && high > half * 1.3, got: `${r1(low)} → ${r1(half)} → ${r1(high)} mA` },
        { label: L("Halfway is about half as bright", "في النص نص الإضاءة تقريبًا"), ok: mid > 0.35 && mid < 0.75, got: pct(mid) },
      ];
    },
  },
  {
    slug: "serial-echo",
    level: 1,
    title: L("Talk over serial", "اتكلم على السيريال"),
    goal: L('Print "Hello BuildX" once at the start, then answer every line you receive with "Got: " and the line.', 'اطبع "Hello BuildX" مرة في الأول، وبعدها رد على كل سطر يوصلك بـ "Got: " والسطر.'),
    hints: [L("Serial.begin(9600) first; Serial.readStringUntil('\\n') reads a line.", "Serial.begin(9600) الأول؛ Serial.readStringUntil('\\n') بيقرا سطر.")],
    base: "serial-hello",
    starter: `
// Talk over serial: greet once, then answer each line with "Got: <line>".
void setup() {
  // Start serial at 9600 and greet.
}

void loop() {
  // When a line arrives, answer it.
}`,
    check(p) {
      p.run(0.4);
      const hello = p.serial().includes("Hello BuildX");
      p.sim.serialWrite("robot\n");
      p.run(1.2);
      const echo = /Got: robot/.test(p.serial());
      return [
        { label: L('Says "Hello BuildX"', 'بيقول "Hello BuildX"'), ok: hello },
        { label: L('Answers "robot" with "Got: robot"', 'بيرد على "robot" بـ "Got: robot"'), ok: echo },
      ];
    },
  },
  {
    slug: "night-light",
    level: 2,
    title: L("Night light", "نور الليل"),
    goal: L("The LED turns on when it's dark and off when it's bright.", "الليد ينوّر لما الدنيا تضلّم ويطفي لما تنوّر."),
    hints: [L("Darker = lower analogRead(A0). Pick a threshold around 400.", "كل ما تضلّم analogRead(A0) بيقل. اختار حد حوالي 400.")],
    base: "night-light",
    starter: `
// Night light: the LED on pin 9 turns on in the dark (light sensor on A0).
void setup() {
  pinMode(9, OUTPUT);
}

void loop() {
  // Read the light level and switch the LED.
}`,
    check(p) {
      const led = p.ids("led")[0];
      const ldr = p.ids("ldr")[0];
      if (!led || !ldr) return [needs(false, L("A light sensor and an LED", "حساس ضوء وليد"))];
      const lit = (lux: number) => {
        p.sim.setLive(ldr, "lux", lux);
        return (p.run(0.6).at(-1)?.parts[led]?.i ?? 0) > LED_ON;
      };
      const bright = lit(500);
      const dark = lit(1);
      const again = lit(500);
      return [
        { label: L("Off in bright light", "مطفي في النور"), ok: !bright && !again },
        { label: L("On in the dark", "منوّر في الضلمة"), ok: dark },
      ];
    },
  },
  {
    slug: "servo-sweep",
    level: 2,
    title: L("Servo sweep", "سيرفو بيلف"),
    goal: L("Sweep the servo from 0° to 180° and back, smoothly.", "لف السيرفو من 0° لـ 180° وارجع، بهدوء."),
    hints: [L("#include <Servo.h>, attach(9), then write(angle) in a for loop with a short delay.", "#include <Servo.h>، وattach(9)، وبعدها write(angle) في for loop مع delay صغير.")],
    base: "servo-sweep",
    starter: `
// Servo sweep: 0° → 180° and back on pin 9.
#include <Servo.h>

Servo arm;

void setup() {
  // Attach the servo.
}

void loop() {
  // Sweep up, then down.
}`,
    check(p) {
      const servo = p.ids("servo")[0];
      if (!servo) return [needs(false, L("There's a servo", "فيه سيرفو"))];
      const angles = p
        .run(4, 0.05)
        .map((f) => f.parts[servo]?.angle ?? -1)
        .filter((a) => a >= 0);
      const lo = angles.length ? Math.min(...angles) : 0;
      const hi = angles.length ? Math.max(...angles) : 0;
      let turns = 0;
      for (let i = 2; i < angles.length; i++) if ((angles[i] - angles[i - 1]) * (angles[i - 1] - angles[i - 2]) < 0) turns++;
      return [
        { label: L("Covers 0° to 180°", "بيغطي من 0° لـ 180°"), ok: lo <= 10 && hi >= 170, got: `${Math.round(lo)}°–${Math.round(hi)}°` },
        { label: L("Goes back and forth", "بيروح ويرجع"), ok: turns >= 1 },
      ];
    },
  },
  {
    slug: "buzzer-a4",
    level: 2,
    title: L("Tuning note", "نغمة الضبط"),
    goal: L("Beep the note A (440 Hz) for half a second, then half a second of silence, repeating.", "شغّل نغمة لا (440 هرتز) نص ثانية، وسكوت نص ثانية، وتعيد."),
    hints: [L("tone(8, 440) starts it, noTone(8) stops it.", "tone(8, 440) بتشغّلها، وnoTone(8) بتوقفها.")],
    base: "buzzer-melody",
    starter: `
// Tuning note: 440 Hz for 0.5 s, silence for 0.5 s, on the buzzer on pin 8.
const int BUZZER = 8;

void setup() {}

void loop() {
  // Beep, then rest.
}`,
    check(p) {
      const bz = p.ids("buzzer")[0];
      if (!bz) return [needs(false, L("There's a buzzer", "فيه بازر"))];
      const f = p.run(3, 0.05).map((x) => x.parts[bz]?.freq ?? 0);
      const sounding = f.filter((x) => x > 0);
      const mean = sounding.length ? sounding.reduce((a, b) => a + b, 0) / sounding.length : 0;
      const share = sounding.length / Math.max(1, f.length);
      return [
        { label: L("Plays 440 Hz", "بيشغّل 440 هرتز"), ok: Math.abs(mean - 440) <= 15, got: `${Math.round(mean)} Hz` },
        { label: L("Sound half the time, silence half", "صوت نص الوقت وسكوت نصه"), ok: share > 0.35 && share < 0.65, got: pct(share) },
      ];
    },
  },
  {
    slug: "seg7-seven",
    level: 3,
    title: L("Show a 7", "اعرض رقم 7"),
    goal: L("Show the digit 7 on the 7-segment display (segments a, b and c lit, nothing else).", "اعرض رقم 7 على شاشة السبع أجزاء (الأجزاء a وb وc بس منوّرين)."),
    hints: [L("Segments a…g are on pins 2…8. A 7 is a, b and c.", "الأجزاء a…g على البنات 2…8. رقم 7 هو a وb وc.")],
    base: "seven-segment-counter",
    starter: `
// Show a 7: segments a..g are on pins 2..8 (common cathode: HIGH = lit).
const int SEG[7] = {2, 3, 4, 5, 6, 7, 8};

void setup() {
  // Outputs, then light the segments of a 7.
}

void loop() {}`,
    check(p) {
      const seg = p.ids("seg7")[0];
      if (!seg) return [needs(false, L("There's a 7-segment display", "فيه شاشة سبع أجزاء"))];
      const f = p.run(0.6).at(-1);
      const lit = ["a", "b", "c", "d", "e", "f", "g"].filter((s) => (f?.parts[seg]?.[`i_${s}`] ?? 0) > 0.003).join("");
      return [{ label: L("Shows 7 (a, b, c)", "بيعرض 7 (a وb وc)"), ok: lit === "abc", got: lit || "—" }];
    },
  },
];

export const challengeBySlug = (s: string) => CHALLENGES.find((c) => c.slug === s);

/** The challenge's starting project: its example's circuit with the starter sketch. */
export function starterDoc(ch: Challenge): CircuitDoc {
  const d = structuredClone(exampleBySlug(ch.base)!.doc);
  d.files = [{ name: "sketch.ino", text: `${ch.starter.trim()}\n` }];
  d.main = "sketch.ino";
  return d;
}

export function makeProbe(doc: CircuitDoc, hex: string): Probe {
  const sim = new Simulation(doc, hex);
  const all: Frame[] = [];
  return {
    doc,
    sim,
    run(seconds, step = 0.05) {
      const out: Frame[] = [];
      for (let t = 0; t < seconds - 1e-9; t += step) {
        sim.run(Math.round(step * F_CPU));
        const f = sim.frame(step);
        out.push(f);
        all.push(f);
      }
      return out;
    },
    serial: () => all.map((f) => f.serial).join(""),
    ids: (type, where) => doc.parts.filter((x) => x.type === type && (!where || where(x))).map((x) => x.id),
  };
}

/** Run a challenge's check against a compiled program. */
export function runChallenge(ch: Challenge, doc: CircuitDoc, hex: string): Outcome {
  try {
    const p = makeProbe(doc, hex);
    const errors = p.sim.diagnostics.filter((d) => d.level === "error");
    const checks = [...(errors.length ? [{ label: L("No wiring errors", "مفيش أخطاء توصيل"), ok: false, got: errors.map((e) => e.code).join(", ") }] : []), ...ch.check(p)];
    return { slug: ch.slug, passed: checks.length > 0 && checks.every((c) => c.ok), checks, seconds: Math.round(p.sim.now() * 10) / 10 };
  } catch (e) {
    return { slug: ch.slug, passed: false, checks: [{ label: L("The simulation ran", "المحاكاة اشتغلت"), ok: false, got: String((e as Error)?.message ?? e).slice(0, 120) }], seconds: 0 };
  }
}
