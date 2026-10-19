"use client";
/**
 * The circuit canvas. Parts are placed from the library (drag, or click then click), moved by dragging
 * (Shift-click or a selection box for several), and wired by dragging from a pin to another pin or by
 * clicking a pin, clicking bends, and clicking the last pin (Esc cancels). Wheel or pinch zooms around
 * the pointer; the middle button, Space-drag or one finger pans, so panning never starts a wire.
 * Hovering a pin shows what it is and lights up everything electrically joined to it (its breadboard
 * strip, wires, other parts' legs). Right-click (or a long press) opens the context menu.
 * While the simulation runs the circuit is locked and buttons, switches and knobs respond instead.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLang } from "../i18n";
import { cn } from "../ui";
import { DocStore, pinIndex, settingsOf, useDoc } from "./doc-store";
import { WIRE_COLORS, type CircuitDoc, type PartInstance } from "./model";
import { buildNetlist, key as pinKey } from "./netlist";
import { PART_BY_TYPE, PIN_COLORS, pinRole, worldBox } from "./parts";
import { PartArt, PartVisual, useSpriteTick, type Reading } from "./render";

export type View = { x: number; y: number; zoom: number };
type Pin = { part: string; pin: string; x: number; y: number };
export type MenuTarget = { kind: "part"; id: string } | { kind: "wire"; id: string } | { kind: "canvas"; x: number; y: number };

type Mode =
  | { k: "idle" }
  | { k: "pan"; sx: number; sy: number; vx: number; vy: number }
  | { k: "drag"; ids: string[]; wx: number; wy: number; moved: { x: number; y: number }; tag: string }
  | { k: "marquee"; x0: number; y0: number; x1: number; y1: number; add: boolean }
  | { k: "wire"; from: Pin; pts: [number, number][]; dragging: boolean; sx: number; sy: number }
  | { k: "bend"; wire: string; index: number; tag: string }
  | { k: "end"; wire: string; end: "a" | "b" }
  | { k: "knob"; part: string; sy: number; start: number }
  | { k: "place"; type: string };

const order = (p: PartInstance) => {
  const c = PART_BY_TYPE.get(p.type)?.category;
  return c === "breadboards" ? 0 : c === "boards" ? 1 : 2;
};
const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

export type CanvasActions = {
  inspect: (id: string) => void;
  pinout: (type: string) => void;
  docs: (type: string) => void;
  label: (t: { kind: "part" | "wire"; id: string }) => void;
  copy: () => void;
  paste: (at?: { x: number; y: number }) => void;
  fit: () => void;
  confirmDelete: () => void;
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
  actions,
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
  actions?: CanvasActions;
}) {
  const { t, l } = useLang();
  const { doc, sel } = useDoc(store);
  useSpriteTick();
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [mode, setMode] = useState<Mode>({ k: "idle" });
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [screen, setScreen] = useState<{ x: number; y: number } | null>(null);
  const [hoverPin, setHoverPin] = useState<Pin | null>(null);
  const [hoverPart, setHoverPart] = useState<string | null>(null);
  const [hoverWire, setHoverWire] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; target: MenuTarget } | null>(null);
  const [space, setSpace] = useState(false);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; zoom: number } | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = running || readOnly;
  const settings = settingsOf(doc);
  const snapTo = useCallback((v: number) => (settings.snap ? Math.round(v / settings.grid) * settings.grid : Math.round(v)), [settings.snap, settings.grid]);

  const pins = useMemo(() => pinIndex(doc), [doc]);
  const netlist = useMemo(() => buildNetlist(doc), [doc]);
  const holeParts = useMemo(() => new Set(doc.parts.filter((p) => PART_BY_TYPE.get(p.type)?.category === "breadboards").map((p) => p.id)), [doc.parts]);
  const parts = useMemo(() => doc.parts.map((p, i) => ({ p, i })).sort((a, b) => order(a.p) - order(b.p) || a.i - b.i).map((x) => x.p), [doc.parts]);
  const partById = useMemo(() => new Map(doc.parts.map((p) => [p.id, p])), [doc.parts]);
  const selParts = useMemo(() => new Set(sel.parts), [sel.parts]);
  const selWires = useMemo(() => new Set(sel.wires), [sel.wires]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
        const hole = holeParts.has(p.part);
        const d = Math.hypot(p.x - x, p.y - y) + (hole ? 0.5 : 0);
        if (d < (hole ? 3.5 : reach) && d < bd) (best = p), (bd = d);
      }
      return best;
    },
    [pins, holeParts, view.zoom],
  );

  /* ── Electrical highlighting: the net under the pointer, or of the selected wires ── */
  const litNets = useMemo(() => {
    const nets = new Set<number>();
    const add = (part: string, pin: string) => {
      const n = netlist.netOf.get(pinKey(part, pin));
      if (n !== undefined) nets.add(n);
    };
    if (hoverPin) add(hoverPin.part, hoverPin.pin);
    for (const id of [...sel.wires, ...(hoverWire ? [hoverWire] : [])]) {
      const w = doc.wires.find((x) => x.id === id);
      if (w) add(w.a.part, w.a.pin);
    }
    return nets;
  }, [hoverPin, hoverWire, sel.wires, doc.wires, netlist]);
  const litPins = useMemo(() => {
    const out: Pin[] = [];
    for (const n of litNets) for (const k of netlist.nets[n] ?? []) {
      const p = pins.get(k);
      if (p) out.push(p);
    }
    return out;
  }, [litNets, netlist, pins]);

  /** Where two or more wires meet at one pin: a junction (crossings get no dot). */
  const junctions = useMemo(() => {
    const count = new Map<string, number>();
    for (const w of doc.wires)
      for (const e of [w.a, w.b]) {
        const p = pins.get(`${e.part}:${e.pin}`);
        if (p) count.set(`${p.x},${p.y}`, (count.get(`${p.x},${p.y}`) ?? 0) + 1);
      }
    return [...count].filter(([, n]) => n >= 2).map(([k]) => k.split(",").map(Number) as [number, number]);
  }, [doc.wires, pins]);

  /** Orthogonal routing: an L-bend so wires run along the grid. */
  const route = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }): [number, number][] => (settings.routing === "ortho" && from.x !== to.x && from.y !== to.y ? [[from.x, to.y]] : []),
    [settings.routing],
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || !!(e.target as HTMLElement)?.closest?.(".cm-editor");
      if (e.code === "Space" && !typing) setSpace(true);
      if (e.key === "Escape") {
        setMode({ k: "idle" });
        setPlacing(null);
        setMenu(null);
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
  const zoomTo = (z: number) => {
    const r = svg.current!.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, z / view.zoom);
  };

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      setMenu(null);
      // Trackpads: two-finger scroll pans, pinch (ctrlKey) zooms. Mouse wheels zoom.
      const trackpadPan = !e.ctrlKey && e.deltaMode === 0 && Math.abs(e.deltaX) > 0;
      if (trackpadPan || (e.shiftKey && !e.ctrlKey)) setView({ ...view, x: view.x + (e.shiftKey ? e.deltaY : e.deltaX) / view.zoom, y: view.y + (e.shiftKey ? 0 : e.deltaY) / view.zoom });
      else zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [view, setView, zoomAt]);

  const finishWire = (from: Pin, to: Pin, pts: [number, number][]) => {
    if (from.part === to.part && from.pin === to.pin) return;
    const last = pts.length ? { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] } : from;
    const tail = route(last, to);
    const w = store.addWire({ part: from.part, pin: from.pin }, { part: to.part, pin: to.pin }, [...pts, ...tail], wireColor);
    if (w) store.select({ parts: [], wires: [w.id] });
  };

  const openMenu = (clientX: number, clientY: number, target: MenuTarget) => {
    const r = box.current!.getBoundingClientRect();
    setMenu({ x: clientX - r.left, y: clientY - r.top, target });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const el = e.target as Element;
    if (el.closest("[data-overlay]")) return;
    setMenu(null);
    svg.current?.setPointerCapture(e.pointerId);
    const w = toWorld(e.clientX, e.clientY);
    const partId = el.closest("[data-part]")?.getAttribute("data-part") ?? null;
    const wireId = el.closest("[data-wire]")?.getAttribute("data-wire") ?? null;
    if (e.pointerType === "touch") {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        const [a, b] = [...touches.current.values()];
        pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
        if (longPress.current) clearTimeout(longPress.current);
        setMode({ k: "idle" });
        return;
      }
      // A long press opens the context menu on touch screens.
      const target: MenuTarget = partId ? { kind: "part", id: partId } : wireId ? { kind: "wire", id: wireId } : { kind: "canvas", x: w.x, y: w.y };
      const sx = e.clientX;
      const sy = e.clientY;
      longPress.current = setTimeout(() => {
        setMode({ k: "idle" });
        openMenu(sx, sy, target);
      }, 550);
    }
    const m = modeRef.current;
    if (e.button === 2) {
      if (m.k === "wire") return setMode({ k: "idle" });
      openMenu(e.clientX, e.clientY, partId ? { kind: "part", id: partId } : wireId ? { kind: "wire", id: wireId } : { kind: "canvas", x: w.x, y: w.y });
      if (partId && !selParts.has(partId)) store.select({ parts: [partId], wires: [] });
      if (wireId && !selWires.has(wireId)) store.select({ parts: [], wires: [wireId] });
      return;
    }
    if (e.button === 1 || space) return setMode({ k: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
    if (m.k === "place") {
      const def = PART_BY_TYPE.get(m.type);
      const b = def?.box ?? { x: 0, y: 0, w: 0, h: 0 };
      store.addPart(m.type, snapTo(w.x - (b.x + b.w / 2)), snapTo(w.y - (b.y + b.h / 2)));
      setPlacing(null);
      return;
    }
    if (running && partId) {
      const action = el.closest("[data-action]")?.getAttribute("data-action");
      if (action === "press") return onLive(partId, "pressed", true), setMode({ k: "knob", part: `press:${partId}`, sy: 0, start: 0 });
      if (action === "toggle") return onLive(partId, "on", !(live[partId]?.on ?? partById.get(partId)?.props.on));
      if (action === "knob") {
        const start = Number(live[partId]?.pos ?? partById.get(partId)?.props.pos ?? 0.5);
        return setMode({ k: "knob", part: partId, sy: e.clientY, start });
      }
    }
    if (locked) {
      if (partId) store.select({ parts: [partId], wires: [] });
      else setMode({ k: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
      return;
    }
    if (m.k === "wire" && !m.dragging) {
      const p = pinAt(w.x, w.y);
      if (p && !(p.part === m.from.part && p.pin === m.from.pin)) {
        finishWire(m.from, p, m.pts);
        return setMode({ k: "idle" });
      }
      // A bend; in orthogonal mode the corner keeps both segments on the grid.
      const last = m.pts.length ? { x: m.pts[m.pts.length - 1][0], y: m.pts[m.pts.length - 1][1] } : m.from;
      const at = { x: snapTo(w.x), y: snapTo(w.y) };
      return setMode({ ...m, pts: [...m.pts, ...route(last, at), [at.x, at.y]] });
    }
    const handle = el.getAttribute("data-bend");
    if (handle) {
      const [wire, i] = handle.split("|");
      return setMode({ k: "bend", wire, index: Number(i), tag: `drag:bend:${Date.now()}` });
    }
    const end = el.getAttribute("data-end");
    if (end) {
      const [wire, which] = end.split("|");
      return setMode({ k: "end", wire, end: which as "a" | "b" });
    }
    const p = pinAt(w.x, w.y);
    if (p) return setMode({ k: "wire", from: p, pts: [], dragging: true, sx: e.clientX, sy: e.clientY });
    if (wireId) {
      if (e.detail === 2) {
        // Double-click a wire: add a bend there.
        const wr = doc.wires.find((x) => x.id === wireId);
        if (wr) store.setWire(wireId, { pts: insertBend(doc, wr, snapTo(w.x), snapTo(w.y)) });
        return;
      }
      store.select(e.shiftKey ? { parts: sel.parts, wires: toggle(sel.wires, wireId) } : { parts: [], wires: [wireId] });
      return;
    }
    if (partId) {
      if (e.detail === 2) {
        actions?.inspect(partId);
        return;
      }
      const ids = e.shiftKey ? toggle(sel.parts, partId) : selParts.has(partId) ? sel.parts : [partId];
      store.select({ parts: ids, wires: e.shiftKey ? sel.wires : [] });
      if (ids.includes(partId) && !partById.get(partId)?.locked) setMode({ k: "drag", ids: withPlugged(doc, ids, pins), wx: w.x, wy: w.y, moved: { x: 0, y: 0 }, tag: `drag:${Date.now()}` });
      return;
    }
    if (e.pointerType === "touch") return setMode({ k: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
    if (!e.shiftKey) store.select({ parts: [], wires: [] });
    setMode({ k: "marquee", x0: w.x, y0: w.y, x1: w.x, y1: w.y, add: e.shiftKey });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (longPress.current && touches.current.has(e.pointerId)) {
      const s = touches.current.get(e.pointerId)!;
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) {
        clearTimeout(longPress.current);
        longPress.current = null;
      }
    }
    if (e.pointerType === "touch" && touches.current.size === 2 && pinch.current) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...touches.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (pinch.current.zoom * (d / pinch.current.d)) / view.zoom);
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    const r = box.current!.getBoundingClientRect();
    setCursor(w);
    setScreen({ x: e.clientX - r.left, y: e.clientY - r.top });
    const m = modeRef.current;
    switch (m.k) {
      case "pan":
        setView({ ...view, x: m.vx - (e.clientX - m.sx) / view.zoom, y: m.vy - (e.clientY - m.sy) / view.zoom });
        return;
      case "drag": {
        const dx = snapTo(w.x - m.wx) - m.moved.x;
        const dy = snapTo(w.y - m.wy) - m.moved.y;
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
        if (wr) store.setWire(m.wire, { pts: wr.pts.map((q, i) => (i === m.index ? [snapTo(w.x), snapTo(w.y)] : q)) as [number, number][] }, m.tag);
        return;
      }
      case "knob": {
        if (m.part.startsWith("press:")) return;
        onLive(m.part, "pos", Math.round(Math.min(1, Math.max(0, m.start + (m.sy - e.clientY) / 150)) * 100) / 100);
        return;
      }
    }
    const el = e.target as Element;
    setHoverPart(el.closest?.("[data-part]")?.getAttribute("data-part") ?? null);
    setHoverWire(el.closest?.("[data-wire]")?.getAttribute("data-wire") ?? null);
    setHoverPin(locked && !running ? null : pinAt(w.x, w.y));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (longPress.current) {
      clearTimeout(longPress.current);
      longPress.current = null;
    }
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
      case "end": {
        const p = pinAt(w.x, w.y);
        const wr = doc.wires.find((x) => x.id === m.wire);
        if (p && wr) {
          const other = m.end === "a" ? wr.b : wr.a;
          if (!(other.part === p.part && other.pin === p.pin)) store.setWire(m.wire, { [m.end]: { part: p.part, pin: p.pin } });
        }
        setMode({ k: "idle" });
        return;
      }
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
        } else if (far) {
          const at = { x: snapTo(w.x), y: snapTo(w.y) };
          setMode({ ...m, dragging: false, pts: [...m.pts, ...route(m.from, at), [at.x, at.y]] });
        } else setMode({ ...m, dragging: false });
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
    store.addPart(type, snapTo(w.x - (b.x + b.w / 2)), snapTo(w.y - (b.y + b.h / 2)));
  };

  const gridPx = settings.grid * view.zoom;
  const showDots = settings.showGrid && settings.background !== "plain" && gridPx > 4;
  const wiringFrom = mode.k === "wire" ? mode : null;
  const placingDef = mode.k === "place" ? PART_BY_TYPE.get(mode.type) : null;
  const endDrag = mode.k === "end" ? mode : null;

  // Wire preview: from the last point to the pin under the pointer (or the pointer), routed.
  const preview = (() => {
    if (!wiringFrom || !cursor) return null;
    const last = wiringFrom.pts.length ? { x: wiringFrom.pts[wiringFrom.pts.length - 1][0], y: wiringFrom.pts[wiringFrom.pts.length - 1][1] } : wiringFrom.from;
    const to = hoverPin ?? { x: snapTo(cursor.x), y: snapTo(cursor.y) };
    return [[wiringFrom.from.x, wiringFrom.from.y], ...wiringFrom.pts, ...route(last, to), [to.x, to.y]];
  })();

  const hoverDef = hoverPart ? PART_BY_TYPE.get(partById.get(hoverPart)?.type ?? "") : null;

  return (
    <div ref={box} className="relative size-full overflow-hidden" data-testid="canvas-box" onContextMenu={(e) => e.preventDefault()}>
      <svg
        ref={svg}
        data-testid="circuit-canvas"
        className="block size-full touch-none select-none"
        style={{
          background: settings.background === "plain" ? "#0b1530" : "#0a1430",
          cursor: mode.k === "pan" || space ? "grabbing" : mode.k === "place" ? "copy" : hoverPin && !locked ? "crosshair" : mode.k === "wire" ? "crosshair" : "default",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          setHoverPin(null);
          setHoverPart(null);
          setHoverWire(null);
          setScreen(null);
        }}
        onDragOver={(e) => e.dataTransfer.types.includes("application/x-bx-part") && e.preventDefault()}
        onDrop={onDrop}
      >
        <defs>
          <pattern id="bx-grid" width={gridPx} height={gridPx} patternUnits="userSpaceOnUse" x={-view.x * view.zoom} y={-view.y * view.zoom}>
            {settings.background === "lines" ? <path d={`M ${gridPx} 0 L 0 0 0 ${gridPx}`} fill="none" stroke="rgba(120,160,230,.10)" strokeWidth={1} /> : <circle cx={0.5} cy={0.5} r={0.9} fill="rgba(140,170,230,.22)" />}
          </pattern>
          <pattern id="bx-grid-major" width={gridPx * 10} height={gridPx * 10} patternUnits="userSpaceOnUse" x={-view.x * view.zoom} y={-view.y * view.zoom}>
            <path d={`M ${gridPx * 10} 0 L 0 0 0 ${gridPx * 10}`} fill="none" stroke="rgba(120,160,230,.09)" strokeWidth={1} />
          </pattern>
        </defs>
        {showDots && <rect width="100%" height="100%" fill="url(#bx-grid)" />}
        {settings.showGrid && settings.background !== "plain" && <rect width="100%" height="100%" fill="url(#bx-grid-major)" />}
        <g transform={`scale(${view.zoom}) translate(${-view.x} ${-view.y})`}>
          {parts.map((p) => {
            const sup = PART_BY_TYPE.get(p.type)?.support;
            return (
              <g key={p.id} data-part={p.id} transform={`translate(${p.x} ${p.y})`} style={{ cursor: locked || p.locked ? "default" : "move" }} data-testid={`part-${p.type}`}>
                {realistic ? <PartVisual p={p} r={readings[p.id]} live={live[p.id]} realistic /> : (
                  <g transform={`rotate(${p.rot})`}>
                    <PartArt p={p} r={readings[p.id]} live={live[p.id]} />
                  </g>
                )}
                {sup === "visual" && (
                  <text y={-6} fontSize={6} fill="#ffb547">
                    VISUAL ONLY
                  </text>
                )}
              </g>
            );
          })}
          {/* Hover and selection outlines, labels, locks. */}
          {hoverPart && !selParts.has(hoverPart) && partById.get(hoverPart) && <Outline p={partById.get(hoverPart)!} zoom={view.zoom} tone="hover" />}
          {[...selParts].map((id) => partById.get(id) && <Outline key={id} p={partById.get(id)!} zoom={view.zoom} tone="selected" onRotate={!locked && !partById.get(id)!.locked ? () => store.rotate([id]) : undefined} />)}
          {doc.parts.map((p) => {
            if (!p.label && !p.locked) return null;
            const b = worldBox(p);
            return (
              <g key={`meta-${p.id}`} pointerEvents="none">
                {p.label && <Halo x={b.x + b.w / 2} y={b.y - 6} size={7} anchor="middle">{p.label}</Halo>}
                {p.locked && <LockGlyph x={b.x + b.w - 4} y={b.y + 4} />}
              </g>
            );
          })}
          {doc.wires.map((w) => {
            const a = pins.get(`${w.a.part}:${w.a.pin}`);
            const b = pins.get(`${w.b.part}:${w.b.pin}`);
            if (!a || !b) return null;
            const ends = endDrag?.wire === w.id && cursor ? (endDrag.end === "a" ? [cursor, b] : [a, cursor]) : [a, b];
            const pts = [[ends[0].x, ends[0].y], ...w.pts, [ends[1].x, ends[1].y]];
            const d = pts.map((q, i) => `${i ? "L" : "M"}${q[0]} ${q[1]}`).join(" ");
            const selected = selWires.has(w.id);
            const net = netlist.netOf.get(pinKey(w.a.part, w.a.pin));
            const lit = net !== undefined && litNets.has(net);
            const mid = pts[Math.floor((pts.length - 1) / 2)];
            const mid2 = pts[Math.floor((pts.length - 1) / 2) + 1] ?? mid;
            return (
              <g key={w.id} data-wire={w.id} style={{ cursor: locked ? "default" : "pointer" }}>
                <path d={d} fill="none" stroke="transparent" strokeWidth={8} />
                {/* A jumper wire: soft shadow on the bench, glossy insulation, metal pin at each end. */}
                <path d={d} fill="none" stroke="rgba(0,0,0,.38)" strokeWidth={3.6} strokeLinejoin="round" strokeLinecap="round" transform="translate(1.6 2.2)" style={{ filter: "blur(1.2px)" }} pointerEvents="none" />
                {(selected || lit) && <path d={d} fill="none" stroke={selected ? "#3cc4ff" : "#3cff9a"} strokeWidth={5.6} strokeLinejoin="round" strokeLinecap="round" opacity={0.5} />}
                <path d={d} fill="none" stroke={w.color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
                <path d={d} fill="none" stroke="rgba(0,0,0,.28)" strokeWidth={1} strokeLinejoin="round" strokeLinecap="round" transform="translate(0.5 0.7)" pointerEvents="none" />
                <path d={d} fill="none" stroke="rgba(255,255,255,.42)" strokeWidth={0.7} strokeLinejoin="round" strokeLinecap="round" transform="translate(-0.55 -0.65)" pointerEvents="none" />
                {ends.map((q, i) => (
                  <g key={i} pointerEvents="none">
                    <circle cx={q.x} cy={q.y} r={2.3} fill="#1b1b1b" />
                    <circle cx={q.x} cy={q.y} r={1.1} fill="#c9ced6" />
                  </g>
                ))}
                {w.label && <Halo x={(mid[0] + mid2[0]) / 2} y={(mid[1] + mid2[1]) / 2 - 4} size={6} anchor="middle">{w.label}</Halo>}
                {selected && !locked && (
                  <>
                    {w.pts.map((q, i) => (
                      <rect key={i} data-bend={`${w.id}|${i}`} x={q[0] - 3} y={q[1] - 3} width={6} height={6} rx={1} fill="#081634" stroke="#3cc4ff" strokeWidth={1} style={{ cursor: "move" }} />
                    ))}
                    {(["a", "b"] as const).map((k, i) => (
                      <circle key={k} data-end={`${w.id}|${k}`} cx={[a, b][i].x} cy={[a, b][i].y} r={3.6} fill="#081634" stroke="#3cff9a" strokeWidth={1.2} style={{ cursor: "grab" }} />
                    ))}
                  </>
                )}
              </g>
            );
          })}
          {junctions.map(([x, y]) => (
            <circle key={`j${x},${y}`} cx={x} cy={y} r={2.6} fill="#f3f7fd" stroke="#050e26" strokeWidth={0.8} pointerEvents="none" />
          ))}
          {/* Everything electrically joined to the pin under the pointer (or the selected wire). */}
          {litPins.map((p) => (
            <circle key={`lit-${p.part}-${p.pin}`} cx={p.x} cy={p.y} r={holeParts.has(p.part) ? 2.6 : 3.4} fill="rgba(60,255,154,.35)" stroke="#3cff9a" strokeWidth={0.8} pointerEvents="none" />
          ))}
          {preview && <polyline points={preview.map((q) => q.join(",")).join(" ")} fill="none" stroke={wireColor} strokeWidth={2.6} strokeDasharray="5 3" strokeLinejoin="round" pointerEvents="none" />}
          {hoverPin && (!locked || running) && (
            <circle cx={hoverPin.x} cy={hoverPin.y} r={4.2} fill="none" stroke={PIN_COLORS[pinRole(partById.get(hoverPin.part)!, hoverPin.pin).kind]} strokeWidth={1.6} pointerEvents="none" />
          )}
          {mode.k === "marquee" && (
            <rect x={Math.min(mode.x0, mode.x1)} y={Math.min(mode.y0, mode.y1)} width={Math.abs(mode.x1 - mode.x0)} height={Math.abs(mode.y1 - mode.y0)} fill="rgba(60,196,255,.08)" stroke="#3cc4ff" strokeWidth={1 / view.zoom} pointerEvents="none" />
          )}
          {placingDef && cursor && (
            <g opacity={0.6} pointerEvents="none" transform={`translate(${snapTo(cursor.x - (placingDef.box.x + placingDef.box.w / 2))} ${snapTo(cursor.y - (placingDef.box.y + placingDef.box.h / 2))})`}>
              <PartArt p={{ id: "ghost", type: placingDef.type, x: 0, y: 0, rot: 0, props: { ...placingDef.defaults } }} />
            </g>
          )}
        </g>
      </svg>

      <Rulers view={view} size={size} cursor={cursor} />
      <Minimap doc={doc} view={view} size={size} setView={setView} />

      {/* Tooltip: the pin under the pointer, else the part. */}
      {screen && !menu && mode.k === "idle" && (hoverPin || hoverDef) && (
        <div data-overlay className="pointer-events-none absolute z-30 max-w-64 rounded-lg border border-[var(--line-2)] bg-void/95 px-2.5 py-1.5 text-xs shadow-xl" style={{ left: Math.min(screen.x + 14, size.w - 260), top: Math.max(screen.y - 46, 26) }} data-testid="canvas-tooltip">
          {hoverPin ? (
            <PinTip pin={hoverPin} part={partById.get(hoverPin.part)!} volts={boardPinVolts?.(hoverPin.part, hoverPin.pin)} net={netlist.nets[netlist.netOf.get(pinKey(hoverPin.part, hoverPin.pin)) ?? -1]?.length ?? 0} />
          ) : hoverDef && hoverPart ? (
            <div dir="auto">
              <p className="font-semibold text-frost">{partById.get(hoverPart)?.label || l(hoverDef.name)}</p>
              <p className="text-fog">{hoverDef.support === "sim" ? t("simulated") : t("visualOnly")}</p>
            </div>
          ) : null}
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          bounds={size}
          onClose={() => setMenu(null)}
          items={menuItems(menu.target, { store, doc, sel, actions, locked, readOnly, running, t, zoomTo, setView })}
        />
      )}

      <div data-overlay className="absolute bottom-2 start-2 z-20 flex flex-wrap items-center gap-1 rounded-xl bg-deep/90 px-2 py-1 text-[11px] text-mist ring-1 ring-rim backdrop-blur" dir="ltr">
        <span className="w-28 font-mono tabular-nums" data-testid="cursor-coords">
          {cursor ? `${(cursor.x * 0.254).toFixed(1)}, ${(cursor.y * 0.254).toFixed(1)} mm` : "—"}
        </span>
        <select aria-label="Zoom" className="rounded bg-abyss px-1 py-0.5 font-mono ring-1 ring-rim" value={ZOOMS.includes(Math.round(view.zoom * 100) / 100) ? String(Math.round(view.zoom * 100) / 100) : "custom"} onChange={(e) => (e.target.value === "fit" ? actions?.fit() : e.target.value !== "custom" && zoomTo(Number(e.target.value)))} data-testid="zoom-select">
          <option value="custom">{Math.round(view.zoom * 100)}%</option>
          {ZOOMS.map((z) => (
            <option key={z} value={z}>
              {z * 100}%
            </option>
          ))}
          <option value="fit">{t("fit")}</option>
        </select>
        {!readOnly && (
          <>
            <ToggleChip on={settings.showGrid} onClick={() => store.setSettings({ showGrid: !settings.showGrid })} label={l({ en: "Grid", ar: "الشبكة" })} />
            <ToggleChip on={settings.snap} onClick={() => store.setSettings({ snap: !settings.snap })} label={l({ en: "Snap", ar: "التثبيت على الشبكة" })} />
            <select aria-label={l({ en: "Grid size", ar: "حجم الشبكة" })} className="rounded bg-abyss px-1 py-0.5 font-mono ring-1 ring-rim" value={settings.grid} onChange={(e) => store.setSettings({ grid: Number(e.target.value) })}>
              <option value={5}>1.27 mm</option>
              <option value={10}>2.54 mm</option>
              <option value={20}>5.08 mm</option>
            </select>
            <ToggleChip on={settings.routing === "ortho"} onClick={() => store.setSettings({ routing: settings.routing === "ortho" ? "free" : "ortho" })} label={settings.routing === "ortho" ? l({ en: "⌐ Right angles", ar: "⌐ زوايا قايمة" }) : l({ en: "∕ Free", ar: "∕ حر" })} />
            <select aria-label={l({ en: "Background", ar: "الخلفية" })} className="rounded bg-abyss px-1 py-0.5 ring-1 ring-rim" value={settings.background} onChange={(e) => store.setSettings({ background: e.target.value as "dots" | "lines" | "plain" })}>
              <option value="dots">{l({ en: "· dots", ar: "· نقط" })}</option>
              <option value="lines">{l({ en: "# lines", ar: "# خطوط" })}</option>
              <option value="plain">{l({ en: "plain", ar: "سادة" })}</option>
            </select>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Small pieces ─────────────────────────────────────────────────────── */

function ToggleChip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("rounded px-1.5 py-0.5 ring-1", on ? "bg-volt/25 text-ice ring-volt/50" : "ring-rim hover:text-frost")}>
      {label}
    </button>
  );
}

function Halo({ x, y, size, anchor, children }: { x: number; y: number; size: number; anchor: "start" | "middle"; children: ReactNode }) {
  return (
    <g>
      <text x={x} y={y} fontSize={size} textAnchor={anchor} fontFamily="var(--font-inter), sans-serif" fill="#050e26" stroke="#050e26" strokeWidth={2.6} strokeLinejoin="round">
        {children}
      </text>
      <text x={x} y={y} fontSize={size} textAnchor={anchor} fontFamily="var(--font-inter), sans-serif" fill="#e6edf9">
        {children}
      </text>
    </g>
  );
}

function LockGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x - 4} ${y - 4})`}>
      <rect x={0} y={3.5} width={8} height={6} rx={1} fill="#ffb547" />
      <path d="M2 3.5V2a2 2 0 0 1 4 0v1.5" fill="none" stroke="#ffb547" strokeWidth={1.2} />
    </g>
  );
}

function Outline({ p, zoom, tone, onRotate }: { p: PartInstance; zoom: number; tone: "hover" | "selected"; onRotate?: () => void }) {
  const b = worldBox(p);
  const s = 1 / zoom;
  const corners = [
    [b.x - 3, b.y - 3],
    [b.x + b.w + 3, b.y - 3],
    [b.x - 3, b.y + b.h + 3],
    [b.x + b.w + 3, b.y + b.h + 3],
  ];
  return (
    <g pointerEvents={onRotate ? undefined : "none"}>
      <rect x={b.x - 3} y={b.y - 3} width={b.w + 6} height={b.h + 6} rx={4} fill="none" stroke={tone === "selected" ? "#3cc4ff" : "rgba(60,196,255,.45)"} strokeWidth={(tone === "selected" ? 1.4 : 1) * s} strokeDasharray={tone === "selected" ? `${4 * s} ${3 * s}` : undefined} pointerEvents="none" />
      {tone === "selected" &&
        corners.map(([x, y], i) => <rect key={i} x={x - 2.5 * s} y={y - 2.5 * s} width={5 * s} height={5 * s} fill="#081634" stroke="#3cc4ff" strokeWidth={s} pointerEvents="none" />)}
      {tone === "selected" && onRotate && (
        <g
          data-overlay
          onPointerDown={(e) => {
            e.stopPropagation();
            onRotate();
          }}
          style={{ cursor: "pointer" }}
          transform={`translate(${b.x + b.w / 2} ${b.y - 3 - 14 * s}) scale(${s})`}
        >
          <title>Rotate (R)</title>
          <line x1={0} y1={6} x2={0} y2={14} stroke="#3cc4ff" strokeWidth={1} />
          <circle r={6} fill="#081634" stroke="#3cc4ff" strokeWidth={1.2} />
          <path d="M-3 0a3 3 0 1 0 1-2.2M-2 -3.6l0 1.8 1.8 0" fill="none" stroke="#3cc4ff" strokeWidth={1.1} />
        </g>
      )}
    </g>
  );
}

function PinTip({ pin, part, volts, net }: { pin: Pin; part: PartInstance; volts?: number; net: number }) {
  const { l } = useLang();
  const def = PART_BY_TYPE.get(part.type);
  const role = pinRole(part, pin.pin);
  return (
    <div dir="ltr">
      <p className="flex items-center gap-1.5 font-semibold text-frost">
        <span className="inline-block size-2 rounded-full" style={{ background: PIN_COLORS[role.kind] }} />
        {pin.pin} <span className="font-normal text-fog">· {part.label || (def ? l(def.name) : part.type)}</span>
      </p>
      <p className="text-mist">{role.note}</p>
      <p className="text-fog">
        {net > 1 ? `${net - 1} connected` : "not connected"}
        {volts !== undefined ? ` · ${volts.toFixed(2)} V` : ""}
      </p>
    </div>
  );
}

/* ─── Context menu ─────────────────────────────────────────────────────── */

type Item = { label: string; keys?: string; run?: () => void; disabled?: boolean; danger?: boolean; sep?: boolean; swatches?: string[]; onSwatch?: (c: string) => void };

function menuItems(
  target: MenuTarget,
  c: {
    store: DocStore;
    doc: CircuitDoc;
    sel: { parts: string[]; wires: string[] };
    actions?: CanvasActions;
    locked: boolean;
    readOnly: boolean;
    running: boolean;
    t: ReturnType<typeof useLang>["t"];
    zoomTo: (z: number) => void;
    setView: (v: View) => void;
  },
): Item[] {
  const { store, doc, sel, actions, t } = c;
  const edit = !c.locked;
  if (target.kind === "part") {
    const p = doc.parts.find((x) => x.id === target.id);
    if (!p) return [];
    const ids = sel.parts.includes(p.id) ? sel.parts : [p.id];
    const multi = ids.length > 1;
    return [
      { label: t("cmProps"), run: () => actions?.inspect(p.id) },
      { label: t("cmRotCw"), keys: "R", run: () => store.rotate(ids), disabled: !edit || p.locked },
      { label: t("cmRotCcw"), keys: "⇧R", run: () => store.rotate(ids, true), disabled: !edit || p.locked },
      { sep: true, label: "" },
      { label: t("duplicate"), keys: "Ctrl D", run: () => store.duplicate(ids), disabled: !edit },
      { label: t("cmCopy"), keys: "Ctrl C", run: () => actions?.copy() },
      { label: p.locked ? t("cmUnlock") : t("cmLock"), run: () => store.setLocked(ids, !p.locked), disabled: c.readOnly },
      { label: t("cmFront"), run: () => store.reorder(ids, "front"), disabled: !edit },
      { label: t("cmBack"), run: () => store.reorder(ids, "back"), disabled: !edit },
      ...(multi
        ? ([
            { sep: true, label: "" },
            { label: t("alignLeft"), run: () => store.align(ids, "left"), disabled: !edit },
            { label: t("alignCenterX"), run: () => store.align(ids, "centerX"), disabled: !edit },
            { label: t("alignTop"), run: () => store.align(ids, "top"), disabled: !edit },
            { label: t("alignCenterY"), run: () => store.align(ids, "centerY"), disabled: !edit },
            { label: t("distributeX"), run: () => store.align(ids, "distributeX"), disabled: !edit || ids.length < 3 },
            { label: t("distributeY"), run: () => store.align(ids, "distributeY"), disabled: !edit || ids.length < 3 },
          ] as Item[])
        : []),
      { sep: true, label: "" },
      { label: t("cmPinout"), run: () => actions?.pinout(p.type) },
      { label: t("cmDocs"), run: () => actions?.docs(p.type) },
      { label: t("cmLabel"), run: () => actions?.label({ kind: "part", id: p.id }), disabled: c.readOnly },
      { sep: true, label: "" },
      { label: t("del"), keys: "Del", danger: true, run: () => actions?.confirmDelete(), disabled: !edit || ids.every((id) => doc.parts.find((x) => x.id === id)?.locked) },
    ];
  }
  if (target.kind === "wire") {
    const w = doc.wires.find((x) => x.id === target.id);
    if (!w) return [];
    return [
      { label: t("wireColor"), swatches: WIRE_COLORS, onSwatch: (col) => store.setWire(w.id, { color: col }), disabled: !edit },
      { label: t("cmLabel"), run: () => actions?.label({ kind: "wire", id: w.id }), disabled: c.readOnly },
      { label: t("cmStraighten"), run: () => store.setWire(w.id, { pts: [] }), disabled: !edit || !w.pts.length },
      { sep: true, label: "" },
      { label: t("del"), keys: "Del", danger: true, run: () => (store.select({ parts: [], wires: [w.id] }), store.deleteSelection()), disabled: !edit },
    ];
  }
  return [
    { label: t("cmPaste"), keys: "Ctrl V", run: () => actions?.paste({ x: target.x, y: target.y }), disabled: !edit },
    { label: t("cmSelectAll"), keys: "Ctrl A", run: () => store.selectAll() },
    { sep: true, label: "" },
    { label: t("fit"), run: () => actions?.fit() },
    { label: t("cmZoom100"), run: () => c.zoomTo(1) },
    { label: settingsOf(doc).showGrid ? t("cmHideGrid") : t("cmShowGrid"), run: () => store.setSettings({ showGrid: !settingsOf(doc).showGrid }), disabled: c.readOnly },
  ];
}

function ContextMenu({ x, y, bounds, items, onClose }: { x: number; y: number; bounds: { w: number; h: number }; items: Item[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  // React can mount the menu while the press that opened it is still bubbling: ignore that press.
  const [opened] = useState(() => ({ current: performance.now() }));
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos({ x: Math.max(4, Math.min(x, bounds.w - el.offsetWidth - 4)), y: Math.max(4, Math.min(y, bounds.h - el.offsetHeight - 4)) });
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y, bounds]);
  useEffect(() => {
    const close = (e: PointerEvent) => e.timeStamp > opened.current && !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [onClose, opened]);
  const onKey = (e: React.KeyboardEvent) => {
    const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button[data-item]:not(:disabled)") ?? [])];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") (e.preventDefault(), btns[(i + 1) % btns.length]?.focus());
    else if (e.key === "ArrowUp") (e.preventDefault(), btns[(i - 1 + btns.length) % btns.length]?.focus());
    else if (e.key === "Escape") (e.preventDefault(), onClose());
  };
  return (
    <div data-overlay ref={ref} role="menu" onKeyDown={onKey} className="absolute z-40 min-w-52 rounded-xl border border-[var(--line-2)] bg-deep/98 p-1 text-sm shadow-2xl backdrop-blur" style={{ left: pos.x, top: pos.y }} data-testid="context-menu">
      {items.map((it, i) =>
        it.sep ? (
          <div key={i} className="my-1 h-px bg-[var(--line)]" />
        ) : it.swatches ? (
          <div key={i} className="px-2 py-1.5">
            <p className="mb-1.5 text-xs text-fog">{it.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {it.swatches.map((col) => (
                <button key={col} type="button" data-item aria-label={col} disabled={it.disabled} onClick={() => (it.onSwatch?.(col), onClose())} className="size-5 rounded-full ring-1 ring-rim focus-visible:ring-2 focus-visible:ring-cyan" style={{ background: col }} />
              ))}
            </div>
          </div>
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            data-item
            disabled={it.disabled}
            onClick={() => {
              it.run?.();
              onClose();
            }}
            className={cn("flex w-full items-center justify-between gap-6 rounded-lg px-2.5 py-1.5 text-start hover:bg-panel-2 focus:bg-panel-2 focus:outline-none disabled:opacity-40 disabled:hover:bg-transparent", it.danger && "text-danger")}
          >
            <span>{it.label}</span>
            {it.keys && <kbd className="font-mono text-[10px] text-fog">{it.keys}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}

/* ─── Rulers and minimap ───────────────────────────────────────────────── */

function Rulers({ view, size, cursor }: { view: View; size: { w: number; h: number }; cursor: { x: number; y: number } | null }) {
  // Tick spacing in mm that stays ≥ 40 px apart at this zoom.
  const pxPerMm = view.zoom / 0.254;
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => s * pxPerMm >= 40) ?? 1000;
  const ticks = (from: number, len: number) => {
    const startMm = Math.ceil((from * 0.254) / step) * step;
    const out: number[] = [];
    for (let mm = startMm; (mm / 0.254 - from) * view.zoom < len; mm += step) out.push(mm);
    return out;
  };
  const xs = ticks(view.x, size.w);
  const ys = ticks(view.y, size.h);
  const px = (mm: number, o: number) => (mm / 0.254 - o) * view.zoom;
  return (
    <div data-overlay className="pointer-events-none absolute inset-0 z-10" dir="ltr" aria-hidden>
      <svg className="absolute inset-x-0 top-0 h-4 w-full bg-void/70">
        {xs.map((mm) => (
          <g key={mm} transform={`translate(${px(mm, view.x)} 0)`}>
            <line y1={10} y2={16} stroke="#4d6290" />
            <text x={2} y={9} fontSize={8} fill="#7d8fb5" fontFamily="monospace">
              {mm}
            </text>
          </g>
        ))}
        {cursor && <line x1={(cursor.x - view.x) * view.zoom} x2={(cursor.x - view.x) * view.zoom} y1={0} y2={16} stroke="#3cc4ff" />}
      </svg>
      <svg className="absolute inset-y-0 start-0 h-full w-4 bg-void/70">
        {ys.map((mm) => (
          <g key={mm} transform={`translate(0 ${px(mm, view.y)})`}>
            <line x1={10} x2={16} stroke="#4d6290" />
            <text x={1} y={-2} fontSize={7} fill="#7d8fb5" fontFamily="monospace">
              {mm}
            </text>
          </g>
        ))}
        {cursor && <line y1={(cursor.y - view.y) * view.zoom} y2={(cursor.y - view.y) * view.zoom} x1={0} x2={16} stroke="#3cc4ff" />}
      </svg>
    </div>
  );
}

function Minimap({ doc, view, size, setView }: { doc: CircuitDoc; view: View; size: { w: number; h: number }; setView: (v: View) => void }) {
  if (!doc.parts.length) return null;
  const boxes = doc.parts.map((p) => ({ p, b: worldBox(p) }));
  const vw = size.w / view.zoom;
  const vh = size.h / view.zoom;
  const x0 = Math.min(view.x, ...boxes.map(({ b }) => b.x)) - 40;
  const y0 = Math.min(view.y, ...boxes.map(({ b }) => b.y)) - 40;
  const x1 = Math.max(view.x + vw, ...boxes.map(({ b }) => b.x + b.w)) + 40;
  const y1 = Math.max(view.y + vh, ...boxes.map(({ b }) => b.y + b.h)) + 40;
  const W = 150;
  const H = Math.max(60, Math.min(120, (W * (y1 - y0)) / (x1 - x0)));
  const k = Math.min(W / (x1 - x0), H / (y1 - y0));
  const center = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const wx = x0 + (e.clientX - r.left) / k;
    const wy = y0 + (e.clientY - r.top) / k;
    setView({ ...view, x: wx - vw / 2, y: wy - vh / 2 });
  };
  return (
    <svg
      data-overlay
      width={W}
      height={H}
      className="absolute bottom-2 end-2 z-20 hidden cursor-pointer rounded-lg bg-void/85 ring-1 ring-rim md:block"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        center(e);
      }}
      onPointerMove={(e) => e.buttons && center(e)}
      aria-label="Minimap"
      data-testid="minimap"
    >
      {boxes.map(({ p, b }) => {
        const cat = PART_BY_TYPE.get(p.type)?.category;
        return <rect key={p.id} x={(b.x - x0) * k} y={(b.y - y0) * k} width={Math.max(1.5, b.w * k)} height={Math.max(1.5, b.h * k)} fill={cat === "breadboards" ? "#cfd2d8" : cat === "boards" ? "#00979d" : "#ffb547"} opacity={cat === "breadboards" ? 0.5 : 0.85} />;
      })}
      {doc.wires.length > 0 && <g opacity={0.5} />}
      <rect x={(view.x - x0) * k} y={(view.y - y0) * k} width={vw * k} height={vh * k} fill="rgba(60,196,255,.12)" stroke="#3cc4ff" strokeWidth={1} />
    </svg>
  );
}

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

/** Moving a breadboard or board carries the parts plugged into it (every leg in one of its holes). */
function withPlugged(doc: CircuitDoc, ids: string[], pins: ReturnType<typeof pinIndex>): string[] {
  const hosts = new Set(ids.filter((id) => ["breadboards", "boards"].includes(PART_BY_TYPE.get(doc.parts.find((p) => p.id === id)?.type ?? "")?.category ?? "")));
  if (!hosts.size) return ids;
  const spots = new Set<string>();
  for (const p of pins.values()) if (hosts.has(p.part)) spots.add(`${p.x},${p.y}`);
  const out = new Set(ids);
  for (const part of doc.parts) {
    if (out.has(part.id) || part.locked || PART_BY_TYPE.get(part.type)?.category === "breadboards" || PART_BY_TYPE.get(part.type)?.mcu) continue;
    const legs = [...pins.values()].filter((p) => p.part === part.id);
    if (legs.length && legs.every((p) => spots.has(`${p.x},${p.y}`))) out.add(part.id);
  }
  return [...out];
}

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
