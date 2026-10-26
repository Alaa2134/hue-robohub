/**
 * From a circuit to a real build: the bill of materials (parts grouped by type and value, with how
 * many), a wiring guide written from the wires actually on the canvas, and a printable guide that
 * bundles both with the code. Meters are simulator instruments, not parts to buy, so they're left out.
 */
import type { CircuitDoc, PartInstance, PinRef } from "./model";
import { PART_BY_TYPE, propsOf, type L } from "./parts";

export type BomLine = { type: string; name: L; spec: string; qty: number; ids: string[] };
export type WireStep = { n: number; from: string; to: string; color: string; label?: string };

const INSTRUMENTS = new Set(["voltmeter", "ammeter"]);
const SI = [
  [1e9, "G"],
  [1e6, "M"],
  [1e3, "k"],
  [1, ""],
  [1e-3, "m"],
  [1e-6, "µ"],
  [1e-9, "n"],
  [1e-12, "p"],
] as const;

/** 4700 Ω → "4.7 kΩ", 0.0001 F → "100 µF". */
export function eng(v: number, unit = ""): string {
  if (!Number.isFinite(v) || v === 0) return `${v} ${unit}`.trim();
  const a = Math.abs(v);
  const [m, p] = SI.find(([s]) => a >= s) ?? SI[SI.length - 1];
  const n = Math.round((v / m) * 100) / 100;
  return `${n} ${p}${unit}`.trim();
}

/** The settings that matter when buying the part (values, colours, models), not live controls. */
function specOf(p: PartInstance, l: (x: L) => string): string {
  const def = PART_BY_TYPE.get(p.type);
  if (!def) return "";
  const v = propsOf(p);
  return def.props
    .filter((d) => !d.live)
    .map((d) => {
      const x = v[d.key];
      if (x === undefined || x === "") return "";
      if (d.type === "number") return eng(Number(x), d.unit ?? "");
      if (d.type === "select") {
        const o = d.options.find((o) => o.value === String(x));
        return o ? l(o.label) : String(x);
      }
      return x ? l(d.label) : "";
    })
    .filter(Boolean)
    .join(", ");
}

export function bom(doc: CircuitDoc, l: (x: L) => string): BomLine[] {
  const lines = new Map<string, BomLine>();
  for (const p of doc.parts) {
    if (INSTRUMENTS.has(p.type)) continue;
    const def = PART_BY_TYPE.get(p.type);
    const spec = specOf(p, l);
    const k = `${p.type}|${spec}`;
    const line = lines.get(k) ?? { type: p.type, name: def?.name ?? { en: p.type, ar: p.type }, spec, qty: 0, ids: [] };
    line.qty++;
    line.ids.push(p.id);
    lines.set(k, line);
  }
  const out = [...lines.values()];
  const wires = doc.wires.length;
  if (wires) out.push({ type: "wire", name: { en: "Jumper wires", ar: "أسلاك توصيل (جامبر)" }, spec: "", qty: wires, ids: [] });
  return out.sort((a, b) => (a.type === "wire" ? 1 : b.type === "wire" ? -1 : 0));
}

/** "LED 2" style names: the part's own label, else its type and its number among parts of that type. */
export function partNames(doc: CircuitDoc, l: (x: L) => string): Map<string, string> {
  const count = new Map<string, number>();
  const total = new Map<string, number>();
  for (const p of doc.parts) total.set(p.type, (total.get(p.type) ?? 0) + 1);
  const names = new Map<string, string>();
  for (const p of doc.parts) {
    const n = (count.get(p.type) ?? 0) + 1;
    count.set(p.type, n);
    const base = l(PART_BY_TYPE.get(p.type)?.name ?? { en: p.type, ar: p.type });
    names.set(p.id, p.label?.trim() || ((total.get(p.type) ?? 0) > 1 ? `${base} ${n}` : base));
  }
  return names;
}

