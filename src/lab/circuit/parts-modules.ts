/**
 * Catalog entries for modules, displays, sensors and logic chips (simulated in ../sim/modules.ts).
 * Pin layouts follow the real parts so they plug into a breadboard the same way.
 */
import type { PartDef, PinDef, PinKind } from "./parts";

const L = (en: string, ar: string) => ({ en, ar });
const row = (names: string[], x0: number, y: number, step = 10): PinDef[] => names.map((name, i) => ({ name, x: x0 + i * step, y }));

/** DIP-14: pins 1–7 along the bottom (left to right), 8–14 along the top (right to left), 0.3" apart. */
const dip14 = (labels: Record<number, string>): PinDef[] => [
  ...[1, 2, 3, 4, 5, 6, 7].map((n, i) => ({ name: String(n), x: i * 10, y: 30, label: labels[n] })),
  ...[8, 9, 10, 11, 12, 13, 14].map((n, i) => ({ name: String(n), x: 60 - i * 10, y: 0, label: labels[n] })),
];
const quad = (fn: string): Record<number, string> => ({ 1: "1A", 2: "1B", 3: `1Y`, 4: "2A", 5: "2B", 6: "2Y", 7: "GND", 8: "3Y", 9: "3A", 10: "3B", 11: "4Y", 12: "4A", 13: "4B", 14: "VCC", 0: fn });
const hex: Record<number, string> = { 1: "1A", 2: "1Y", 3: "2A", 4: "2Y", 5: "3A", 6: "3Y", 7: "GND", 8: "4Y", 9: "4A", 10: "5Y", 11: "5A", 12: "6Y", 13: "6A", 14: "VCC" };

const segColor = [
  { value: "red", label: L("Red", "أحمر") },
  { value: "green", label: L("Green", "أخضر") },
  { value: "yellow", label: L("Yellow", "أصفر") },
  { value: "blue", label: L("Blue", "أزرق") },
  { value: "white", label: L("White", "أبيض") },
];

const chip = (type: string, name: string, desc: string, descAr: string, labels: Record<number, string>): PartDef => ({
  type,
  name: L(`${type.toUpperCase()} ${name}`, `${type.toUpperCase()} ${name}`),
  category: "logic",
  support: "sim",
  note: L(`${desc} CMOS inputs switch at 30 % / 70 % of VCC; outputs follow ~10 ns later and can drive ~25 mA. Straddle the breadboard's centre channel; VCC is pin 14, GND pin 7.`, `${descAr} المداخل بتتقلب عند 30٪ / 70٪ من VCC، والمخارج بتتغيّر بعد حوالي 10 نانو ثانية. حطّه على القناة اللي في نص البريدبورد؛ VCC البن 14 وGND البن 7.`),
  box: { x: -6, y: -6, w: 72, h: 42 },
  pins: () => dip14(labels),
  defaults: {},
  props: [],
  keywords: `logic gate ic dip 74hc ${name.toLowerCase()} ${type}`,
});

