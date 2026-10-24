/**
 * Checks on a circuit before it runs, read from the wiring alone (the simulator adds live ones: over-
 * current, shorts under load). Each finding names the part or wire, says why it matters and how to fix it.
 */
import type { CircuitDoc, PartInstance } from "../circuit/model";
import { buildNetlist, key, type Netlist } from "../circuit/netlist";
import { AVR_PINS, PART_BY_TYPE, propsOf } from "../circuit/parts";
import type { L } from "../circuit/parts";

export type SimDiagnostic = { level: "error" | "warning" | "info"; code: string; part?: string; pin?: string; wire?: string; detail?: Record<string, string | number> };

/** Parts that limit current (a resistance in series makes an LED or a pin safe). */
const RESISTIVE = new Set(["resistor", "potentiometer", "ldr", "thermistor", "dc-motor", "buzzer"]);
const SOURCES = new Set(["battery-9v", "battery-aa", "power-supply"]);
const BOARD_RAILS: Record<string, number> = { "5V": 5, "3V3": 3.3, IOREF: 5 };

const sourceVolts = (p: PartInstance) => {
  const pr = propsOf(p);
  return p.type === "battery-aa" ? 1.5 * Number(pr.cells) : Number(pr.v);
};

export function checkCircuit(doc: CircuitDoc, netlist: Netlist = buildNetlist(doc), hasProgram = true): SimDiagnostic[] {
  const out: SimDiagnostic[] = [];
  const parts = new Map(doc.parts.map((p) => [p.id, p]));
  const boards = doc.parts.filter((p) => PART_BY_TYPE.get(p.type)?.mcu);
  const board = boards[0];
  if (!board) out.push({ level: "info", code: "no_board" });
  else if (!hasProgram) out.push({ level: "info", code: "no_program" });
  if (boards.length > 1) out.push({ level: "info", code: "extra_boards", part: boards[1].id });
  for (const p of doc.parts) {
    const def = PART_BY_TYPE.get(p.type);
    if (!def) out.push({ level: "warning", code: "unknown_part", part: p.id });
    else if (def.support === "visual") out.push({ level: "info", code: "visual_only", part: p.id });
  }
  for (const w of netlist.brokenWires) out.push({ level: "warning", code: "broken_wire", wire: w });
  for (const k of netlist.unconnected) {
    const [part, pin] = k.split(":");
    const def = PART_BY_TYPE.get(parts.get(part)?.type ?? "");
    if (def && !def.mcu && def.support !== "visual") out.push({ level: "warning", code: "pin_unconnected", part, pin });
  }

  // What each net touches.
  const net = (part: string, pin: string) => netlist.netOf.get(key(part, pin)) ?? -1;
  const pinsOf = (n: number) => (n < 0 ? [] : netlist.nets[n].map((k) => k.split(":") as [string, string]));
  const isGround = (part: string, pin: string) => {
    const p = parts.get(part);
    if (!p) return false;
    if (PART_BY_TYPE.get(p.type)?.mcu) return /^GND/.test(pin);
    return false;
  };
  const groundNets = new Set<number>();
  for (const p of boards) for (const pin of ["GND1", "GND2", "GND3"]) if (net(p.id, pin) >= 0) groundNets.add(net(p.id, pin));
  // A battery or supply whose − is on the board's ground shares its reference: its + is a known voltage.
  const referenced = (p: PartInstance) => !!board && groundNets.has(net(p.id, "-"));

  /** Supply terminals: their net, voltage (if known), and their own return. */
  const supplies: { part: string; pin: string; net: number; v: number; ret: number }[] = [];
  for (const p of boards) for (const [pin, v] of Object.entries(BOARD_RAILS)) if (net(p.id, pin) >= 0) supplies.push({ part: p.id, pin, net: net(p.id, pin), v, ret: net(p.id, "GND1") });
  for (const p of doc.parts) if (SOURCES.has(p.type)) supplies.push({ part: p.id, pin: "+", net: net(p.id, "+"), v: sourceVolts(p), ret: net(p.id, "-") });

  // A supply's + wired straight to its own return (or to ground, when they share it): a dead short.
  for (const s of supplies) {
    if (s.net < 0) continue;
    const own = s.ret >= 0 && s.net === s.ret;
    const toGround = groundNets.has(s.net) && (PART_BY_TYPE.get(parts.get(s.part)!.type)?.mcu || referenced(parts.get(s.part)!));
    if (own || toGround) out.push({ level: "error", code: "rail_short", part: s.part, pin: s.pin, detail: { v: s.v } });
  }

  // More than 5.5 V reaching a 5 V board pin (VIN takes up to 12 V).
  if (board)
    for (const s of supplies) {
      const src = parts.get(s.part)!;
      if (!SOURCES.has(src.type) || s.net < 0 || !referenced(src)) continue;
      for (const [pp, pin] of pinsOf(s.net)) {
        if (pp !== board.id) continue;
        const limit = pin === "VIN" ? 12 : /^GND/.test(pin) ? Infinity : 5.5;
        if (s.v > limit) out.push({ level: "error", code: "overvoltage", part: s.part, pin, detail: { v: +s.v.toFixed(1), max: limit, board: board.id } });
      }
    }

  const resistiveOn = (n: number) => pinsOf(n).some(([pp]) => RESISTIVE.has(parts.get(pp)?.type ?? ""));
  const driveOn = (n: number) => supplies.some((s) => s.net === n) || pinsOf(n).some(([pp, pin]) => pp === board?.id && AVR_PINS[pin]);
  const groundOn = (n: number) => groundNets.has(n) || supplies.some((s) => s.ret === n && SOURCES.has(parts.get(s.part)!.type)) || pinsOf(n).some(([pp, pin]) => isGround(pp, pin));
  const supplyOn = (n: number) => supplies.some((s) => s.net === n);

  for (const p of doc.parts) {
    if (p.type === "led") {
      const a = net(p.id, "A");
      const k = net(p.id, "K");
      if (a < 0 || k < 0) continue;
      if (supplyOn(k) && groundOn(a)) out.push({ level: "warning", code: "led_reversed", part: p.id });
      else if (driveOn(a) && (groundOn(k) || driveOn(k)) && !resistiveOn(a) && !resistiveOn(k)) out.push({ level: "warning", code: "led_no_resistor", part: p.id });
    }
    if (p.type === "capacitor" && propsOf(p).polar) {
      const plus = net(p.id, "+");
      const minus = net(p.id, "-");
      if (plus >= 0 && minus >= 0 && supplyOn(minus) && groundOn(plus)) out.push({ level: "warning", code: "cap_reversed", part: p.id });
    }
  }

  // Two board pins on one net fight if both are outputs at different levels.
  if (board) {
    const seen = new Set<number>();
    for (const pin of Object.keys(AVR_PINS)) {
      const n = net(board.id, pin);
      if (n < 0 || seen.has(n)) continue;
      seen.add(n);
      const io = pinsOf(n).filter(([pp, x]) => pp === board.id && AVR_PINS[x]).map(([, x]) => x);
      if (io.length > 1) out.push({ level: "warning", code: "pins_joined", part: board.id, pin: io[0], detail: { pins: io.join(", ") } });
    }
  }

  // A button that only connects a pin to a rail, with nothing holding the pin when it's open.
  if (board) {
    const code = doc.files.map((f) => f.text).join("\n");
    for (const p of doc.parts.filter((x) => x.type === "pushbutton")) {
      for (const [side, other] of [
        ["1a", "2a"],
        ["2a", "1a"],
      ]) {
        const n = net(p.id, side);
        const io = pinsOf(n).find(([pp, x]) => pp === board.id && AVR_PINS[x]);
        if (!io) continue;
        const pulled = resistiveOn(n) || supplyOn(n) || groundOn(n);
        // Any INPUT_PULLUP in the sketch counts: which pin it names isn't resolved here.
        const pullup = /INPUT_PULLUP/.test(code);
        if (!pulled && !pullup && (groundOn(net(p.id, other)) || supplyOn(net(p.id, other)))) out.push({ level: "warning", code: "floating_input", part: p.id, pin: io[1] });
      }
    }
  }

  // I2C devices must use the board's SDA (A4) and SCL (A5): the TWI hardware only drives those.
  if (board) {
    const want: Record<string, string[]> = { SDA: ["A4", "SDA"], SCL: ["A5", "SCL"] };
    for (const p of doc.parts.filter((x) => x.type === "oled-ssd1306")) {
      for (const [line, ok] of Object.entries(want)) {
        const on = pinsOf(net(p.id, line)).filter(([pp, x]) => pp === board.id && (AVR_PINS[x] !== undefined || x === "SDA" || x === "SCL"));
        if (on.length && !on.some(([, x]) => ok.includes(x))) out.push({ level: "warning", code: "i2c_wrong_pin", part: p.id, pin: line, detail: { pins: on.map(([, x]) => x).join(", "), max: ok[0] } });
      }
    }
  }

  // The same two pins wired twice.
  const pairs = new Map<string, string>();
  for (const w of doc.wires) {
    const k = [key(w.a.part, w.a.pin), key(w.b.part, w.b.pin)].sort().join("|");
    if (pairs.has(k)) out.push({ level: "info", code: "duplicate_wire", wire: w.id });
    else pairs.set(k, w.id);
  }
  return out;
}

