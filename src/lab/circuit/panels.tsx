"use client";
/** Editor side panels: the parts library, the inspector, the serial monitor and diagnostics. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "../i18n";
import { Badge, Button, Icon, IconButton, Input, Select, cn } from "../ui";
import type { Diagnostic } from "../compiler/sketch";
import { diagHelp, diagText, partLabels, type SimDiagnostic } from "../sim/diagnostics";
import { explainCompile } from "../compiler/explain";
import type { Frame } from "../sim/engine";
import type { SerialLine } from "../sim/use-sim";
import { DocStore, useDoc } from "./doc-store";
import { buildNetlist } from "./netlist";
import { WIRE_COLORS, type CircuitDoc } from "./model";
import { CATEGORIES, PARTS, PART_BY_TYPE, PIN_COLORS, pinRole, propsOf, type PartDef, type PropDef } from "./parts";
import { PartArt, eng } from "./render";

/* ─── Library ──────────────────────────────────────────────────────────── */

/** 3D-rendered pictures of the parts, made once in the background (2D drawings until then). */
function useSnapshots() {
  const [shots, setShots] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    let live = true;
    import("./view3d/snapshots").then((m) => m.partSnapshots()).then((s) => live && setShots(s), () => {});
    return () => {
      live = false;
    };
  }, []);
  return shots;
}

export function PartIcon({ def, shot, className = "size-10" }: { def: PartDef; shot?: string; className?: string }) {
  const b = def.box;
  if (shot) return <img src={shot} alt="" className={cn(className, "shrink-0 object-contain")} />;
  return (
    <svg viewBox={`${b.x - 4} ${b.y - 4} ${b.w + 8} ${b.h + 8}`} className={cn(className, "shrink-0")} aria-hidden>
      <PartArt p={{ id: "icon", type: def.type, x: 0, y: 0, rot: 0, props: { ...def.defaults } }} />
    </svg>
  );
}

export { useSnapshots };

/** Fully simulated / partially simulated (some behaviour set by hand or approximated) / visual only. */
export function SupportBadge({ support }: { support: PartDef["support"] }) {
  const { t } = useLang();
  return support === "sim" ? <Badge tone="ok">{t("simulated")}</Badge> : support === "partial" ? <Badge tone="volt">{t("partial")}</Badge> : <Badge tone="warn">{t("visualOnly")}</Badge>;
}

/* ─── Part sheet: pinout and documentation ─────────────────────────────── */