const COLOR: Record<string, L> = {
  "#e5484d": { en: "red", ar: "أحمر" },
  "#2b2b2b": { en: "black", ar: "أسود" },
  "#3e63dd": { en: "blue", ar: "أزرق" },
  "#30a46c": { en: "green", ar: "أخضر" },
  "#f5d90a": { en: "yellow", ar: "أصفر" },
  "#f76b15": { en: "orange", ar: "برتقالي" },
  "#ffffff": { en: "white", ar: "أبيض" },
  "#8e4ec6": { en: "purple", ar: "بنفسجي" },
  "#0091ff": { en: "light blue", ar: "لبني" },
  "#ad7f58": { en: "brown", ar: "بني" },
};

/** Each wire on the canvas as a step: from which pin to which pin, in its colour. */
export function wiring(doc: CircuitDoc, l: (x: L) => string): WireStep[] {
  const names = partNames(doc, l);
  const parts = new Map(doc.parts.map((p) => [p.id, p]));
  const end = (r: PinRef) => {
    const p = parts.get(r.part);
    if (!p) return `? ${r.pin}`;
    const isBoard = p.type.startsWith("breadboard");
    return isBoard ? `${names.get(p.id)} · ${l({ en: "hole", ar: "خرم" })} ${r.pin}` : `${names.get(p.id)} · ${r.pin}`;
  };
  return doc.wires.map((w, i) => ({ n: i + 1, from: end(w.a), to: end(w.b), color: COLOR[w.color.toLowerCase()] ? l(COLOR[w.color.toLowerCase()]) : w.color, label: w.label }));
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function bomCsv(lines: BomLine[], l: (x: L) => string): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return [[l({ en: "Part", ar: "القطعة" }), l({ en: "Value / model", ar: "القيمة / الموديل" }), l({ en: "Qty", ar: "العدد" })].map(q).join(","), ...lines.map((x) => [q(l(x.name)), q(x.spec), String(x.qty)].join(","))].join("\r\n");
}

/** A printable page: picture, parts, wiring steps and the code. */
export function guideHtml(o: { title: string; description: string; svg: string | null; lines: BomLine[]; steps: WireStep[]; code: string; lang: "ar" | "en"; l: (x: L) => string }): string {
  const { l } = o;
  const rows = o.lines.map((x) => `<tr><td>${esc(l(x.name))}</td><td>${esc(x.spec)}</td><td class="n">${x.qty}</td></tr>`).join("");
  const steps = o.steps.map((s) => `<li><b>${esc(s.from)}</b> → <b>${esc(s.to)}</b> <span class="c">(${esc(s.color)}${s.label ? ` · ${esc(s.label)}` : ""})</span></li>`).join("");
  return `<!doctype html><html lang="${o.lang}" dir="${o.lang === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#111}h1{margin:0 0 4px}h2{margin-top:28px;border-bottom:2px solid #2f7bff;padding-bottom:4px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 8px;text-align:start}.n{text-align:center;width:60px}.c{color:#666}pre{background:#f4f6fb;padding:12px;overflow:auto;direction:ltr;text-align:left;font-size:13px}.pic svg{width:100%;height:auto;border:1px solid #ddd;border-radius:8px}li{margin:4px 0}footer{margin-top:32px;color:#888;font-size:12px}@media print{h2{break-after:avoid}}</style></head><body>
<h1>${esc(o.title)}</h1>${o.description ? `<p>${esc(o.description)}</p>` : ""}
${o.svg ? `<div class="pic">${o.svg}</div>` : ""}
<h2>${l({ en: "Parts", ar: "القطع" })}</h2><table><thead><tr><th>${l({ en: "Part", ar: "القطعة" })}</th><th>${l({ en: "Value / model", ar: "القيمة / الموديل" })}</th><th class="n">${l({ en: "Qty", ar: "العدد" })}</th></tr></thead><tbody>${rows}</tbody></table>
<h2>${l({ en: "Wiring", ar: "التوصيل" })}</h2><p class="c">${l({ en: "Unplug the board while wiring. Each line is one jumper wire.", ar: "افصل البورد وإنت بتوصّل. كل سطر سلك واحد." })}</p><ol>${steps}</ol>
<h2>${l({ en: "Code", ar: "الكود" })}</h2><pre>${esc(o.code)}</pre>
<footer>BuildX Lab · buildxhue.com/lab</footer></body></html>`;
}
