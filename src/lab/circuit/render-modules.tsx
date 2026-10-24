"use client";
/**
 * Drawings of modules, displays, sensors and logic chips (pin 0 at 0,0; 10 units = 0.1 inch), and their
 * live overlays on the realistic pictures: lit segments, relay and sensor LEDs, sensor values.
 */
import { useMemo, type ReactNode } from "react";
import type { PartInstance } from "./model";
import { propsOf } from "./parts";
import { GATES, SEGMENTS } from "../sim/modules";
import { useScreen } from "../sim/screens";

type Reading = Record<string, number> | undefined;
const FONT = "ui-monospace, SFMono-Regular, Menlo, monospace";
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const Lead = ({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#b8c2cc" strokeWidth={1.6} strokeLinecap="round" />;
const Label = ({ x, y, children, size = 4, fill = "#e8eef8", anchor = "middle" }: { x: number; y: number; children: ReactNode; size?: number; fill?: string; anchor?: "start" | "middle" | "end" }) => (
  <text x={x} y={y} fontSize={size} fontFamily={FONT} textAnchor={anchor} fill={fill} style={{ userSelect: "none" }} pointerEvents="none">
    {children}
  </text>
);
const pinLabels = (names: string[], y: number, x0 = 0, fill = "#9fb0c8") => names.map((s, i) => <Label key={s + i} x={x0 + i * 10} y={y} size={3.2} fill={fill}>{s}</Label>);

/** A 128 × 64 display picture (page layout: bit y&7 of byte (y>>3)*128+x) as an image URL. */
function pictureUrl(pic: Uint8Array): string | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(128, 64);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 128; x++) {
      if (!((pic[(y >> 3) * 128 + x] >> (y & 7)) & 1)) continue;
      const i = (y * 128 + x) * 4;
      img.data.set([222, 242, 255, 255], i);
    }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}
/** The live OLED picture, drawn into the 128 × 64 box at the origin (transform it into place). */
export function OledPicture({ part, transform }: { part: string; transform?: string }) {
  const pic = useScreen(part);
  const url = useMemo(() => (pic ? pictureUrl(pic) : null), [pic]);
  if (!url) return null;
  return <image href={url} x={0} y={0} width={128} height={64} preserveAspectRatio="none" transform={transform} style={{ imageRendering: "pixelated", filter: "drop-shadow(0 0 0.6px #bfe6ff)" }} pointerEvents="none" />;
}

export const SEG_COLORS: Record<string, { on: string; off: string }> = {
  red: { on: "#ff2a2a", off: "#3a1616" },
  green: { on: "#39ff5a", off: "#163a1c" },
  yellow: { on: "#ffd21a", off: "#3a3216" },
  blue: { on: "#3a8bff", off: "#16243a" },
  white: { on: "#f4f8ff", off: "#2c2f35" },
};

/** Segment shapes in a 30 × 50 digit box (slanted 8°), origin top-left. */
export const SEG_SHAPES: Record<(typeof SEGMENTS)[number], string> = {
  a: "M6,2 L24,2 L21,6 L9,6 Z",
  b: "M25,3 L28,6 L27,22 L23,25 L22,7 Z",
  c: "M23,27 L27,30 L26,46 L23,48 L21,44 Z",
  d: "M5,48 L21,48 L24,52 L3,52 Z",
  e: "M3,27 L7,30 L6,44 L1,49 L2,30 Z",
  f: "M4,3 L8,7 L7,23 L3,25 L2,6 Z",
  g: "M6,24 L22,24 L24,26 L21,28 L7,28 L4,26 Z",
  dp: "M28,47 a2.4,2.4 0 1,0 0.1,0 Z",
};

/** The lit amount of each segment (1 ≈ 10 mA). */
export const segLevels = (r: Reading) => Object.fromEntries(SEGMENTS.map((s) => [s, clamp01((r?.[`i_${s}`] ?? 0) / 0.01)])) as Record<(typeof SEGMENTS)[number], number>;

