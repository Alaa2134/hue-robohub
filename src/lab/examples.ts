/**
 * Example projects: complete circuits with code that compiles and runs in the simulator (the unit tests
 * build and run every one of them). Opening an example makes the visitor's own copy.
 */
import type { CircuitDoc, PartInstance, Rot, Wire } from "./circuit/model";
import type { L } from "./circuit/parts";

export type Example = { slug: string; title: L; description: L; tags: string[]; level: 1 | 2 | 3; doc: CircuitDoc };

/* ─── Layout helpers: an Uno at 0,0 with a half breadboard above it ────── */

const BB = { x: 0, y: -260 };
const ROW: Record<string, number> = { tp: 10, tn: 20, a: 50, b: 60, c: 70, d: 80, e: 90, f: 120, g: 130, h: 140, i: 150, j: 160, bn: 190, bp: 200 };
/** Canvas position of a breadboard hole, e.g. "g13" or "bn12". */
function hole(name: string): [number, number] {
  const m = name.match(/^(tp|tn|bp|bn|[a-j])(\d+)$/)!;
  return [BB.x + 10 + Number(m[2]) * 10, BB.y + ROW[m[1]]];
}
const UNO_PIN: Record<string, [number, number]> = {};
["SCL", "SDA", "AREF", "GND1", "D13", "D12", "D11", "D10", "D9", "D8"].forEach((n, i) => (UNO_PIN[n] = [100 + i * 10, 10]));
["D7", "D6", "D5", "D4", "D3", "D2", "D1", "D0"].forEach((n, i) => (UNO_PIN[n] = [200 + i * 10, 10]));
["IOREF", "RESET", "3V3", "5V", "GND2", "GND3", "VIN"].forEach((n, i) => (UNO_PIN[n] = [100 + i * 10, 200]));
["A0", "A1", "A2", "A3", "A4", "A5"].forEach((n, i) => (UNO_PIN[n] = [180 + i * 10, 200]));

let n = 0;
const part = (type: string, at: [number, number], props: PartInstance["props"] = {}, rot: Rot = 0): PartInstance => ({ id: `${type}-${++n}`, type, x: at[0], y: at[1], rot, props });
const uno = (): PartInstance => ({ id: "uno", type: "arduino-uno", x: 0, y: 0, rot: 0, props: {} });
const bb = (): PartInstance => ({ id: "bb", type: "breadboard-half", x: BB.x, y: BB.y, rot: 0, props: {} });
const w = (a: [string, string], b: [string, string], color: string, pts: [number, number][] = []): Wire => ({ id: `w${++n}`, a: { part: a[0], pin: a[1] }, b: { part: b[0], pin: b[1] }, pts, color });
/** Uno top-header pin → breadboard hole in row j, routed up then across at height y. */
const up = (pin: string, to: string, color: string, y = -30): Wire => {
  const [px] = UNO_PIN[pin];
  const [hx] = hole(to);
  return w(["uno", pin], ["bb", to], color, px === hx ? [] : [[px, y], [hx, y]]);
};
/** Uno bottom-header pin → a hole, routed down, around the left side and up. */
const around = (pin: string, to: string, color: string, depth: number, side: number): Wire => {
  const [px, py] = UNO_PIN[pin];
  const [, hy] = hole(to);
  return w(["uno", pin], ["bb", to], color, [[px, py + depth], [side, py + depth], [side, hy]]);
};
/** Uno bottom-header pin → a hole, routed down, around the right side and up. */
const aroundRight = (pin: string, to: string, color: string, depth: number, side = 350): Wire => {
  const [px, py] = UNO_PIN[pin];
  const [, hy] = hole(to);
  return w(["uno", pin], ["bb", to], color, [[px, py + depth], [side, py + depth], [side, hy]]);
};
const jump = (a: string, b: string, color: string): Wire => w(["bb", a], ["bb", b], color);
const gnd = () => up("GND1", "bn12", "#2b2b2b");