export const MODULE_PARTS: PartDef[] = [
  {
    type: "seg7",
    name: L("7-segment display", "شاشة 7 سيجمنت"),
    category: "displays",
    support: "sim",
    note: L("One 0.56\" digit: eight LEDs (a–g, dp) sharing a common pin. Each segment needs its own resistor; brightness follows its real current.", "رقم واحد 0.56 بوصة: 8 ليدات (a–g وdp) ليهم طرف مشترك. كل سيجمنت محتاج مقاومة لوحده؛ الإضاءة على حسب التيار الحقيقي."),
    box: { x: -5, y: -8, w: 50, h: 76 },
    pins: () => [...row(["g", "f", "COM1", "a", "b"], 0, 0), ...row(["e", "d", "COM2", "c", "dp"], 0, 60)],
    internal: () => [["COM1", "COM2"]],
    defaults: { common: "cathode", color: "red" },
    props: [
      { key: "common", label: L("Common pin", "الطرف المشترك"), type: "select", options: [{ value: "cathode", label: L("Cathode (to GND)", "كاثود (على GND)") }, { value: "anode", label: L("Anode (to 5 V)", "أنود (على 5V)") }] },
      { key: "color", label: L("Colour", "اللون"), type: "select", options: segColor },
    ],
    keywords: "7 segment seven digit display led number",
  },
  {
    type: "relay",
    name: L("Relay module (5 V, 1 channel)", "موديول ريليه (5 فولت، قناة واحدة)"),
    category: "output",
    support: "sim",
    note: L("SRD-05VDC relay with its driver: IN switches the coil (≈70 mA from VCC); COM connects to NO when energised, NC otherwise. Pull-in 10 ms, release 5 ms. Contacts are modelled up to the circuit's DC levels, not mains.", "ريليه SRD-05VDC بالدرايفر: IN بيشغّل الملف (حوالي 70 مللي من VCC)؛ COM بيتوصّل بـNO وهو شغّال وبـNC وهو مطفي. بيشتغل بعد 10 مللي ثانية وبيفصل بعد 5. التوصيلات متمثّلة لحد جهد الدايرة DC، مش كهربا البيت."),
    box: { x: -10, y: -42, w: 202, h: 104 },
    pins: () => [...row(["VCC", "GND", "IN"], 0, 0).map((p, i) => ({ ...p, x: 0, y: i * 10 })), { name: "NO", x: 180, y: -20 }, { name: "COM", x: 180, y: 0 }, { name: "NC", x: 180, y: 20 }],
    defaults: { trigger: "high" },
    props: [{ key: "trigger", label: L("Trigger", "التشغيل"), type: "select", options: [{ value: "high", label: L("HIGH on IN", "HIGH على IN") }, { value: "low", label: L("LOW on IN (opto)", "LOW على IN (أوبتو)") }] }],
    keywords: "relay module switch srd-05vdc coil",
  },
  {
    type: "joystick",
    name: L("Joystick (KY-023)", "جويستيك (KY-023)"),
    category: "input",
    support: "sim",
    note: L("Two 10 kΩ potentiometers (X, Y) across +5V/GND and a push switch to GND (no pull-up on the module: use INPUT_PULLUP).", "بوتنشوميترين 10 كيلو (X وY) بين 5V وGND وزرار بيوصّل SW بالـGND (مفيش pull-up على الموديول: استخدم INPUT_PULLUP)."),
    box: { x: -45, y: -150, w: 130, h: 158 },
    pins: () => row(["GND", "+5V", "VRx", "VRy", "SW"], 0, 0),
    defaults: { x: 0.5, y: 0.5, pressed: false },
    props: [
      { key: "x", label: L("X position", "مكان X"), type: "number", min: 0, max: 1, step: 0.01, live: true },
      { key: "y", label: L("Y position", "مكان Y"), type: "number", min: 0, max: 1, step: 0.01, live: true },
      { key: "pressed", label: L("Pressed", "مضغوط"), type: "bool", live: true },
    ],
    keywords: "joystick thumbstick ky-023 analog xy",
  },
  {
    type: "pir",
    name: L("PIR motion sensor (HC-SR501)", "حساس حركة PIR ‏(HC-SR501)"),
    category: "sensors",
    support: "partial",
    note: L("OUT goes to 3.3 V when motion is detected and stays high for the hold time after it stops. Motion is what you set; the 1-minute warm-up and the sensing angle aren't modelled. Needs 4.5–20 V.", "OUT بيبقى 3.3 فولت لما فيه حركة وبيفضل كده مدة الانتظار بعد ما تقف. الحركة بتحددها انت؛ وقت التسخين (دقيقة) وزاوية الرؤية مش متمثّلين. محتاج 4.5–20 فولت."),
    box: { x: -38, y: -110, w: 96, h: 116 },
    pins: () => row(["VCC", "OUT", "GND"], 0, 0),
    defaults: { motion: false, hold: 3 },
    props: [
      { key: "motion", label: L("Motion", "حركة"), type: "bool", live: true },
      { key: "hold", label: L("Hold time", "مدة الانتظار"), type: "number", unit: "s", min: 0.3, max: 300, step: 0.5 },
    ],
    keywords: "pir motion sensor hc-sr501 presence infrared",
  },
  {
    type: "ir-obstacle",
    name: L("IR obstacle sensor (FC-51)", "حساس عوائق IR ‏(FC-51)"),
    category: "sensors",
    support: "partial",
    note: L("OUT is pulled LOW when an obstacle is in front (comparator with a 10 kΩ pull-up). Whether something is there is what you set; range and surface colour aren't modelled.", "OUT بيبقى LOW لما فيه حاجة قدّامه (كومباريتور مع pull-up ‏10 كيلو). وجود العائق بتحدده انت؛ المدى ولون السطح مش متمثّلين."),
    box: { x: -8, y: -128, w: 46, h: 134 },
    pins: () => row(["OUT", "GND", "VCC"], 0, 0),
    defaults: { obstacle: false },
    props: [{ key: "obstacle", label: L("Obstacle in front", "فيه عائق قدّامه"), type: "bool", live: true }],
    keywords: "ir infrared obstacle avoidance sensor fc-51 robot",
  },
  {
    type: "line-sensor",
    name: L("Line sensor (TCRT5000)", "حساس خط (TCRT5000)"),
    category: "sensors",
    support: "partial",
    note: L("A0 rises with how dark the surface is (simple linear model of a typical module); D0 is LOW over a light surface and HIGH over a black line, switching at the threshold.", "A0 بيزيد كل ما السطح يغمق (نموذج خطي بسيط لموديول عادي)؛ D0 بيبقى LOW على سطح فاتح وHIGH على خط أسود، وبيتقلب عند العتبة."),
    box: { x: -8, y: -140, w: 56, h: 146 },
    pins: () => row(["VCC", "GND", "D0", "A0"], 0, 0),
    defaults: { dark: 0, threshold: 0.5 },
    props: [
      { key: "dark", label: L("Surface darkness", "غمقان السطح"), type: "number", min: 0, max: 1, step: 0.05, live: true },
      { key: "threshold", label: L("Threshold (blue knob)", "العتبة (المسمار الأزرق)"), type: "number", min: 0.05, max: 0.95, step: 0.05 },
    ],
    keywords: "line follower tracking sensor tcrt5000 ir robot",
  },
  {
    type: "soil",
    name: L("Soil moisture sensor", "حساس رطوبة التربة"),
    category: "sensors",
    support: "partial",
    note: L("A0 falls as the soil gets wetter (linear approximation of a resistive probe: dry ≈ 95 % of VCC, soaked ≈ 30 %); D0 goes LOW above the threshold.", "A0 بيقل كل ما التربة تبقى أرطب (تقريب خطي لحساس مقاومة: ناشفة حوالي 95٪ من VCC، غرقانة حوالي 30٪)؛ D0 بيبقى LOW فوق العتبة."),
    box: { x: -8, y: -210, w: 56, h: 216 },
    pins: () => row(["VCC", "GND", "D0", "A0"], 0, 0),
    defaults: { moisture: 30, threshold: 0.5 },
    props: [
      { key: "moisture", label: L("Moisture", "الرطوبة"), type: "number", unit: "%", min: 0, max: 100, step: 1, live: true },
      { key: "threshold", label: L("Threshold", "العتبة"), type: "number", min: 0.05, max: 0.95, step: 0.05 },
    ],
    keywords: "soil moisture hygrometer sensor plant garden",
  },
  {
    type: "dht22",
    name: L("DHT22 temperature & humidity", "DHT22 حرارة ورطوبة"),
    category: "sensors",
    support: "sim",
    note: L("Speaks the real single-wire protocol at datasheet timings, so the DHT library reads it: −40…80 °C, 0…100 % RH in 0.1 steps. DATA needs a pull-up (INPUT_PULLUP or 10 kΩ).", "بيتكلم البروتوكول الحقيقي بتوقيتات الداتاشيت، فمكتبة DHT بتقراه: من −40 لـ80 درجة، ورطوبة 0…100٪ بخطوة 0.1. DATA محتاج pull-up ‏(INPUT_PULLUP أو 10 كيلو)."),
    box: { x: -16, y: -100, w: 62, h: 106 },
    pins: () => row(["VCC", "DATA", "NC", "GND"], 0, 0),
    defaults: { temp: 24, humidity: 45 },
    props: [
      { key: "temp", label: L("Temperature", "الحرارة"), type: "number", unit: "°C", min: -40, max: 80, step: 0.1, live: true },
      { key: "humidity", label: L("Humidity", "الرطوبة"), type: "number", unit: "%", min: 0, max: 100, step: 0.1, live: true },
    ],
    keywords: "dht22 am2302 temperature humidity sensor",
  },
  {
    type: "dht11",
    name: L("DHT11 temperature & humidity", "DHT11 حرارة ورطوبة"),
    category: "sensors",
    support: "sim",
    note: L("Same protocol as the DHT22 with whole numbers: 0…50 °C, 20…90 % RH. The start signal must be at least 18 ms.", "نفس بروتوكول DHT22 بأرقام صحيحة: من 0 لـ50 درجة ورطوبة 20…90٪. إشارة البداية لازم 18 مللي ثانية على الأقل."),
    box: { x: -12, y: -76, w: 54, h: 82 },
    pins: () => row(["VCC", "DATA", "NC", "GND"], 0, 0),
    defaults: { temp: 24, humidity: 45 },
    props: [
      { key: "temp", label: L("Temperature", "الحرارة"), type: "number", unit: "°C", min: 0, max: 50, step: 1, live: true },
      { key: "humidity", label: L("Humidity", "الرطوبة"), type: "number", unit: "%", min: 20, max: 90, step: 1, live: true },
    ],
    keywords: "dht11 temperature humidity sensor blue",
  },
  {
    type: "oled-ssd1306",
    name: L('OLED 0.96" 128×64 (SSD1306, I2C)', 'شاشة OLED ‏0.96 بوصة 128×64 (SSD1306، I2C)'),
    category: "displays",
    support: "sim",
    note: L(
      "The SSD1306 controller on real I2C: the Adafruit_SSD1306 library (or your own Wire code) draws on it pixel for pixel. SDA goes to A4, SCL to A5; VCC 3.3–5 V. Address 0x3C (0x3D with the jumper). Hardware scrolling isn't animated; current is a typical 5 mA.",
      "متحكم SSD1306 على I2C حقيقي: مكتبة Adafruit_SSD1306 (أو كود Wire بتاعك) بترسم عليها بكسل بكسل. SDA على A4 وSCL على A5؛ VCC من 3.3 لـ5 فولت. العنوان 0x3C (أو 0x3D بالجمبر). السكرول الهاردوير مش متحرّك؛ والتيار متمثّل كـ5 مللي.",
    ),
    box: { x: -39, y: -6, w: 108, h: 110 },
    pins: () => row(["GND", "VCC", "SCL", "SDA"], 0, 0),
    defaults: { address: "0x3C" },
    props: [{ key: "address", label: L("I2C address", "عنوان I2C"), type: "select", options: [{ value: "0x3C", label: L("0x3C", "0x3C") }, { value: "0x3D", label: L("0x3D", "0x3D") }] }],
    keywords: "oled ssd1306 display screen i2c 128x64 0.96 adafruit",
  },
  chip("74hc08", "AND", "Four 2-input AND gates.", "4 بوابات AND بمدخلين.", quad("AND")),
  chip("74hc32", "OR", "Four 2-input OR gates.", "4 بوابات OR بمدخلين.", quad("OR")),
  chip("74hc00", "NAND", "Four 2-input NAND gates.", "4 بوابات NAND بمدخلين.", quad("NAND")),
  chip("74hc86", "XOR", "Four 2-input XOR gates.", "4 بوابات XOR بمدخلين.", quad("XOR")),
  chip("74hc04", "NOT", "Six inverters.", "6 بوابات NOT.", hex),
];