function Digit({ x, y, scale, r, color }: { x: number; y: number; scale: number; r: Reading; color: string }) {
  const c = SEG_COLORS[color] ?? SEG_COLORS.red;
  const lit = segLevels(r);
  return (
    <g transform={`translate(${x} ${y}) scale(${scale}) skewX(-8)`} pointerEvents="none">
      {SEGMENTS.map((s) => (
        <path key={s} d={SEG_SHAPES[s]} fill={lit[s] > 0.02 ? c.on : c.off} opacity={lit[s] > 0.02 ? 0.35 + 0.65 * lit[s] : 1} style={lit[s] > 0.3 ? { filter: `drop-shadow(0 0 ${1 + 2 * lit[s]}px ${c.on})` } : undefined} />
      ))}
    </g>
  );
}

function Pcb({ x, y, w, h, color = "#1f5fae" }: { x: number; y: number; w: number; h: number; color?: string }) {
  return <rect x={x} y={y} width={w} height={h} rx={2.5} fill={color} stroke="#0c1f3d" strokeWidth={0.8} />;
}
function Led({ x, y, on, color }: { x: number; y: number; on: boolean; color: string }) {
  return <circle cx={x} cy={y} r={2.2} fill={on ? color : "#3b3f46"} style={on ? { filter: `drop-shadow(0 0 3px ${color})` } : undefined} />;
}