/** Every pin of a part with what it's for, and what the model simulates. Read from the catalog, so it can't drift. */
export function PartSheet({ type, mode }: { type: string; mode: "pinout" | "docs" }) {
  const { t, l } = useLang();
  const shots = useSnapshots();
  const def = PART_BY_TYPE.get(type);
  if (!def) return null;
  const inst = { id: "sheet", type, x: 0, y: 0, rot: 0 as const, props: { ...def.defaults } };
  const pins = def.pins(inst.props);
  const holes = def.category === "breadboards";
  const groups = def.internal?.(inst.props).filter((g) => g.length > 1) ?? [];
  return (
    <div className="grid gap-4" data-testid={`part-sheet-${mode}`}>
      <div className="flex items-center gap-3">
        <PartIcon def={def} shot={shots?.get(type)} className="size-16" />
        <div>
          <p className="font-semibold">{l(def.name)}</p>
          <div className="mt-1"><SupportBadge support={def.support} /></div>
        </div>
      </div>
      {mode === "docs" ? (
        <>
          {def.note && <p className="text-sm leading-relaxed text-mist">{l(def.note)}</p>}
          {def.support === "visual" && <p className="text-sm text-warn">{l({ en: "This part is drawn and can be wired, but the simulator doesn't model its behaviour yet.", ar: "القطعة دي بتترسم وتتوصّل، لكن المحاكي لسه مش بيحاكي شغلها." })}</p>}
          {def.props.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-cyan uppercase">{l({ en: "Properties", ar: "الخصائص" })}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {def.props.map((d) => (
                  <div key={d.key} className="contents">
                    <dt className="text-fog">{l(d.label)}</dt>
                    <dd className="font-mono text-frost" dir="ltr">
                      {String(def.defaults[d.key] ?? "—")}
                      {d.type === "number" && d.unit ? ` ${d.unit}` : ""}
                      {d.live && <span className="ms-2 text-xs text-cyan">{l({ en: "adjustable while running", ar: "يتغيّر وهو شغّال" })}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <p className="text-xs text-fog">
            {pins.length} {l({ en: "pins", ar: "طرف" })}
            {groups.length > 0 && ` · ${groups.length} ${l({ en: "internally connected groups", ar: "مجموعات متوصّلة من جوّه" })}`}
          </p>
        </>
      ) : holes ? (
        <div className="grid gap-2 text-sm text-mist">
          <p>{l({ en: "Each numbered column of five holes (a–e and f–j) is one strip: anything plugged into the same strip is connected. The long rails along the edges carry + and −.", ar: "كل عمود مرقّم فيه خمس خروم (a–e و f–j) متوصّلين ببعض: أي حاجة في نفس الشريحة بتبقى متوصّلة. الخطوط الطويلة على الأطراف للموجب والسالب." })}</p>
          <p className="text-xs text-fog">
            {pins.length} {l({ en: "holes", ar: "خرم" })} · {groups.length} {l({ en: "connected strips and rails", ar: "شريحة وخط متوصّلين" })}
          </p>
        </div>
      ) : (
        <div className="max-h-[50vh] overflow-auto rounded-xl ring-1 ring-rim">
          <table className="w-full text-sm" dir="ltr">
            <thead className="sticky top-0 bg-panel text-xs text-fog">
              <tr>
                <th className="px-3 py-1.5 text-start">{l({ en: "Pin", ar: "الطرف" })}</th>
                <th className="px-3 py-1.5 text-start">{l({ en: "Type", ar: "النوع" })}</th>
                <th className="px-3 py-1.5 text-start">{l({ en: "Function", ar: "الوظيفة" })}</th>
              </tr>
            </thead>
            <tbody>
              {pins.map((pin) => {
                const r = pinRole(inst, pin.name);
                return (
                  <tr key={pin.name} className="border-t border-rim">
                    <td className="px-3 py-1 font-mono font-semibold">{pin.label ?? pin.name}</td>
                    <td className="px-3 py-1">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className="size-2.5 rounded-full" style={{ background: PIN_COLORS[r.kind] }} />
                        {r.kind}
                      </span>
                    </td>
                    <td className="px-3 py-1 text-mist">{r.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function Library({ onPick, disabled }: { onPick: (type: string) => void; disabled: boolean }) {
  const { l, t } = useLang();
  const [q, setQ] = useState("");
  const shots = useSnapshots();
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? PARTS.filter((p) => `${p.name.en} ${p.name.ar} ${p.keywords ?? ""}`.toLowerCase().includes(s)) : PARTS;
  }, [q]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-3">
        <Input placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("search")} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {CATEGORIES.map((c) => {
          const items = list.filter((p) => p.category === c.key);
          if (!items.length) return null;
          return (
            <section key={c.key} className="mb-3">
              <h3 className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-fog uppercase">{l(c.label)}</h3>
              <ul className="grid gap-1">
                {items.map((p) => (
                  <li key={p.type}>
                    <button
                      type="button"
                      draggable={!disabled}
                      disabled={disabled}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/x-bx-part", p.type);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => onPick(p.type)}
                      data-testid={`lib-${p.type}`}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start text-sm text-mist hover:bg-panel-2 hover:text-frost disabled:opacity-50"
                    >
                      <PartIcon def={p} shot={shots?.get(p.type)} className="size-12" />
                      <span className="min-w-0 flex-1 truncate">{l(p.name)}</span>
                      {p.support === "visual" && <Badge tone="warn">2D</Badge>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Inspector ────────────────────────────────────────────────────────── */

function PropField({ def, value, onChange, disabled }: { def: PropDef; value: unknown; onChange: (v: string | number | boolean) => void; disabled?: boolean }) {
  const { l } = useLang();
  const id = `prop-${def.key}`;
  if (def.type === "bool")
    return (
      <label className="flex items-center justify-between gap-3 py-1 text-sm">
        <span>{l(def.label)}</span>
        <input id={id} type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-volt" />
      </label>
    );
  if (def.type === "select")
    return (
      <label className="grid gap-1 text-sm">
        <span className="text-fog">{l(def.label)}</span>
        <Select id={id} value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {l(o.label)}
            </option>
          ))}
        </Select>
      </label>
    );
  const num = Number(value);
  const slider = def.max !== undefined && def.min !== undefined && (def.live || def.max - def.min <= 1000);
  return (
    <div className="grid gap-1 text-sm">
      <label htmlFor={id} className="flex justify-between text-fog">
        <span>{l(def.label)}</span>
        <span className="font-mono text-frost" dir="ltr">
          {def.unit === "Ω" || def.unit === "F" ? eng(num, def.unit) : `${def.step && def.step < 1 ? num.toFixed(2) : Math.round(num * 100) / 100}${def.unit ? ` ${def.unit}` : ""}`}
        </span>
      </label>
      {slider ? (
        <input id={id} type="range" min={def.min} max={def.max} step={def.step ?? 1} value={num} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="accent-cyan" />
      ) : (
        <div className="flex gap-2">
          <Input id={id} type="number" dir="ltr" min={def.min} max={def.max} step="any" value={Number.isFinite(num) ? num : ""} disabled={disabled} onChange={(e) => e.target.value !== "" && onChange(Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, Number(e.target.value))))} />
          {def.presets && (
            <Select aria-label={l(def.label)} className="w-28" value="" disabled={disabled} onChange={(e) => e.target.value && onChange(Number(e.target.value))}>
              <option value="">…</option>
              {def.presets.map((p) => (
                <option key={p} value={p}>
                  {eng(p, def.unit ?? "")}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}
    </div>
  );
}

const READOUT: Record<string, (r: Record<string, number>) => [string, string][]> = {
  led: (r) => [["I", eng(r.i ?? 0, "A")], ["V", eng(r.v ?? 0, "V")]],
  resistor: (r) => [["I", eng(r.i ?? 0, "A")], ["V", eng(r.v ?? 0, "V")], ["P", eng(Math.abs((r.i ?? 0) * (r.v ?? 0)), "W")]],
  "rgb-led": (r) => [["R", eng(r.iR ?? 0, "A")], ["G", eng(r.iG ?? 0, "A")], ["B", eng(r.iB ?? 0, "A")]],
  potentiometer: (r) => [["Vwiper", eng(r.vW ?? 0, "V")]],
  capacitor: (r) => [["V", eng(r.v ?? 0, "V")]],
  diode: (r) => [["I", eng(r.i ?? 0, "A")]],
  npn: (r) => [["Ic", eng(r.ic ?? 0, "A")]],
  pnp: (r) => [["Ic", eng(r.ic ?? 0, "A")]],
  nmos: (r) => [["Id", eng(r.id ?? 0, "A")]],
  buzzer: (r) => [["V", eng(r.v ?? 0, "V")], ["f", r.freq ? `${Math.round(r.freq)} Hz` : "—"]],
  servo: (r) => [["θ", r.angle >= 0 ? `${Math.round(r.angle)}°` : "—"], ["pulse", r.pulse_us ? `${Math.round(r.pulse_us)} µs` : "—"], ["V+", eng(r.power ?? 0, "V")]],
  "dc-motor": (r) => [["V", eng(r.v ?? 0, "V")], ["speed", `${Math.round((r.speed ?? 0) * 100)}%`]],
  "battery-9v": (r) => [["I", eng(r.i ?? 0, "A")]],
  "battery-aa": (r) => [["I", eng(r.i ?? 0, "A")]],
  "power-supply": (r) => [["I", eng(r.i ?? 0, "A")]],
  voltmeter: (r) => [["V", eng(r.v ?? 0, "V")]],
  ammeter: (r) => [["I", eng(r.i ?? 0, "A")]],
  "arduino-uno": (r) => [["5V", eng(r.i5V ?? 0, "A")], ["3V3", eng(r.i3V3 ?? 0, "A")]],
  "arduino-nano": (r) => [["5V", eng(r.i5V ?? 0, "A")]],
};

export function Inspector({ store, readings, running, live, onLive, readOnly }: { store: DocStore; readings: Frame["parts"] | undefined; running: boolean; live: Record<string, Record<string, unknown>>; onLive: (part: string, key: string, v: number | boolean) => void; readOnly: boolean }) {
  const { t, l } = useLang();
  const { doc, sel } = useDoc(store);
  const labels = useMemo(() => partLabels(doc, l), [doc, l]);
  const netlist = useMemo(() => buildNetlist(doc), [doc]);
  if (sel.parts.length + sel.wires.length === 0) return <p className="p-4 text-sm leading-relaxed text-fog">{t("noSelection")}</p>;
  if (sel.parts.length + sel.wires.length > 1)
    return (
      <div className="grid gap-3 p-4">
        <p className="text-sm">
          {sel.parts.length} {t("parts")} · {sel.wires.length} wires
        </p>
        {!readOnly && !running && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon="rotate" onClick={() => store.rotate(sel.parts)}>
              {t("rotate")}
            </Button>
            <Button size="sm" icon="copy" onClick={() => store.duplicate()}>
              {t("duplicate")}
            </Button>
            <Button size="sm" variant="danger" icon="trash" onClick={() => store.deleteSelection()}>
              {t("del")}
            </Button>
          </div>
        )}
      </div>
    );
  if (sel.wires.length === 1) {
    const w = doc.wires.find((x) => x.id === sel.wires[0]);
    if (!w) return null;
    return (
      <div className="grid gap-3 p-4">
        <p className="text-sm text-fog" dir="ltr">
          {labels.get(w.a.part)} {w.a.pin} → {labels.get(w.b.part)} {w.b.pin}
        </p>
        <div>
          <p className="mb-2 text-sm">{t("wireColor")}</p>
          <div className="flex flex-wrap gap-2">
            {WIRE_COLORS.map((c) => (
              <button key={c} type="button" aria-label={c} disabled={readOnly || running} onClick={() => store.setWire(w.id, { color: c })} className={cn("size-7 rounded-full ring-2", w.color === c ? "ring-cyan" : "ring-transparent")} style={{ background: c }} />
            ))}
          </div>
        </div>
        {!readOnly && !running && (
          <Button size="sm" variant="danger" icon="trash" onClick={() => store.deleteSelection()}>
            {t("del")}
          </Button>
        )}
      </div>
    );
  }
  const p = doc.parts.find((x) => x.id === sel.parts[0]);
  if (!p) return null;
  const def = PART_BY_TYPE.get(p.type);
  if (!def) return null;
  const pr = propsOf(p);
  const r = readings?.[p.id];
  const rows = r ? READOUT[p.type]?.(r) : undefined;
  return (
    <div className="grid gap-4 p-4" data-testid="inspector">
      <div>
        <p className="font-semibold">{labels.get(p.id)}</p>
        <div className="mt-1.5"><SupportBadge support={def.support} /></div>
        {def.note && <p className="mt-2 text-xs leading-relaxed text-fog">{l(def.note)}</p>}
      </div>
      {def.props.map((d) => (
        <PropField
          key={d.key}
          def={d}
          value={running && d.live ? live[p.id]?.[d.key] ?? pr[d.key] : pr[d.key]}
          disabled={readOnly ? !(running && d.live) : running && !d.live}
          onChange={(v) => (running && d.live ? onLive(p.id, d.key, v as number | boolean) : store.setProp(p.id, d.key, v))}
        />
      ))}
      {p.type === "pushbutton" && running && (
        <Button
          variant="soft"
          onPointerDown={() => onLive(p.id, "pressed", true)}
          onPointerUp={() => onLive(p.id, "pressed", false)}
          onPointerLeave={() => live[p.id]?.pressed && onLive(p.id, "pressed", false)}
        >
          Press
        </Button>
      )}
      {rows && (
        <div className="rounded-xl bg-abyss p-3 ring-1 ring-rim">
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-cyan uppercase">{t("live")}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-sm" dir="ltr">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-fog">{k}</dt>
                <dd className="text-end text-frost">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {def.category !== "breadboards" && (
        <details className="rounded-xl bg-abyss p-3 ring-1 ring-rim" data-testid="connections">
          <summary className="cursor-pointer text-[11px] font-semibold tracking-wide text-cyan uppercase">{l({ en: "Connections", ar: "التوصيلات" })}</summary>
          <ul className="mt-2 grid gap-1.5 text-xs" dir="ltr">
            {def.pins(pr).map((pin) => {
              const net = netlist.netOf.get(`${p.id}:${pin.name}`);
              // Everything electrically joined to this pin, except breadboard holes and this part's own pin.
              const others = (net === undefined ? [] : netlist.nets[net])
                .map((k) => k.split(":") as [string, string])
                .filter(([pp, pn]) => !(pp === p.id && pn === pin.name) && PART_BY_TYPE.get(doc.parts.find((x) => x.id === pp)?.type ?? "")?.category !== "breadboards");
              return (
                <li key={pin.name} className="flex gap-2">
                  <span className="w-10 shrink-0 font-mono font-semibold" style={{ color: PIN_COLORS[pinRole(p, pin.name).kind] }}>
                    {pin.label ?? pin.name}
                  </span>
                  <span className={cn("min-w-0", others.length ? "text-mist" : "text-warn")}>
                    {others.length
                      ? [...others.reduce((m, [pp, pn]) => m.set(pp, [...(m.get(pp) ?? []), pn]), new Map<string, string[]>())].map(([pp, pins]) => `${labels.get(pp) ?? pp} ${pins.join("/")}`).join(", ")
                      : l({ en: "not connected", ar: "مش متوصّل" })}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 font-mono text-[10px] text-fog">id {p.id}</p>
        </details>
      )}
      {!readOnly && !running && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon="rotate" onClick={() => store.rotate([p.id])}>
            {t("rotate")}
          </Button>
          <Button size="sm" icon="copy" onClick={() => store.duplicate([p.id])}>
            {t("duplicate")}
          </Button>
          <Button size="sm" variant="danger" icon="trash" onClick={() => store.deleteSelection()}>
            {t("del")}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ─── Serial monitor ───────────────────────────────────────────────────── */

export function SerialMonitor({ text, lines, onSend, onClear, enabled, code }: { text: string; lines?: SerialLine[]; onSend: (s: string) => void; onClear: () => void; enabled: boolean; code?: string }) {
  const { t, l } = useLang();
  const [line, setLine] = useState("");
  const [ending, setEnding] = useState("\n");
  const [auto, setAuto] = useState(true);
  const [stamps, setStamps] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const [hist, setHist] = useState(-1);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (auto && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [text, auto, stamps]);
  // The baud rate the sketch asks for (the simulated USART runs at whatever the program sets).
  const baud = code?.match(/Serial\.begin\s*\(\s*(\d+)/)?.[1];
  const send = () => {
    if (!enabled) return;
    onSend(line + ending);
    if (line) setSent((h) => [...h.filter((x) => x !== line), line].slice(-30));
    setHist(-1);
    setLine("");
  };
  const shown = stamps && lines ? lines.map((x) => `[${x.t.toFixed(3)} s] ${x.text}`).join("") : text;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: nothing was copied, so say nothing.
    }
  };
  const exportTxt = () => {
    const url = URL.createObjectURL(new Blob([shown], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "serial-monitor.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const lineCount = lines?.length ?? 0;
  return (
    <div className="flex h-full min-h-0 flex-col" dir="ltr">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-2 py-1 text-[11px] text-fog">
        <span className="font-mono">{baud ? `${baud} baud` : l({ en: "no Serial.begin()", ar: "مفيش Serial.begin()" })}</span>
        <span className="font-mono">· {lineCount} {l({ en: "lines", ar: "سطر" })}</span>
        <span className="flex-1" />
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={stamps} onChange={(e) => setStamps(e.target.checked)} data-testid="serial-stamps" />
          {l({ en: "Timestamps (sim time)", ar: "التوقيت (زمن المحاكاة)" })}
        </label>
        <button type="button" className="rounded px-1.5 py-0.5 hover:bg-panel hover:text-frost disabled:opacity-40" onClick={copy} disabled={!shown}>
          {copied ? l({ en: "Copied", ar: "اتنسخ" }) : t("cmCopy")}
        </button>
        <button type="button" className="rounded px-1.5 py-0.5 hover:bg-panel hover:text-frost disabled:opacity-40" onClick={exportTxt} disabled={!shown}>
          .txt
        </button>
      </div>
      <pre ref={box} data-testid="serial-output" className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all bg-[#040b1d] p-3 font-mono text-[12.5px] leading-relaxed text-[#bdf5d0]">
        {shown || <span className="text-fog/60">{t("serialEmpty")}</span>}
      </pre>
      <form
        className="flex items-center gap-2 border-t border-[var(--line)] p-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <Input
          value={line}
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => {
            // Up / down: the lines sent before.
            if (e.key === "ArrowUp" && sent.length) {
              e.preventDefault();
              const i = hist < 0 ? sent.length - 1 : Math.max(0, hist - 1);
              setHist(i);
              setLine(sent[i]);
            } else if (e.key === "ArrowDown" && hist >= 0) {
              e.preventDefault();
              const i = hist + 1;
              setHist(i < sent.length ? i : -1);
              setLine(i < sent.length ? sent[i] : "");
            }
          }}
          placeholder="Serial input"
          disabled={!enabled}
          className="h-8 font-mono"
          aria-label="Serial input"
        />
        <Select value={ending} onChange={(e) => setEnding(e.target.value)} className="h-8 w-28" aria-label="Line ending">
          <option value={"\n"}>\n</option>
          <option value={"\r\n"}>\r\n</option>
          <option value={"\r"}>\r</option>
          <option value="">none</option>
        </Select>
        <Button size="sm" type="submit" disabled={!enabled}>
          {t("send")}
        </Button>
        <IconButton icon={auto ? "check" : "minus"} label={t("autoscroll")} active={auto} onClick={() => setAuto(!auto)} />
        <IconButton icon="trash" label={t("clear")} onClick={onClear} />
      </form>
    </div>
  );
}

/* ─── Diagnostics ──────────────────────────────────────────────────────── */

export function Diagnostics({
  compile,
  sim,
  doc,
  onGoto,
  onSelect,
  sizes,
}: {
  compile: Diagnostic[];
  sim: SimDiagnostic[];
  doc: CircuitDoc;
  onGoto: (file: string, line: number) => void;
  /** Select (and show) the part or wire a finding is about. */
  onSelect?: (target: { part?: string; wire?: string }) => void;
  sizes?: { flash: number; ram: number; flashMax: number; ramMax: number };
}) {
  const { t, l } = useLang();
  const labels = useMemo(() => partLabels(doc, l), [doc, l]);
  const order = { error: 0, warning: 1, info: 2 };
  const items: { level: "error" | "warning" | "info"; text: string; where: string; why?: string; fix?: string; goto?: () => void }[] = [
    ...compile
      .filter((d) => d.severity !== "note")
      .map((d) => {
        const ex = explainCompile(d.message);
        return {
          level: d.severity === "error" ? ("error" as const) : ("warning" as const),
          text: d.message,
          where: d.file ? `${d.file}${d.line ? `:${d.line}:${d.col}` : ""}` : "",
          ...(ex ? { why: l(ex.why), fix: l(ex.fix) } : {}),
          goto: d.line ? () => onGoto(d.file, d.line) : undefined,
        };
      }),
    ...sim
      .map((d) => {
        const target = d.wire && doc.wires.some((w) => w.id === d.wire) ? { wire: d.wire } : d.part && doc.parts.some((p) => p.id === d.part) ? { part: d.part } : null;
        return { level: d.level, text: diagText(d, l, labels), where: "", ...diagHelp(d, l), goto: target && onSelect ? () => onSelect(target) : undefined };
      })
      .sort((a, b) => order[a.level] - order[b.level]),
  ];
  return (
    <div className="h-full overflow-y-auto p-3" data-testid="diagnostics">
      {sizes && (
        <div className="mb-3 grid gap-2 sm:grid-cols-2" dir="ltr">
          {(
            [
              [t("flash"), sizes.flash, sizes.flashMax],
              [t("ram"), sizes.ram, sizes.ramMax],
            ] as const
          ).map(([k, v, max]) => (
            <div key={k} className="rounded-lg bg-abyss p-2 ring-1 ring-rim">
              <div className="flex justify-between text-xs text-fog">
                <span>{k}</span>
                <span className="font-mono text-frost">
                  {v} / {max} B ({Math.round((v / max) * 100)}%)
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded bg-panel-2">
                <div className={cn("h-full rounded", v / max > 0.85 ? "bg-warn" : "bg-cyan")} style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {!items.length ? (
        <p className="text-sm text-fog">{t("noIssues")}</p>
      ) : (
        <ul className="grid gap-1.5">
          {items.map((d, i) => (
            <li key={i}>
              <button type="button" disabled={!d.goto} onClick={d.goto} className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-start text-sm hover:bg-panel disabled:hover:bg-transparent">
                <Icon name={d.level === "info" ? "info" : "alert"} className={cn("mt-0.5 shrink-0", d.level === "error" ? "text-danger" : d.level === "warning" ? "text-warn" : "text-cyan")} />
                <span className="min-w-0 flex-1">
                  <span className={cn(d.level === "error" && "text-[#ffd0d5]")}>{d.text}</span>
                  {d.where && (
                    <span className="ms-2 font-mono text-xs text-fog" dir="ltr">
                      {d.where}
                    </span>
                  )}
                  {d.why && <span className="mt-0.5 block text-xs text-fog">{d.why}</span>}
                  {d.fix && (
                    <span className="mt-0.5 block text-xs text-cyan">
                      {l({ en: "Fix: ", ar: "الحل: " })}
                      {d.fix}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
