/** Checks on a circuit before it runs: missing board, unconnected legs, broken wires, visual-only parts. */
import type { CircuitDoc } from "../circuit/model";
import { buildNetlist, type Netlist } from "../circuit/netlist";
import { PART_BY_TYPE } from "../circuit/parts";
import type { L } from "../circuit/parts";

export type SimDiagnostic = { level: "error" | "warning" | "info"; code: string; part?: string; pin?: string; detail?: Record<string, string | number> };

export function checkCircuit(doc: CircuitDoc, netlist: Netlist = buildNetlist(doc), hasProgram = true): SimDiagnostic[] {
  const out: SimDiagnostic[] = [];
  const parts = new Map(doc.parts.map((p) => [p.id, p]));
  const boards = doc.parts.filter((p) => PART_BY_TYPE.get(p.type)?.mcu);
  if (!boards.length) out.push({ level: "info", code: "no_board" });
  else if (!hasProgram) out.push({ level: "info", code: "no_program" });
  if (boards.length > 1) out.push({ level: "info", code: "extra_boards", part: boards[1].id });
  for (const p of doc.parts) {
    const def = PART_BY_TYPE.get(p.type);
    if (!def) out.push({ level: "warning", code: "unknown_part", part: p.id });
    else if (def.support === "visual") out.push({ level: "info", code: "visual_only", part: p.id });
  }
  for (const w of netlist.brokenWires) out.push({ level: "warning", code: "broken_wire", detail: { wire: w } });
  for (const k of netlist.unconnected) {
    const [part, pin] = k.split(":");
    const def = PART_BY_TYPE.get(parts.get(part)?.type ?? "");
    if (def && !def.mcu && def.support === "sim") out.push({ level: "warning", code: "pin_unconnected", part, pin });
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
    out.set(p.id, `${def ? l(def.name) : p.type} ${n}`);
  }
  return out;
}

const T: Record<string, L> = {
  no_board: { en: "No Arduino board: only the parts' electrical behaviour is simulated.", ar: "مفيش بورد أردوينو: بيتشغّل السلوك الكهربي للقطع بس." },
  no_program: { en: "The board has no program yet — press Compile (or Start) to build the code.", ar: "البورد لسه مفيهوش برنامج — دوس كومبايل (أو تشغيل) عشان يتبني الكود." },
  extra_boards: { en: "{part} is not programmed: only the first board runs code.", ar: "{part} مش متبرمج: أول بورد بس اللي بيشغّل كود." },
  unknown_part: { en: "{part} is an unknown part and is ignored.", ar: "{part} قطعة مش معروفة ومتجاهلة." },
  visual_only: { en: "{part} is visual only — it isn't simulated.", ar: "{part} شكل بس — مش بتتشغّل محاكاة." },
  broken_wire: { en: "A wire points at a pin that no longer exists.", ar: "فيه سلك متوصّل بطرف مش موجود." },
  pin_unconnected: { en: "{part}: pin {pin} isn't connected to anything.", ar: "{part}: الطرف {pin} مش متوصّل بحاجة." },
  led_overcurrent: { en: "{part} draws {mA} mA — more than an LED can take. Add or raise its resistor.", ar: "{part} بيسحب {mA} مللي أمبير — أكتر من اللي الليد يستحمله. حط مقاومة أو كبّرها." },
  pin_overcurrent: { en: "Pin {pin} is carrying {mA} mA; an ATmega328P pin is rated for 40 mA at most.", ar: "البن {pin} شايل {mA} مللي أمبير؛ أقصى حاجة للبن 40 مللي أمبير." },
  short: { en: "Short circuit on {part} {pin}: {mA} mA flows.", ar: "قفلة (شورت) على {part} {pin}: بيعدّي {mA} مللي أمبير." },
  crash: { en: "The simulation stopped: {msg}", ar: "المحاكاة وقفت: {msg}" },
};

export function diagText(d: SimDiagnostic, l: (x: L) => string, labels: Map<string, string>): string {
  const tpl = T[d.code] ? l(T[d.code]) : d.code;
  return tpl
    .replace("{part}", d.part ? labels.get(d.part) ?? d.part : "")
    .replace("{pin}", d.pin ?? "")
    .replace("{mA}", String(d.detail?.mA ?? ""))
    .replace("{msg}", String(d.detail?.msg ?? ""))
    .trim();
}