/** LED channel at breadboard column c: pin → resistor (h c…c+4) → LED (f c+4 / c+5) → bottom GND rail. */
function ledChannel(c: number, pin: string, color: string, wire: string, y: number, ohms = 220) {
  return {
    parts: [part("resistor", hole(`h${c}`), { r: ohms }), part("led", hole(`f${c + 4}`), { color })],
    wires: [up(pin, `j${c}`, wire, y), jump(`i${c + 5}`, `bn${c + 5}`, "#2b2b2b")],
  };
}
const doc = (parts: PartInstance[], wires: Wire[], code: string): CircuitDoc => ({ v: 1, parts, wires, files: [{ name: "sketch.ino", text: code.trim() + "\n" }], main: "sketch.ino" });

/* ─── Code ─────────────────────────────────────────────────────────────── */

export const CODE = {
  blink: `
// Blink: the LED on pin 13 turns on for half a second, then off for half a second.
void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}`,
  button: `
// Button LED: the LED lights while the button is held down.
// The button pulls pin 2 to GND; the internal pull-up keeps it HIGH otherwise.
const int BUTTON = 2;
const int LED = 13;

void setup() {
  pinMode(BUTTON, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  bool pressed = digitalRead(BUTTON) == LOW;
  digitalWrite(LED, pressed ? HIGH : LOW);
  static bool last = false;
  if (pressed != last) {
    Serial.println(pressed ? "pressed" : "released");
    last = pressed;
  }
}`,
  traffic: `
// Traffic light: red → green → yellow → red.
const int RED = 13, YELLOW = 12, GREEN = 11;

void show(int r, int y, int g, int ms) {
  digitalWrite(RED, r);
  digitalWrite(YELLOW, y);
  digitalWrite(GREEN, g);
  delay(ms);
}

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(YELLOW, OUTPUT);
  pinMode(GREEN, OUTPUT);
}

void loop() {
  show(HIGH, LOW, LOW, 3000);
  show(LOW, LOW, HIGH, 3000);
  show(LOW, HIGH, LOW, 1000);
}`,
  pot: `
// Potentiometer dimmer: turn the knob, the LED's brightness follows.
void setup() {
  pinMode(9, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(A0);          // 0..1023
  int level = map(raw, 0, 1023, 0, 255);
  analogWrite(9, level);              // PWM on pin 9
  Serial.print("A0 = ");
  Serial.print(raw);
  Serial.print("  PWM = ");
  Serial.println(level);
  delay(200);
}`,
  fade: `
// PWM fade: the LED breathes in and out with analogWrite().
int level = 0;
int step = 5;

void setup() {
  pinMode(9, OUTPUT);
}

void loop() {
  analogWrite(9, level);
  level += step;
  if (level <= 0 || level >= 255) step = -step;
  delay(20);
}`,
  serial: `
// Serial Hello: prints a greeting, then echoes back whatever you send.
void setup() {
  Serial.begin(9600);
  Serial.println("Hello from BuildX Lab!");
  Serial.println("Type something and press Send.");
}

void loop() {
  if (Serial.available()) {
    String line = Serial.readStringUntil('\\n');
    Serial.print("You said: ");
    Serial.println(line);
  }
}`,
  servo: `
// Servo sweep: 0° → 180° and back.
#include <Servo.h>

Servo arm;

void setup() {
  arm.attach(9);
}

void loop() {
  for (int a = 0; a <= 180; a += 2) {
    arm.write(a);
    delay(15);
  }
  for (int a = 180; a >= 0; a -= 2) {
    arm.write(a);
    delay(15);
  }
}`,
  sonar: `
// Ultrasonic ruler: HC-SR04 distance in centimetres on the serial monitor.
const int TRIG = 9, ECHO = 10;

void setup() {
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long us = pulseIn(ECHO, HIGH, 30000);
  Serial.print("Distance: ");
  Serial.print(us / 58);
  Serial.println(" cm");
  delay(250);
}`,
  night: `
// Night light: the LED turns on when the light sensor says it's dark.
// The LDR and the 10k resistor make a divider into A0: darker = lower reading.
void setup() {
  pinMode(9, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int light = analogRead(A0);
  digitalWrite(9, light < 400 ? HIGH : LOW);
  Serial.println(light);
  delay(200);
}`,
  melody: `
// Melody: plays a short tune on a passive buzzer with tone().
const int BUZZER = 8;
int notes[] = {262, 294, 330, 349, 392, 440, 494, 523};

void setup() {}

void loop() {
  for (int i = 0; i < 8; i++) {
    tone(BUZZER, notes[i]);
    delay(250);
  }
  noTone(BUZZER);
  delay(1000);
}`,
  motor: `
// Transistor motor driver: pin 3 switches an NPN that powers a DC motor from a 9V battery.
void setup() {
  pinMode(3, OUTPUT);
}

void loop() {
  for (int s = 0; s <= 255; s += 5) {
    analogWrite(3, s);
    delay(30);
  }
  delay(1000);
  analogWrite(3, 0);
  delay(1000);
}`,
  oled: `
// OLED: text, a seconds counter and a progress bar on a 128x64 SSD1306 over I2C (SDA = A4, SCL = A5).
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);

void setup() {
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
}

void loop() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(4, 4);
  display.print("BuildX");
  display.setTextSize(1);
  display.setCursor(4, 28);
  display.print("Seconds: ");
  display.print(millis() / 1000);
  int w = (millis() / 20) % 121;
  display.drawRect(4, 44, 120, 12, SSD1306_WHITE);
  display.fillRect(4, 44, w, 12, SSD1306_WHITE);
  display.display();
}`,
  counter: `
// 7-segment counter: counts 0 to 9 on a common-cathode digit, one segment per pin (a = 2 … g = 8).
const int SEG[7] = {2, 3, 4, 5, 6, 7, 8};
// Which segments (a b c d e f g) are on for each digit.
const byte DIGITS[10] = {
  0b1111110, 0b0110000, 0b1101101, 0b1111001, 0b0110011,
  0b1011011, 0b1011111, 0b1110000, 0b1111111, 0b1111011,
};

void show(int d) {
  for (int i = 0; i < 7; i++) {
    digitalWrite(SEG[i], (DIGITS[d] >> (6 - i)) & 1);
  }
}

void setup() {
  for (int i = 0; i < 7; i++) pinMode(SEG[i], OUTPUT);
}

void loop() {
  for (int d = 0; d < 10; d++) {
    show(d);
    delay(700);
  }
}`,
};