/** What each module pin is for (hover tooltips, pinout sheets). */
export function modulePinRole(type: string, pin: string): { kind: PinKind; note: string } | null {
  if (/^74hc/.test(type)) {
    const labels = type === "74hc04" ? hex : quad("");
    const l = labels[Number(pin)];
    if (!l) return null;
    if (l === "VCC") return { kind: "power", note: "Pin 14 · VCC (2–6 V)" };
    if (l === "GND") return { kind: "ground", note: "Pin 7 · GND" };
    return { kind: l.endsWith("Y") ? "digital" : "control", note: `Pin ${pin} · ${l.endsWith("Y") ? `output ${l}` : `input ${l}`}` };
  }
  const R: Record<string, { kind: PinKind; note: string }> = {
    "seg7:COM1": { kind: "passive", note: "Common (cathode or anode)" },
    "seg7:COM2": { kind: "passive", note: "Common (joined to the other COM)" },
    "seg7:dp": { kind: "passive", note: "Decimal point" },
    "relay:IN": { kind: "control", note: "Control input" },
    "relay:COM": { kind: "passive", note: "Contact common" },
    "relay:NO": { kind: "passive", note: "Normally open: joined to COM when on" },
    "relay:NC": { kind: "passive", note: "Normally closed: joined to COM when off" },
    "joystick:+5V": { kind: "power", note: "5 V" },
    "joystick:VRx": { kind: "analog", note: "X axis (0–5 V)" },
    "joystick:VRy": { kind: "analog", note: "Y axis (0–5 V)" },
    "joystick:SW": { kind: "digital", note: "Button to GND (needs a pull-up)" },
    "pir:OUT": { kind: "digital", note: "HIGH (3.3 V) on motion" },
    "ir-obstacle:OUT": { kind: "digital", note: "LOW when an obstacle is detected" },
    "line-sensor:D0": { kind: "digital", note: "HIGH over a black line" },
    "line-sensor:A0": { kind: "analog", note: "Darker → higher voltage" },
    "soil:D0": { kind: "digital", note: "LOW when wetter than the threshold" },
    "soil:A0": { kind: "analog", note: "Wetter → lower voltage" },
    "oled-ssd1306:SDA": { kind: "i2c", note: "I2C data → A4 (4.7 kΩ pull-up on the module)" },
    "oled-ssd1306:SCL": { kind: "i2c", note: "I2C clock → A5 (4.7 kΩ pull-up on the module)" },
    "oled-ssd1306:VCC": { kind: "power", note: "3.3–5 V" },
    "dht22:DATA": { kind: "digital", note: "Single-wire data (needs a pull-up)" },
    "dht22:NC": { kind: "passive", note: "Not connected" },
    "dht11:DATA": { kind: "digital", note: "Single-wire data (needs a pull-up)" },
    "dht11:NC": { kind: "passive", note: "Not connected" },
  };
  const r = R[`${type}:${pin}`];
  if (r) return r;
  if (type === "seg7" && /^[a-g]$/.test(pin)) return { kind: "passive", note: `Segment ${pin}` };
  return null;
}