export function ModuleArt({ p, r, live }: { p: PartInstance; r: Reading; live: Record<string, unknown> }): ReactNode | undefined {
  const pr = propsOf(p);
  switch (p.type) {
    case "seg7":
      return (
        <g>
          <rect x={-5} y={-8} width={50} height={76} rx={2} fill="#1b1b1d" stroke="#000" />
          <Digit x={6} y={4} scale={0.9} r={r} color={String(pr.color)} />
          <Label x={20} y={-10} size={3.2} fill="#9fb0c8">{pr.common === "anode" ? "CA" : "CC"}</Label>
        </g>
      );
    case "relay": {
      const on = (r?.on ?? 0) > 0.5;
      return (
        <g>
          <Pcb x={-10} y={-42} w={202} h={104} />
          <rect x={40} y={-34} width={76} height={62} rx={2} fill="#2463b8" stroke="#123b78" />
          <Label x={78} y={-4} size={5} fill="#dfe9ff">SRD-05VDC</Label>
          <Label x={78} y={4} size={3.4} fill="#b9cbea">10A 250VAC</Label>
          <rect x={160} y={-34} width={30} height={68} rx={2} fill="#1d64d0" stroke="#0e3a80" />
          {[-20, 0, 20].map((y) => (
            <circle key={y} cx={180} cy={y} r={6} fill="#c8cdd4" stroke="#7d848e" />
          ))}
          <Label x={166} y={-18} size={3.4}>NO</Label>
          <Label x={166} y={2} size={3.4}>COM</Label>
          <Label x={166} y={22} size={3.4}>NC</Label>
          <line x1={174} y1={0} x2={on ? 176 : 176} y2={on ? -16 : 16} stroke={on ? "#3cff9a" : "#9fb0c8"} strokeWidth={1.6} />
          <Led x={20} y={30} on={on} color="#ff4040" />
          {["VCC", "GND", "IN"].map((s, i) => (
            <Label key={s} x={10} y={i * 10 + 1.5} size={3.2} anchor="start" fill="#e8eef8">{s}</Label>
          ))}
        </g>
      );
    }
    case "joystick": {
      const x = Number(live.x ?? pr.x ?? 0.5);
      const y = Number(live.y ?? pr.y ?? 0.5);
      return (
        <g>
          {[0, 10, 20, 30, 40].map((px) => (
            <Lead key={px} x1={px} y1={0} x2={px} y2={-8} />
          ))}
          <Pcb x={-45} y={-150} w={130} h={142} color="#1a1a1a" />
          <circle cx={20} cy={-80} r={42} fill="#2a2a2a" stroke="#000" />
          <circle cx={20 + (x - 0.5) * 36} cy={-80 + (0.5 - y) * 36} r={24} fill={live.pressed ? "#3b3b3b" : "#202020"} stroke="#555" strokeWidth={2} />
          {pinLabels(["GND", "+5V", "VRx", "VRy", "SW"], -12)}
        </g>
      );
    }
    case "pir": {
      const high = (r?.out ?? 0) > 0.5;
      return (
        <g>
          {[0, 10, 20].map((px) => (
            <Lead key={px} x1={px} y1={0} x2={px} y2={-8} />
          ))}
          <Pcb x={-38} y={-110} w={96} h={102} color="#1f7a3a" />
          <circle cx={10} cy={-60} r={44} fill="#f3f2ee" stroke="#c8c6bf" />
          {[-24, -8, 8, 24].map((d) => (
            <line key={d} x1={10 + d} y1={-100} x2={10 + d} y2={-20} stroke="#dcdad3" strokeWidth={1} />
          ))}
          <Label x={10} y={-12} size={4} fill={high ? "#3cff9a" : "#d6f5df"}>{high ? "OUT ●" : "OUT ○"}</Label>
          {pinLabels(["VCC", "OUT", "GND"], 6)}
        </g>
      );
    }
    case "ir-obstacle": {
      const blocked = Boolean(live.obstacle ?? pr.obstacle);
      return (
        <g>
          {[0, 10, 20].map((px) => (
            <Lead key={px} x1={px} y1={0} x2={px} y2={-8} />
          ))}
          <Pcb x={-8} y={-128} w={46} h={120} />
          <circle cx={4} cy={-118} r={5} fill="#d9e3f0" stroke="#7d848e" />
          <circle cx={26} cy={-118} r={5} fill="#232323" stroke="#000" />
          <rect x={6} y={-80} width={18} height={18} rx={2} fill="#2b5ec4" />
          <circle cx={15} cy={-71} r={5} fill="#d3d8de" />
          <Led x={6} y={-40} on={blocked} color="#3cff6a" />
          <Led x={24} y={-40} on color="#ff4040" />
          {pinLabels(["OUT", "GND", "VCC"], -12)}
        </g>
      );
    }
    case "line-sensor": {
      const dark = Number(live.dark ?? pr.dark ?? 0);
      return (
        <g>
          {[0, 10, 20, 30].map((px) => (
            <Lead key={px} x1={px} y1={0} x2={px} y2={-8} />
          ))}
          <Pcb x={-8} y={-140} w={56} h={132} />
          <rect x={4} y={-136} width={22} height={14} rx={1.5} fill="#151515" />
          <circle cx={9} cy={-129} r={3.5} fill="#2b4cff" opacity={0.7} />
          <circle cx={21} cy={-129} r={3.5} fill="#111" />
          <rect x={10} y={-80} width={18} height={18} rx={2} fill="#2b5ec4" />
          <Led x={6} y={-40} on={dark <= Number(pr.threshold ?? 0.5)} color="#3cff6a" />
          <Label x={20} y={-146} size={4} fill="#9fb0c8">{`${Math.round(dark * 100)}% dark`}</Label>
          {pinLabels(["VCC", "GND", "D0", "A0"], -12)}
        </g>
      );
    }
    case "soil": {
      const m = Number(live.moisture ?? pr.moisture ?? 30);
      return (
        <g>
          {[0, 10, 20, 30].map((px) => (
            <Lead key={px} x1={px} y1={0} x2={px} y2={-8} />
          ))}
          <Pcb x={-8} y={-60} w={56} h={52} />
          <rect x={4} y={-210} width={40} height={140} rx={3} fill="#c58f2c" opacity={0.25} />
          <path d="M6,-80 L6,-200 L14,-208 L14,-80 Z M30,-80 L30,-200 L38,-208 L38,-80 Z" fill="#d8b04a" stroke="#8a6c1c" strokeWidth={0.6} />
          <rect x={4} y={-86} width={40} height={10} fill="#1f5fae" />
          <Led x={6} y={-30} on={m / 100 > Number(pr.threshold ?? 0.5)} color="#3cff6a" />
          <Label x={24} y={-214} size={4.5} fill="#7fd0ff">{`${Math.round(m)} %`}</Label>
          {pinLabels(["VCC", "GND", "D0", "A0"], -12)}
        </g>
      );
    }
    case "oled-ssd1306":
      return (
        <g>
          {[0, 10, 20, 30].map((px) => (
            <Lead key={px} x1={px} y1={0} x2={px} y2={-4} />
          ))}
          <rect x={-39} y={-6} width={108} height={110} rx={4} fill="#173d8f" stroke="#0f2a66" />
          {[-33, 63].flatMap((x) => [0, 98].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r={3.4} fill="#0d1b3a" stroke="#c9a74a" strokeWidth={1} />))}
          <rect x={-37.5} y={13} width={105} height={76} rx={1.5} fill="#08090c" stroke="#2a2d33" />
          <rect x={-27.8} y={23.5} width={85.6} height={42.8} fill="#0c0f14" />
          <OledPicture part={p.id} transform={`translate(-27.8 23.5) scale(${85.6 / 128} ${42.8 / 64})`} />
          {pinLabels(["GND", "VCC", "SCL", "SDA"], 8, 0, "#e8eef8")}
        </g>
      );
    case "dht22":
    case "dht11": {
      const big = p.type === "dht22";
      const t = Number(live.temp ?? pr.temp ?? 24);
      const h = Number(live.humidity ?? pr.humidity ?? 45);
      return (
        <g>
          {[0, 10, 20, 30].map((px) => (
            <Lead key={px} x1={px} y1={0} x2={px} y2={-8} />
          ))}
          <rect x={big ? -16 : -12} y={big ? -100 : -76} width={big ? 62 : 54} height={big ? 92 : 68} rx={3} fill={big ? "#f1f1ee" : "#2d6fd6"} stroke={big ? "#bdbdb6" : "#18469b"} />
          {Array.from({ length: big ? 5 : 4 }, (_, i) => (
            <rect key={i} x={big ? -8 : -4} y={(big ? -90 : -66) + i * 12} width={big ? 46 : 38} height={6} rx={2} fill={big ? "#d7d7d1" : "#1f56b0"} />
          ))}
          <Label x={15} y={big ? -104 : -80} size={4} fill="#ffb86b">{`${t.toFixed(1)}°C ${h.toFixed(0)}%`}</Label>
          {pinLabels(["VCC", "DATA", "NC", "GND"], 6)}
        </g>
      );
    }
    default: {
      const chip = GATES[p.type];
      if (!chip) return undefined;
      return (
        <g>
          <rect x={-6} y={4} width={72} height={22} rx={1.5} fill="#1c1c1e" stroke="#000" />
          <path d="M-6,11 a4,4 0 0,1 0,8" fill="#0c0c0d" />
          <circle cx={-1} cy={22} r={1.2} fill="#3a3a3c" />
          <Label x={30} y={14} size={4.6} fill="#d6d9de">{p.type.toUpperCase()}</Label>
          <Label x={30} y={21} size={3.4} fill="#9aa1ab">{chip.label}</Label>
          {[0, 10, 20, 30, 40, 50, 60].map((x) => (
            <g key={x}>
              <rect x={x - 1.5} y={0} width={3} height={4} fill="#c8cdd4" />
              <rect x={x - 1.5} y={26} width={3} height={4} fill="#c8cdd4" />
            </g>
          ))}
        </g>
      );
    }
  }
}