/** "LED 2", "Resistor 1": parts numbered by type in the order they were added. */
export function partLabels(doc: CircuitDoc, l: (x: L) => string): Map<string, string> {
  const count = new Map<string, number>();
  const out = new Map<string, string>();
  for (const p of doc.parts) {
    const n = (count.get(p.type) ?? 0) + 1;
    count.set(p.type, n);
    const def = PART_BY_TYPE.get(p.type);
    out.set(p.id, `${p.label ? `${p.label} · ` : ""}${def ? l(def.name) : p.type} ${n}`);
  }
  return out;
}

type Entry = { msg: L; why?: L; fix?: L };
const T: Record<string, Entry> = {
  no_board: { msg: { en: "No Arduino board: only the parts' electrical behaviour is simulated.", ar: "مفيش بورد أردوينو: بيتشغّل السلوك الكهربي للقطع بس." } },
  no_program: { msg: { en: "The board has no program yet — press Compile (or Start) to build the code.", ar: "البورد لسه مفيهوش برنامج — دوس كومبايل (أو تشغيل) عشان يتبني الكود." } },
  extra_boards: { msg: { en: "{part} is not programmed: only the first board runs code.", ar: "{part} مش متبرمج: أول بورد بس اللي بيشغّل كود." } },
  unknown_part: { msg: { en: "{part} is an unknown part and is ignored.", ar: "{part} قطعة مش معروفة ومتجاهلة." } },
  visual_only: { msg: { en: "{part} is visual only — it isn't simulated.", ar: "{part} شكل بس — مش بتتشغّل محاكاة." } },
  broken_wire: {
    msg: { en: "A wire points at a pin that no longer exists.", ar: "فيه سلك متوصّل بطرف مش موجود." },
    fix: { en: "Delete the wire or drag its end onto a pin.", ar: "امسح السلك أو اسحب طرفه على بن." },
  },
  pin_unconnected: {
    msg: { en: "{part}: pin {pin} isn't connected to anything.", ar: "{part}: الطرف {pin} مش متوصّل بحاجة." },
    why: { en: "Current only flows around a closed loop.", ar: "التيار مش بيمشي غير في دايرة مقفولة." },
    fix: { en: "Plug the leg into a breadboard strip that leads somewhere, or draw a wire from it.", ar: "دخّل الرجل في شريحة بريدبورد متوصّلة، أو اسحب منها سلك." },
  },
  led_overcurrent: {
    msg: { en: "{part} draws {mA} mA — more than an LED can take.", ar: "{part} بيسحب {mA} مللي أمبير — أكتر من اللي الليد يستحمله." },
    why: { en: "Most 5 mm LEDs are rated for 20 mA; more than that burns them out.", ar: "أغلب الليدات 5 مم متحمّلة 20 مللي أمبير؛ أكتر من كده بيحرقها." },
    fix: { en: "Add a resistor in series (220–330 Ω at 5 V) or raise the one there.", ar: "حط مقاومة على التوالي (220–330 أوم على 5 فولت) أو كبّر الموجودة." },
  },
  pin_overcurrent: {
    msg: { en: "Pin {pin} is carrying {mA} mA.", ar: "البن {pin} شايل {mA} مللي أمبير." },
    why: { en: "An ATmega328P pin is rated for 40 mA at most (20 mA recommended).", ar: "أقصى تيار لبن ATmega328P هو 40 مللي أمبير (والمفضّل 20)." },
    fix: { en: "Add series resistance, or drive the load through a transistor.", ar: "زوّد مقاومة على التوالي، أو شغّل الحمل عن طريق ترانزستور." },
  },
  short: {
    msg: { en: "Short circuit on {part} {pin}: {mA} mA flows.", ar: "قفلة (شورت) على {part} {pin}: بيعدّي {mA} مللي أمبير." },
    why: { en: "Almost nothing limits the current between the supply and ground.", ar: "مفيش حاجة تقريبًا بتحدّ التيار بين المصدر والأرضي." },
    fix: { en: "Find the wire or part that joins + to − directly (the net highlight shows it) and move it.", ar: "دوّر على السلك أو القطعة اللي بتوصّل الموجب بالسالب مباشرة (تحديد الشبكة بيبيّنها) وانقلها." },
  },
  rail_short: {
    msg: { en: "{part} {pin} is wired straight to ground.", ar: "{part} {pin} متوصّل بالأرضي على طول." },
    why: { en: "A supply connected to its own ground is a dead short: it overheats or shuts down.", ar: "المصدر لما يتوصّل بالأرضي بتاعه بيعمل شورت: بيسخن أو بيفصل." },
    fix: { en: "Check the rails: a jumper or leg probably bridges + and −.", ar: "راجع الخطوط: غالبًا سلك أو رجل واصلة بين + و −." },
  },
  overvoltage: {
    msg: { en: "{part} puts {v} V on the board's {pin} pin (max {max} V).", ar: "{part} بيدّي {v} فولت على بن {pin} في البورد (الأقصى {max} فولت)." },
    why: { en: "The ATmega328P and the 5 V pin take 5.5 V at most; more damages the board.", ar: "الـATmega328P وبن 5V أقصاهم 5.5 فولت؛ أكتر من كده بيبوّظ البورد." },
    fix: { en: "Feed batteries above 5 V into VIN (7–12 V), or use a regulator.", ar: "دخّل البطاريات اللي فوق 5 فولت على VIN (7–12 فولت)، أو استخدم منظّم فولت." },
  },
  led_reversed: {
    msg: { en: "{part} is in backwards.", ar: "{part} متركّب بالعكس." },
    why: { en: "An LED only conducts from + (anode, long leg) to − (cathode, flat side).", ar: "الليد بيوصّل بس من + (الرجل الطويلة) لـ − (الناحية المسطّحة)." },
    fix: { en: "Rotate it 180° (R twice) so + faces the supply.", ar: "لفّه 180 درجة (R مرتين) عشان + يبقى ناحية المصدر." },
  },
  cap_reversed: {
    msg: { en: "{part} (electrolytic) is in backwards.", ar: "{part} (إلكتروليتي) متركّب بالعكس." },
    why: { en: "Reverse voltage on an electrolytic capacitor makes it leak, swell or burst.", ar: "الفولت العكسي على المكثف الإلكتروليتي بيخلّيه يسرّب أو ينفخ أو يفرقع." },
    fix: { en: "Rotate it so the + leg goes to the higher voltage.", ar: "لفّه عشان الرجل + تروح على الفولت الأعلى." },
  },
  led_no_resistor: {
    msg: { en: "{part} has no resistor in series.", ar: "{part} مفيش قبله مقاومة." },
    why: { en: "Without one the current is limited only by the pin or supply, far above 20 mA.", ar: "من غير مقاومة التيار مش بيحدّه غير البن أو المصدر، وده أكتر بكتير من 20 مللي أمبير." },
    fix: { en: "Put a 220–330 Ω resistor between the LED and the pin (or ground).", ar: "حط مقاومة 220–330 أوم بين الليد والبن (أو الأرضي)." },
  },
  pins_joined: {
    msg: { en: "Board pins {pins} are wired together.", ar: "بنات البورد {pins} متوصّلين ببعض." },
    why: { en: "If both are outputs at different levels they short each other.", ar: "لو الاتنين مخارج بقيم مختلفة هيعملوا شورت على بعض." },
    fix: { en: "Give each signal its own strip, or make sure only one is ever an OUTPUT.", ar: "خلّي كل إشارة في شريحة لوحدها، أو اتأكد إن واحد بس فيهم OUTPUT." },
  },
  floating_input: {
    msg: { en: "{part} leaves pin {pin} floating when released.", ar: "{part} بيسيب البن {pin} سايب لما يتساب." },
    why: { en: "An input connected to nothing reads random HIGHs and LOWs.", ar: "المدخل اللي مش متوصّل بحاجة بيقرأ HIGH وLOW عشوائي." },
    fix: { en: "Use pinMode(pin, INPUT_PULLUP), or add a 10 kΩ pull-down/pull-up resistor.", ar: "استخدم pinMode(pin, INPUT_PULLUP)، أو حط مقاومة 10 كيلو pull-down أو pull-up." },
  },
  i2c_wrong_pin: {
    msg: { en: "{part}: {pin} goes to {pins}, not to the board's I2C pin {max}.", ar: "{part}: {pin} رايح على {pins}، مش على بن I2C بتاع البورد {max}." },
    why: { en: "Wire (I2C) on an Uno or Nano only uses A4 (SDA) and A5 (SCL); on other pins the device never hears its address.", ar: "مكتبة Wire ‏(I2C) على Uno أو Nano بتستخدم A4 ‏(SDA) وA5 ‏(SCL) بس؛ على بنات تانية الجهاز عمره ما هيسمع عنوانه." },
    fix: { en: "Move SDA to A4 and SCL to A5 (on an Uno, the SDA/SCL pins by AREF are the same two).", ar: "انقل SDA على A4 وSCL على A5 (في الـUno، بنات SDA/SCL اللي جنب AREF هما نفس الاتنين)." },
  },
  duplicate_wire: {
    msg: { en: "Two wires join the same two pins.", ar: "سلكين واصلين نفس البنّين." },
    fix: { en: "Delete one of them.", ar: "امسح واحد منهم." },
  },
  crash: { msg: { en: "The simulation stopped: {msg}", ar: "المحاكاة وقفت: {msg}" } },
};

const fill = (tpl: string, d: SimDiagnostic, labels: Map<string, string>) =>
  tpl
    .replace("{part}", d.part ? labels.get(d.part) ?? d.part : "")
    .replace("{pin}", d.pin ?? "")
    .replace(/\{(mA|msg|v|max|pins)\}/g, (_, k: string) => String(d.detail?.[k] ?? ""))
    .trim();

export function diagText(d: SimDiagnostic, l: (x: L) => string, labels: Map<string, string>): string {
  return T[d.code] ? fill(l(T[d.code].msg), d, labels) : d.code;
}

/** Why it matters and how to fix it, when there's more to say than the message. */
export function diagHelp(d: SimDiagnostic, l: (x: L) => string): { why?: string; fix?: string } {
  const e = T[d.code];
  return { why: e?.why && l(e.why), fix: e?.fix && l(e.fix) };
}
