"use client";
/**
 * The circuit canvas (SVG). Drag parts from the library or click one then click the canvas; drag a
 * part to move it (multi-select with Shift or a selection box); drag from a pin to another pin to
 * wire them (release on empty canvas to add bends, Esc to cancel); wheel or pinch to zoom; drag the
 * background with the middle button, Space, or one finger to pan. While the simulation runs, the
 * circuit is locked and buttons, switches and knobs respond instead.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GRID, WIRE_COLORS, type CircuitDoc, type PartInstance } from "./model";
import { DocStore, pinIndex, snap, useDoc } from "./doc-store";
import { PART_BY_TYPE, worldBox } from "./parts";
import { PartArt, PartVisual, useSpriteTick, type Reading } from "./render";

export type View = { x: number; y: number; zoom: number };
type Pin = { part: string; pin: string; x: number; y: number };

type Mode =
  | { k: "idle" }
  | { k: "pan"; sx: number; sy: number; vx: number; vy: number }
  | { k: "drag"; ids: string[]; wx: number; wy: number; moved: { x: number; y: number }; tag: string }
  | { k: "marquee"; x0: number; y0: number; x1: number; y1: number; add: boolean }
  | { k: "wire"; from: Pin; pts: [number, number][]; dragging: boolean; sx: number; sy: number }
  | { k: "bend"; wire: string; index: number }
  | { k: "knob"; part: string; sy: number; start: number }
  | { k: "place"; type: string };

const order = (p: PartInstance) => {
  const c = PART_BY_TYPE.get(p.type)?.category;
  return c === "breadboards" ? 0 : c === "boards" ? 1 : 2;
};

export function Canvas({
  store,
  view,
  setView,
  running,
  readings,
  live,
  onLive,
  placing,
  setPlacing,
  wireColor,
  readOnly,
  boardPinVolts,
  realistic = true,
}: {
  store: DocStore;
  view: View;
  setView: (v: View) => void;
  running: boolean;
  readings: Record<string, Reading>;
  live: Record<string, Record<string, unknown>>;
  onLive: (part: string, key: string, value: number | boolean) => void;
  placing: string | null;
  setPlacing: (t: string | null) => void;
  wireColor: string;
  readOnly: boolean;
  boardPinVolts?: (part: string, pin: string) => number | undefined;
  realistic?: boolean;
}) {
  const { doc, sel } = useDoc(store);
  useSpriteTick();
  const svg = useRef<SVGSVGElement>(null);
  const [mode, setMode] = useState<Mode>({ k: "idle" });
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [hoverPin, setHoverPin] = useState<Pin | null>(null);
  const [space, setSpace] = useState(false);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; zoom: number } | null>(null);
  const locked = running || readOnly;

  const pins = useMemo(() => pinIndex(doc), [doc]);
  const holeTypes = useMemo(() => new Set(doc.parts.filter((p) => PART_BY_TYPE.get(p.type)?.category === "breadboards").map((p) => p.id)), [doc.parts]);
  const parts = useMemo(() => [...doc.parts].sort((a, b) => order(a) - order(b)), [doc.parts]);
  const selParts = useMemo(() => new Set(sel.parts), [sel.parts]);
  const selWires = useMemo(() => new Set(sel.wires), [sel.wires]);

  const toWorld = useCallback(
    (cx: number, cy: number) => {
      const r = svg.current!.getBoundingClientRect();
      return { x: view.x + (cx - r.left) / view.zoom, y: view.y + (cy - r.top) / view.zoom };
    },
    [view],
  );

  /** Nearest pin within reach; a part's own leg wins over the breadboard hole under it. */
  const pinAt = useCallback(
    (x: number, y: number): Pin | null => {
      // Breadboard holes answer only close up, so the board itself can still be grabbed between them.
      const reach = Math.max(4.5, 7 / view.zoom);
      let best: Pin | null = null;
      let bd = Infinity;
      for (const p of pins.values()) {
        const hole = holeTypes.has(p.part);
        const d = Math.hypot(p.x - x, p.y - y) + (hole ? 0.5 : 0);
        if (d < (hole ? 3.5 : reach) && d < bd) (best = p), (bd = d);
      }
      return best;
    },
    [pins, holeTypes, view.zoom],
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement) && !(e.target as HTMLElement)?.closest?.(".cm-editor, textarea")) setSpace(true);
      if (e.key === "Escape") {
        setMode({ k: "idle" });
        setPlacing(null);
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [setPlacing]);

  useEffect(() => {
    if (placing) setMode({ k: "place", type: placing });
    else if (modeRef.current.k === "place") setMode({ k: "idle" });
  }, [placing]);

  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number) => {
      const r = svg.current!.getBoundingClientRect();
      const z = Math.min(6, Math.max(0.15, view.zoom * factor));
      const wx = view.x + (cx - r.left) / view.zoom;
      const wy = view.y + (cy - r.top) / view.zoom;
      setView({ zoom: z, x: wx - (cx - r.left) / z, y: wy - (cy - r.top) / z });
    },
    [view, setView],
  );

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.shiftKey && !e.ctrlKey) setView({ ...view, x: view.x + e.deltaY / view.zoom, y: view.y });
      else zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [view, setView, zoomAt]);

  const finishWire = (from: Pin, to: Pin, pts: [number, number][]) => {
    if (from.part === to.part && from.pin === to.pin) return;
    const w = store.addWire({ part: from.part, pin: from.pin }, { part: to.part, pin: to.pin }, pts, wireColor);
    if (w) store.select({ parts: [], wires: [w.id] });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const el = e.target as Element;
    svg.current?.setPointerCapture(e.pointerId);
    if (e.pointerType === "touch") {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        const [a, b] = [...touches.current.values()];
        pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
        setMode({ k: "idle" });
        return;
      }
    }
    const w = toWorld(e.clientX, e.clientY);
    const m = modeRef.current;
    if (e.button === 1 || e.button === 2 || space) {
      if (e.button === 2 && m.k === "wire") return setMode({ k: "idle" });
      return setMode({ k: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
    }
    if (m.k === "place") {
      const def = PART_BY_TYPE.get(m.type);
      const b = def?.box ?? { x: 0, y: 0, w: 0, h: 0 };
      store.addPart(m.type, w.x - (b.x + b.w / 2), w.y - (b.y + b.h / 2));
      setPlacing(null);
      return;
    }
    const partEl = el.closest("[data-part]");
    const partId = partEl?.getAttribute("data-part") ?? null;
    if (running && partId) {
      const action = el.closest("[data-action]")?.getAttribute("data-action");
      if (action === "press") return onLive(partId, "pressed", true), setMode({ k: "knob", part: `press:${partId}`, sy: 0, start: 0 });
      if (action === "toggle") return onLive(partId, "on", !(live[partId]?.on ?? doc.parts.find((p) => p.id === partId)?.props.on));
      if (action === "knob") {
        const start = Number(live[partId]?.pos ?? doc.parts.find((p) => p.id === partId)?.props.pos ?? 0.5);
        return setMode({ k: "knob", part: partId, sy: e.clientY, start });
      }
    }
    if (locked) {
      if (partId) store.select({ parts: [partId], wires: [] });
      else if (e.pointerType === "touch" || !partId) setMode({ k: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
      return;
    }
    if (m.k === "wire" && !m.dragging) {
      const p = pinAt(w.x, w.y);
      if (p && !(p.part === m.from.part && p.pin === m.from.pin)) {
        finishWire(m.from, p, m.pts);
        return setMode({ k: "idle" });
      }
      return setMode({ ...m, pts: [...m.pts, [snap(w.x), snap(w.y)]] });
    }
    const bend = el.getAttribute("data-bend");
    if (bend) {
      const [wire, i] = bend.split("|");
      return setMode({ k: "bend", wire, index: Number(i) });
    }
    const p = pinAt(w.x, w.y);
    if (p) {
      return setMode({ k: "wire", from: p, pts: [], dragging: true, sx: e.clientX, sy: e.clientY });
    }
    const wireId = el.closest("[data-wire]")?.getAttribute("data-wire");
    if (wireId) {
      if (e.detail === 2) {
        // Double-click a wire: add a bend there.
        const wr = doc.wires.find((x) => x.id === wireId);
        if (wr) store.setWire(wireId, { pts: insertBend(doc, wr, snap(w.x), snap(w.y)) });
        return;
      }
      store.select(e.shiftKey ? { parts: sel.parts, wires: toggle(sel.wires, wireId) } : { parts: [], wires: [wireId] });
      return;
    }
    if (partId) {
      const ids = e.shiftKey ? toggle(sel.parts, partId) : selParts.has(partId) ? sel.parts : [partId];
      store.select({ parts: ids, wires: e.shiftKey ? sel.wires : [] });
      if (ids.includes(partId)) setMode({ k: "drag", ids: withPlugged(doc, ids, pins), wx: w.x, wy: w.y, moved: { x: 0, y: 0 }, tag: `drag:${Date.now()}` });
      return;
    }
    if (e.pointerType === "touch") return setMode({ k: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
    if (!e.shiftKey) store.select({ parts: [], wires: [] });
    setMode({ k: "marquee", x0: w.x, y0: w.y, x1: w.x, y1: w.y, add: e.shiftKey });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2 && pinch.current) {
        const [a, b] = [...touches.current.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (pinch.current.zoom * (d / pinch.current.d)) / view.zoom);
        return;
      }
    }
    const w = toWorld(e.clientX, e.clientY);
    setCursor(w);
    const m = modeRef.current;
    switch (m.k) {
      case "pan":
        setView({ ...view, x: m.vx - (e.clientX - m.sx) / view.zoom, y: m.vy - (e.clientY - m.sy) / view.zoom });
        return;
      case "drag": {
        const dx = snap(w.x - m.wx) - m.moved.x;
        const dy = snap(w.y - m.wy) - m.moved.y;
        if (dx || dy) {
          store.moveParts(m.ids, dx, dy, m.tag);
          setMode({ ...m, moved: { x: m.moved.x + dx, y: m.moved.y + dy } });
        }
        return;
      }
      case "marquee":
        setMode({ ...m, x1: w.x, y1: w.y });
        return;
      case "bend": {
        const wr = doc.wires.find((x) => x.id === m.wire);
        if (wr) store.setWire(m.wire, { pts: wr.pts.map((q, i) => (i === m.index ? [snap(w.x), snap(w.y)] : q)) as [number, number][] }, `bend:${m.wire}:${m.index}`);
        return;
      }
      case "knob": {
        if (m.part.startsWith("press:")) return;
        onLive(m.part, "pos", Math.round(Math.min(1, Math.max(0, m.start + (m.sy - e.clientY) / 150)) * 100) / 100);
        return;
      }
    }
    if (!locked) setHoverPin(pinAt(w.x, w.y));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
    const m = modeRef.current;
    const w = toWorld(e.clientX, e.clientY);
    switch (m.k) {
      case "pan":
      case "drag":
      case "bend":
        setMode({ k: "idle" });
        return;
      case "knob":
        if (m.part.startsWith("press:")) onLive(m.part.slice(6), "pressed", false);
        setMode({ k: "idle" });
        return;
      case "marquee": {
        const x0 = Math.min(m.x0, m.x1);
        const x1 = Math.max(m.x0, m.x1);
        const y0 = Math.min(m.y0, m.y1);
        const y1 = Math.max(m.y0, m.y1);
        if (x1 - x0 > 3 || y1 - y0 > 3) {
          const inside = doc.parts.filter((p) => {
            const b = worldBox(p);
            return b.x >= x0 && b.y >= y0 && b.x + b.w <= x1 && b.y + b.h <= y1;
          });
          const ids = inside.map((p) => p.id);
          const set = new Set(ids);
          const wires = doc.wires.filter((x) => set.has(x.a.part) && set.has(x.b.part)).map((x) => x.id);
          store.select(m.add ? { parts: [...new Set([...sel.parts, ...ids])], wires: [...new Set([...sel.wires, ...wires])] } : { parts: ids, wires });
        }
        setMode({ k: "idle" });
        return;
      }
      case "wire": {
        if (!m.dragging) return;
        const p = pinAt(w.x, w.y);
        const far = Math.hypot(e.clientX - m.sx, e.clientY - m.sy) > 6;
        if (p && !(p.part === m.from.part && p.pin === m.from.pin)) {
          finishWire(m.from, p, m.pts);
          setMode({ k: "idle" });
        } else setMode({ ...m, dragging: false, pts: far ? [...m.pts, [snap(w.x), snap(w.y)]] : m.pts });
        return;
      }
    }
  };

  const onDrop = (e: React.DragEvent) => {
    const type = e.dataTransfer.getData("application/x-bx-part");
    if (!type || locked) return;
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    const b = PART_BY_TYPE.get(type)?.box ?? { x: 0, y: 0, w: 0, h: 0 };
    store.addPart(type, w.x - (b.x + b.w / 2), w.y - (b.y + b.h / 2));
  };

  const gridPx = GRID * view.zoom;
  const showHoles = view.zoom > 0.5;
  const wiringFrom = mode.k === "wire" ? mode : null;
  const placingDef = mode.k === "place" ? PART_BY_TYPE.get(mode.type) : null;

  return (
    <svg
      ref={svg}
      data-testid="circuit-canvas"
      className="block size-full touch-none select-none bg-[#0a1430]"
      style={{ cursor: mode.k === "pan" || space ? "grabbing" : mode.k === "place" ? "copy" : hoverPin && !locked ? "crosshair" : "default" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHoverPin(null)}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={(e) => e.dataTransfer.types.includes("application/x-bx-part") && e.preventDefault()}
      onDrop={onDrop}
    >
      <defs>
        <pattern id="bx-grid" width={gridPx} height={gridPx} patternUnits="userSpaceOnUse" x={-view.x * view.zoom} y={-view.y * view.zoom}>
          {showHoles && <circle cx={0.5} cy={0.5} r={0.8} fill="rgba(140,170,230,.18)" />}
        </pattern>
        <pattern id="bx-grid-major" width={gridPx * 10} height={gridPx * 10} patternUnits="userSpaceOnUse" x={-view.x * view.zoom} y={-view.y * view.zoom}>
          <path d={`M ${gridPx * 10} 0 L 0 0 0 ${gridPx * 10}`} fill="none" stroke="rgba(120,160,230,.08)" strokeWidth={1} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#bx-grid)" />
      <rect width="100%" height="100%" fill="url(#bx-grid-major)" />
      <g transform={`scale(${view.zoom}) translate(${-view.x} ${-view.y})`}>
        {parts.map((p) => {
          const sup = PART_BY_TYPE.get(p.type)?.support;
          return (
            <g key={p.id} data-part={p.id} transform={`translate(${p.x} ${p.y})`} style={{ cursor: locked ? "default" : "move" }} data-testid={`part-${p.type}`}>
              <PartVisual p={p} r={readings[p.id]} live={live[p.id]} realistic={realistic} />
              {sup === "visual" && <text y={-6} fontSize={6} fill="#ffb547">VISUAL ONLY</text>}
            </g>
          );
        })}
        {[...selParts].map((id) => {
          const p = doc.parts.find((x) => x.id === id);
          if (!p) return null;
          const b = worldBox(p);
          return <rect key={id} x={b.x - 3} y={b.y - 3} width={b.w + 6} height={b.h + 6} rx={4} fill="none" stroke="#3cc4ff" strokeWidth={1.4 / view.zoom} strokeDasharray={`${4 / view.zoom} ${3 / view.zoom}`} pointerEvents="none" />;
        })}
        {doc.wires.map((w) => {
          const a = pins.get(`${w.a.part}:${w.a.pin}`);
          const b = pins.get(`${w.b.part}:${w.b.pin}`);
          if (!a || !b) return null;
          const pts = [[a.x, a.y], ...w.pts, [b.x, b.y]];
          const d = pts.map((q, i) => `${i ? "L" : "M"}${q[0]} ${q[1]}`).join(" ");
          const selected = selWires.has(w.id);
          return (
            <g key={w.id} data-wire={w.id} style={{ cursor: locked ? "default" : "pointer" }}>
              <path d={d} fill="none" stroke="transparent" strokeWidth={8} />
              {/* A jumper wire: soft shadow on the bench, glossy insulation, metal pin at each end. */}
              <path d={d} fill="none" stroke="rgba(0,0,0,.38)" strokeWidth={3.6} strokeLinejoin="round" strokeLinecap="round" transform="translate(1.6 2.2)" style={{ filter: "blur(1.2px)" }} pointerEvents="none" />
              {selected && <path d={d} fill="none" stroke="#3cc4ff" strokeWidth={5.4} strokeLinejoin="round" strokeLinecap="round" opacity={0.55} />}
              <path d={d} fill="none" stroke={w.color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
              <path d={d} fill="none" stroke="rgba(0,0,0,.28)" strokeWidth={1} strokeLinejoin="round" strokeLinecap="round" transform="translate(0.5 0.7)" pointerEvents="none" />
              <path d={d} fill="none" stroke="rgba(255,255,255,.42)" strokeWidth={0.7} strokeLinejoin="round" strokeLinecap="round" transform="translate(-0.55 -0.65)" pointerEvents="none" />
              {[a, b].map((q, i) => (
                <g key={i} pointerEvents="none">
                  <circle cx={q.x} cy={q.y} r={2.3} fill="#1b1b1b" />
                  <circle cx={q.x} cy={q.y} r={1.1} fill="#c9ced6" />
                </g>
              ))}
              {selected &&
                !locked &&
                w.pts.map((q, i) => (
                  <rect key={i} data-bend={`${w.id}|${i}`} x={q[0] - 3} y={q[1] - 3} width={6} height={6} rx={1} fill="#081634" stroke="#3cc4ff" strokeWidth={1} style={{ cursor: "move" }} />
                ))}
            </g>
          );
        })}
        {wiringFrom && cursor && (
          <polyline
            points={[[wiringFrom.from.x, wiringFrom.from.y], ...wiringFrom.pts, [hoverPin?.x ?? snap(cursor.x), hoverPin?.y ?? snap(cursor.y)]].map((q) => q.join(",")).join(" ")}
            fill="none"
            stroke={wireColor}
            strokeWidth={2.4}
            strokeDasharray="5 3"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        )}
        {hoverPin && !locked && (
          <g pointerEvents="none">
            <circle cx={hoverPin.x} cy={hoverPin.y} r={4} fill="none" stroke="#3cff9a" strokeWidth={1.4} />
            <PinLabel pin={hoverPin} doc={doc} volts={boardPinVolts?.(hoverPin.part, hoverPin.pin)} zoom={view.zoom} />
          </g>
        )}
        {mode.k === "marquee" && (
          <rect x={Math.min(mode.x0, mode.x1)} y={Math.min(mode.y0, mode.y1)} width={Math.abs(mode.x1 - mode.x0)} height={Math.abs(mode.y1 - mode.y0)} fill="rgba(60,196,255,.08)" stroke="#3cc4ff" strokeWidth={1 / view.zoom} pointerEvents="none" />
        )}
        {placingDef && cursor && (
          <g opacity={0.6} pointerEvents="none" transform={`translate(${snap(cursor.x - (placingDef.box.x + placingDef.box.w / 2))} ${snap(cursor.y - (placingDef.box.y + placingDef.box.h / 2))})`}>
            <PartArt p={{ id: "ghost", type: placingDef.type, x: 0, y: 0, rot: 0, props: { ...placingDef.defaults } }} />
          </g>
        )}
      </g>
    </svg>
  );
}

function PinLabel({ pin, doc, volts, zoom }: { pin: Pin; doc: CircuitDoc; volts?: number; zoom: number }) {
  const p = doc.parts.find((x) => x.id === pin.part);
  const name = p ? PART_BY_TYPE.get(p.type)?.name.en ?? p.type : "";
  const text = `${name} · ${pin.pin}${volts !== undefined ? ` · ${volts.toFixed(2)} V` : ""}`;
  const s = 1 / Math.max(zoom, 0.6);
  return (
    <g transform={`translate(${pin.x + 6} ${pin.y - 8}) scale(${s})`}>
      <rect x={0} y={-9} width={text.length * 5.6 + 8} height={13} rx={3} fill="#050e26" stroke="#3cff9a" strokeWidth={0.6} opacity={0.95} />
      <text x={4} y={0} fontSize={9} fill="#e6edf9" fontFamily="ui-monospace, monospace">
        {text}
      </text>
    </g>
  );
}

/** Moving a breadboard or board carries the parts plugged into it (every leg in one of its holes). */
function withPlugged(doc: CircuitDoc, ids: string[], pins: ReturnType<typeof pinIndex>): string[] {
  const hosts = new Set(ids.filter((id) => ["breadboards", "boards"].includes(PART_BY_TYPE.get(doc.parts.find((p) => p.id === id)?.type ?? "")?.category ?? "")));
  if (!hosts.size) return ids;
  const spots = new Set<string>();
  for (const p of pins.values()) if (hosts.has(p.part)) spots.add(`${p.x},${p.y}`);
  const out = new Set(ids);
  for (const part of doc.parts) {
    if (out.has(part.id) || PART_BY_TYPE.get(part.type)?.category === "breadboards" || PART_BY_TYPE.get(part.type)?.mcu) continue;
    const legs = [...pins.values()].filter((p) => p.part === part.id);
    if (legs.length && legs.every((p) => spots.has(`${p.x},${p.y}`))) out.add(part.id);
  }
  return [...out];
}

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

/** Where to put a new bend so it lands on the segment nearest the click. */
function insertBend(doc: CircuitDoc, w: CircuitDoc["wires"][number], x: number, y: number): [number, number][] {
  const pins = pinIndex(doc);
  const a = pins.get(`${w.a.part}:${w.a.pin}`)!;
  const b = pins.get(`${w.b.part}:${w.b.pin}`)!;
  const pts: [number, number][] = [[a.x, a.y], ...w.pts, [b.x, b.y]];
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = segDist(x, y, pts[i], pts[i + 1]);
    if (d < bd) (bd = d), (best = i);
  }
  const out = [...w.pts];
  out.splice(best, 0, [x, y]);
  return out;
}
function segDist(x: number, y: number, [ax, ay]: [number, number], [bx, by]: [number, number]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

export const DEFAULT_WIRE = WIRE_COLORS[0];

/** A view that fits the whole circuit in a box of the given size. */
export function fitView(doc: CircuitDoc, width: number, height: number): View {
  if (!doc.parts.length) return { x: -width / 2, y: -height / 2, zoom: 1 };
  const boxes = doc.parts.map(worldBox);
  const x0 = Math.min(...boxes.map((b) => b.x)) - 30;
  const y0 = Math.min(...boxes.map((b) => b.y)) - 30;
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + 30;
  const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + 30;
  const zoom = Math.min(4, Math.max(0.2, Math.min(width / (x1 - x0), height / (y1 - y0))));
  return { zoom, x: x0 - (width / zoom - (x1 - x0)) / 2, y: y0 - (height / zoom - (y1 - y0)) / 2 };
}