/* ─── Examples ─────────────────────────────────────────────────────────── */

function make(): Example[] {
  n = 0;
  const L = (en: string, ar: string): L => ({ en, ar });
  const list: Example[] = [];

  {
    const ch = ledChannel(13, "D13", "red", "#e5484d", -30);
    list.push({
      slug: "blink",
      title: L("Blink", "ليد بيرمش"),
      description: L("The classic first circuit: an LED on pin 13 through a 220 Ω resistor.", "أول دايرة لأي حد: ليد على بن 13 مع مقاومة 220 أوم."),
      tags: ["led", "digital"],
      level: 1,
      doc: doc([uno(), bb(), ...ch.parts], [gnd(), w(["uno", "D13"], ["bb", "j13"], "#e5484d"), ...ch.wires.slice(1)], CODE.blink),
    });
  }
  {
    const ch = ledChannel(2, "D13", "green", "#30a46c", -30);
    const btn = part("pushbutton", hole("e20"));
    list.push({
      slug: "button-led",
      title: L("Button LED", "زرار وليد"),
      description: L("Read a push button with the internal pull-up and light an LED while it's pressed.", "اقرا زرار بالـ pull-up الداخلي ونوّر ليد طول ما هو مضغوط."),
      tags: ["button", "input", "led"],
      level: 1,
      doc: doc([uno(), bb(), ...ch.parts, btn], [gnd(), ...ch.wires, jump("j20", "bn20", "#2b2b2b"), up("D2", "j22", "#f5d90a", -40)], CODE.button),
    });
  }
  {
    const r = ledChannel(2, "D13", "red", "#e5484d", -26);
    const y = ledChannel(9, "D12", "yellow", "#f5d90a", -36);
    const g = ledChannel(16, "D11", "green", "#30a46c", -46);
    list.push({
      slug: "traffic-light",
      title: L("Traffic light", "إشارة مرور"),
      description: L("Three LEDs on pins 13, 12 and 11 cycle like a real traffic light.", "تلات ليدات على بن 13 و12 و11 بيشتغلوا زي إشارة المرور."),
      tags: ["led", "timing"],
      level: 1,
      doc: doc([uno(), bb(), ...r.parts, ...y.parts, ...g.parts], [gnd(), ...r.wires, ...y.wires, ...g.wires], CODE.traffic),
    });
  }
  {
    const ch = ledChannel(2, "D9", "blue", "#3e63dd", -30, 330);
    const pot = part("potentiometer", hole("e24"), { r: 10000, pos: 0.5 });
    list.push({
      slug: "potentiometer-dimmer",
      title: L("Potentiometer dimmer", "تحكم في الإضاءة ببوتنشوميتر"),
      description: L("analogRead() a knob on A0 and set an LED's brightness with PWM on pin 9.", "اقرا البوتنشوميتر على A0 وغيّر إضاءة ليد بالـ PWM على بن 9."),
      tags: ["analog", "pwm", "potentiometer"],
      level: 2,
      doc: doc(
        [uno(), bb(), ...ch.parts, pot],
        [gnd(), ...ch.wires, jump("a24", "tn24", "#2b2b2b"), jump("a26", "tp26", "#e5484d"), around("5V", "tp1", "#e5484d", 30, -20), around("GND2", "tn1", "#2b2b2b", 40, -30), aroundRight("A0", "b25", "#f76b15", 30)],
        CODE.pot,
      ),
    });
  }
  {
    const ch = ledChannel(13, "D9", "green", "#30a46c", -30);
    list.push({
      slug: "pwm-fade",
      title: L("PWM fade", "ليد بيتنفّس (PWM)"),
      description: L("analogWrite() changes the duty cycle; the simulator dims the LED by the real average current.", "analogWrite() بيغيّر نسبة التشغيل؛ والمحاكي بيوطّي الإضاءة على حسب التيار الحقيقي."),
      tags: ["pwm", "led"],
      level: 1,
      doc: doc([uno(), bb(), ...ch.parts], [gnd(), ...ch.wires], CODE.fade),
    });
  }
  list.push({
    slug: "serial-hello",
    title: L("Serial hello", "أهلًا بالسيريال"),
    description: L("Print to the serial monitor and echo back what you type.", "اطبع على السيريال مونيتور ورجّع اللي بتكتبه."),
    tags: ["serial"],
    level: 1,
    doc: doc([uno()], [], CODE.serial),
  });
  {
    const servo = part("servo", [330, 120]);
    list.push({
      slug: "servo-sweep",
      title: L("Servo sweep", "سيرفو بيلف"),
      description: L("The Servo library drives an SG90 on pin 9; the angle comes from the measured pulse width.", "مكتبة Servo بتحرك SG90 على بن 9؛ والزاوية من عرض النبضة المقاس."),
      tags: ["servo", "library", "motor"],
      level: 2,
      doc: doc(
        [uno(), servo],
        [
          w(["uno", "GND2"], [servo.id, "GND"], "#2b2b2b", [[140, 225], [330, 225]]),
          w(["uno", "5V"], [servo.id, "V+"], "#e5484d", [[130, 235], [340, 235]]),
          w(["uno", "D9"], [servo.id, "SIG"], "#f76b15", [[180, -15], [400, -15], [400, 215], [350, 215]]),
        ],
        CODE.servo,
      ),
    });
  }
  {
    const s = part("hc-sr04", [330, 120], { cm: 42 });
    list.push({
      slug: "ultrasonic-ruler",
      title: L("Ultrasonic ruler", "مسطرة ألتراسونيك"),
      description: L("Measure distance with an HC-SR04 and pulseIn(); change the distance while it runs.", "قيس المسافة بـ HC-SR04 و pulseIn()؛ وغيّر المسافة وهي شغالة."),
      tags: ["sensor", "distance", "timing"],
      level: 2,
      doc: doc(
        [uno(), s],
        [
          w(["uno", "5V"], [s.id, "VCC"], "#e5484d", [[130, 235], [330, 235]]),
          w(["uno", "D9"], [s.id, "TRIG"], "#3e63dd", [[180, -15], [410, -15], [410, 215], [340, 215]]),
          w(["uno", "D10"], [s.id, "ECHO"], "#30a46c", [[170, -25], [420, -25], [420, 205], [350, 205]]),
          w(["uno", "GND2"], [s.id, "GND"], "#2b2b2b", [[140, 245], [360, 245]]),
        ],
        CODE.sonar,
      ),
    });
  }
  {
    const ch = ledChannel(2, "D9", "white", "#ffffff", -30);
    const ldr = part("ldr", hole("e23"), { lux: 300 });
    const r = part("resistor", hole("d24"), { r: 10000 });
    list.push({
      slug: "night-light",
      title: L("Night light", "نور الليل"),
      description: L("A light sensor in a voltage divider: when it gets dark, the LED turns on.", "حساس ضوء في مقسّم جهد: لما الدنيا تضلم الليد بينور."),
      tags: ["sensor", "analog", "led"],
      level: 2,
      doc: doc(
        [uno(), bb(), ...ch.parts, ldr, r],
        [gnd(), ...ch.wires, jump("a23", "tp23", "#e5484d"), jump("a28", "tn28", "#2b2b2b"), around("5V", "tp1", "#e5484d", 30, -20), around("GND2", "tn1", "#2b2b2b", 40, -30), aroundRight("A0", "b24", "#f76b15", 30)],
        CODE.night,
      ),
    });
  }
  {
    const bz = part("buzzer", hole("f20"), { active: false });
    list.push({
      slug: "buzzer-melody",
      title: L("Buzzer melody", "لحن بالبازر"),
      description: L("tone() on a passive buzzer: the simulator measures the frequency your code produces and plays it.", "tone() على بازر باسيف: المحاكي بيقيس التردد اللي الكود بيطلعه وبيشغّله."),
      tags: ["sound", "tone"],
      level: 1,
      doc: doc([uno(), bb(), bz], [gnd(), up("D8", "j20", "#8e4ec6", -30), jump("j22", "bn22", "#2b2b2b")], CODE.melody),
    });
  }
  {
    const q = part("npn", hole("f10"), { beta: 150 });
    const rb = part("resistor", hole("h7"), { r: 1000 });
    const motor = part("dc-motor", [420, -150], { rated: 9 });
    const bat = part("battery-9v", [420, 0], {}, 90);
    list.push({
      slug: "transistor-motor",
      title: L("Transistor motor driver", "تشغيل موتور بترانزستور"),
      description: L("A pin can't power a motor: it switches an NPN that does, from a 9 V battery. PWM sets the speed.", "البن مايقدرش يشغّل موتور: بيشغّل ترانزستور NPN هو اللي بيشغّله من بطارية 9 فولت. والـ PWM بيحدد السرعة."),
      tags: ["transistor", "motor", "pwm"],
      level: 3,
      doc: doc(
        [uno(), bb(), q, rb, motor, bat],
        [
          gnd(),
          up("D3", "j7", "#f76b15", -30),
          jump("j10", "bn10", "#2b2b2b"),
          w(["bb", "j12"], [motor.id, "-"], "#3e63dd", [[130, -85], [440, -85]]),
          w([bat.id, "+"], [motor.id, "+"], "#e5484d"),
          w([bat.id, "-"], ["bb", "bn30"], "#2b2b2b", [[340, 20], [340, -70]]),
        ],
        CODE.motor,
      ),
    });
  }
  {
    // The digit straddles the centre gap: its top pins (g f COM1 a b) sit in row c, the bottom ones (e d COM2 c dp) in row g.
    const seg = part("seg7", hole("c20"), { common: "cathode", color: "red" });
    const r = (from: string) => part("resistor", hole(from), { r: 330 });
    const res = [r("a16"), r("b17"), r("b23"), r("a24"), r("i16"), r("j17"), r("i23")];
    const wires: [string, string, string, number][] = [
      ["D2", "e27", "#e5484d", -26],
      ["D3", "e28", "#f76b15", -30],
      ["D4", "f27", "#f5d90a", -34],
      ["D5", "f17", "#30a46c", -38],
      ["D6", "f16", "#3e63dd", -42],
      ["D7", "e17", "#8e4ec6", -46],
      ["D8", "e16", "#e93d82", -50],
    ];
    list.push({
      slug: "seven-segment-counter",
      title: L("7-segment counter", "عداد 7 سيجمنت"),
      description: L("Count 0 to 9 on a 7-segment digit: seven pins, each segment through its own 330 Ω resistor.", "عدّ من 0 لـ 9 على شاشة 7 سيجمنت: سبع بنات، وكل سيجمنت بمقاومة 330 أوم لوحده."),
      tags: ["display", "digital", "arrays"],
      level: 2,
      doc: doc([uno(), bb(), seg, ...res], [gnd(), jump("h22", "bn22", "#2b2b2b"), ...wires.map(([pin, to, c, y]) => up(pin, to, c, y))], CODE.counter),
    });
  }
  {
    const oled = part("oled-ssd1306", [380, 30]);
    list.push({
      slug: "oled-hello",
      title: L("OLED display", "شاشة OLED"),
      description: L("Text, a counter and a progress bar on a 128×64 SSD1306 over I2C, drawn by the real Adafruit library.", "نص وعدّاد وشريط تقدّم على شاشة SSD1306 ‏128×64 عن طريق I2C، بترسمهم مكتبة Adafruit الحقيقية."),
      tags: ["display", "i2c", "library"],
      level: 2,
      doc: doc(
        [uno(), oled],
        [
          w([oled.id, "GND"], ["uno", "GND1"], "#2b2b2b", [[380, -10], [130, -10]]),
          w([oled.id, "SCL"], ["uno", "SCL"], "#f5d90a", [[400, -20], [100, -20]]),
          w([oled.id, "SDA"], ["uno", "SDA"], "#3e63dd", [[410, -30], [110, -30]]),
          w([oled.id, "VCC"], ["uno", "5V"], "#e5484d", [[390, -40], [310, -40], [310, 230], [130, 230]]),
        ],
        CODE.oled,
      ),
    });
  }
  return list;
}

export const EXAMPLES: Example[] = make();
export const exampleBySlug = (s: string) => EXAMPLES.find((e) => e.slug === s);

/** Snippets for the code editor's Examples menu. */
export const CODE_EXAMPLES: { key: keyof typeof CODE; title: L }[] = [
  { key: "blink", title: { en: "Blink", ar: "ليد بيرمش" } },
  { key: "button", title: { en: "Button LED", ar: "زرار وليد" } },
  { key: "traffic", title: { en: "Traffic light", ar: "إشارة مرور" } },
  { key: "pot", title: { en: "Potentiometer", ar: "بوتنشوميتر" } },
  { key: "fade", title: { en: "PWM fade", ar: "PWM" } },
  { key: "serial", title: { en: "Serial hello", ar: "السيريال" } },
  { key: "servo", title: { en: "Servo", ar: "سيرفو" } },
  { key: "sonar", title: { en: "Ultrasonic", ar: "ألتراسونيك" } },
  { key: "melody", title: { en: "Melody", ar: "لحن" } },
  { key: "oled", title: { en: "OLED display", ar: "شاشة OLED" } },
  { key: "counter", title: { en: "7-segment counter", ar: "عداد 7 سيجمنت" } },
];