/** Live overlays on the realistic pictures (anchors come from the 3D model). */
export function ModuleOverlay({ p, r, live, a }: { p: PartInstance; r: Reading; live: Record<string, unknown>; a: Record<string, [number, number]> }): ReactNode {
  const pr = propsOf(p);
  const glow = (at: [number, number] | undefined, color: string, on: boolean, size = 1) =>
    at && on ? <circle cx={at[0]} cy={at[1]} r={5 * size} fill={color} opacity={0.75} style={{ filter: `blur(${2 * size}px)` }} pointerEvents="none" /> : null;
  switch (p.type) {
    case "seg7": {
      const c = SEG_COLORS[String(pr.color)] ?? SEG_COLORS.red;
      const lit = segLevels(r);
      const d = a.digit;
      const dx = a.digitX;
      const dy = a.digitY;
      if (!d || !dx || !dy) return null;
      // The digit box is given by three projected corners, so map the 30 × 52 glyph box onto it.
      const m = [(dx[0] - d[0]) / 30, (dx[1] - d[1]) / 30, (dy[0] - d[0]) / 52, (dy[1] - d[1]) / 52, d[0], d[1]].map((v) => +v.toFixed(4)).join(" ");
      return (
        <g transform={`matrix(${m}) skewX(-8)`} pointerEvents="none">
          {SEGMENTS.map((s) =>
            lit[s] > 0.02 ? <path key={s} d={SEG_SHAPES[s]} fill={c.on} opacity={0.4 + 0.6 * lit[s]} style={{ filter: `drop-shadow(0 0 ${1 + 2.5 * lit[s]}px ${c.on})` }} /> : null,
          )}
        </g>
      );
    }
    case "relay":
      return glow(a.led, "#ff3030", (r?.on ?? 0) > 0.5);
    case "pir":
      return (r?.out ?? 0) > 0.5 && a.label ? <text x={a.label[0]} y={a.label[1]} fontSize={6} fontFamily={FONT} textAnchor="middle" fill="#3cff9a" stroke="#050e26" strokeWidth={0.4}>OUT ●</text> : null;
    case "ir-obstacle":
      return glow(a.led, "#3cff6a", Boolean(live.obstacle ?? pr.obstacle));
    case "line-sensor":
      return glow(a.led, "#3cff6a", Number(live.dark ?? pr.dark ?? 0) <= Number(pr.threshold ?? 0.5));
    case "soil":
      return (
        <>
          {glow(a.led, "#3cff6a", Number(live.moisture ?? pr.moisture ?? 30) / 100 > Number(pr.threshold ?? 0.5))}
          {a.label && <text x={a.label[0]} y={a.label[1]} fontSize={6} fontFamily={FONT} textAnchor="middle" fill="#7fd0ff" stroke="#050e26" strokeWidth={0.4}>{`${Math.round(Number(live.moisture ?? pr.moisture ?? 30))} %`}</text>}
        </>
      );
    case "oled-ssd1306": {
      const [d, dx, dy] = [a.screen, a.screenX, a.screenY];
      if (!d || !dx || !dy) return null;
      const m = [(dx[0] - d[0]) / 128, (dx[1] - d[1]) / 128, (dy[0] - d[0]) / 64, (dy[1] - d[1]) / 64, d[0], d[1]].map((v) => +v.toFixed(4)).join(" ");
      return <OledPicture part={p.id} transform={`matrix(${m})`} />;
    }
    case "dht22":
    case "dht11":
      return a.label ? <text x={a.label[0]} y={a.label[1]} fontSize={5.5} fontFamily={FONT} textAnchor="middle" fill="#ffb86b" stroke="#050e26" strokeWidth={0.4}>{`${Number(live.temp ?? pr.temp ?? 24).toFixed(1)}°C ${Number(live.humidity ?? pr.humidity ?? 45).toFixed(0)}%`}</text> : null;
    default:
      return null;
  }
}
