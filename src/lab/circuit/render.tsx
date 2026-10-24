"use client";
/**
 * How each part looks on the canvas, in its own units (10 = 0.1 inch, pin 0 usually at 0,0). While the
 * simulation runs, `r` carries the part's averaged readings (LED current, servo angle, meter value…)
 * and the drawing follows them; with no reading the part is drawn at rest.
 */
import { memo, useEffect, useState, type ReactNode } from "react";
import type { PartInstance } from "./model";
import { BB_ROWS, LED_COLORS, PART_BY_TYPE, bbCols, propsOf, worldBox, worldPins } from "./parts";
import { ModuleArt, ModuleOverlay } from "./render-modules";

export type Reading = Record<string, number> | undefined;

const FONT = "ui-monospace, SFMono-Regular, Menlo, monospace";
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Engineering notation: 4700 → 4.7k, 0.000001 → 1µ. */
export function eng(v: number, unit = "", digits = 3): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return `0${unit}`;
  const a = Math.abs(v);
  const pre: [number, string][] = [[1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"]];
  const [m, s] = pre.find(([m]) => a >= m * 0.9995) ?? pre[pre.length - 1];
  return `${Number((v / m).toPrecision(digits))}${s}${unit}`;
}

/* ─── Resistor colour code ─────────────────────────────────────────────── */
const BANDS = ["#1a1a1a", "#7a4a1d", "#d92b2b", "#ef7d1a", "#f2d21b", "#2e9a43", "#2257c9", "#7d3fb5", "#8a8a8a", "#f4f4f4"];
function bands(r: number): string[] {
  if (!(r > 0)) return [BANDS[0], BANDS[0], BANDS[0]];
  let exp = Math.floor(Math.log10(r)) - 1;
  let sig = Math.round(r / 10 ** exp);
  if (sig >= 100) (sig = Math.round(sig / 10)), exp++;
  const mult = exp >= 0 ? BANDS[exp] ?? BANDS[9] : exp === -1 ? "#c9a227" : "#c0c0c0";
  return [BANDS[Math.floor(sig / 10)], BANDS[sig % 10], mult];
}

const Lead = ({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#b8c2cc" strokeWidth={1.6} strokeLinecap="round" />;
const Label = ({ x, y, children, size = 5, fill = "#e8eef8", anchor = "middle", rot }: { x: number; y: number; children: ReactNode; size?: number; fill?: string; anchor?: "start" | "middle" | "end"; rot?: number }) => (
  <text x={x} y={y} fontSize={size} fill={fill} fontFamily={FONT} textAnchor={anchor} transform={rot ? `rotate(${rot} ${x} ${y})` : undefined} style={{ userSelect: "none" }}>
    {children}
  </text>
);

/* ─── Boards ───────────────────────────────────────────────────────────── */

function Header({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <rect x={x - 5} y={y - 5} width={n * 10} height={10} rx={1} fill="#141414" />
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={x + i * 10 - 2} y={y - 2} width={4} height={4} fill="#3a3a3a" />
      ))}
    </g>
  );
}

function Uno({ r }: { r: Reading }) {
  const l13 = clamp01((r?.vD13 ?? 0) / 5);
  const tx = r?.tx ? 1 : 0;
  return (
    <g>
      <path d="M4 0h268l8 8v26l-6 6v120l6 6v40l-8 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z" fill="#00797f" stroke="#005a5f" strokeWidth={1.2} />
      {/* USB-B and power jack */}
      <rect x={-12} y={30} width={44} height={46} rx={2} fill="#c8ccd2" stroke="#8b9199" />
      <rect x={-8} y={150} width={46} height={36} rx={3} fill="#202020" />
      {/* ATmega328P (DIP-28) */}
      <rect x={130} y={120} width={130} height={36} rx={2} fill="#1b1b1b" />
      <circle cx={137} cy={138} r={3} fill="#2a2a2a" />
      <Label x={195} y={141} size={7} fill="#9aa4ae">ATMEGA328P</Label>
      <Header x={100} y={10} n={10} />
      <Header x={200} y={10} n={8} />
      <Header x={100} y={200} n={7} />
      <Header x={180} y={200} n={6} />
      {["SCL", "SDA", "AREF", "GND", "13", "12", "~11", "~10", "~9", "8"].map((s, i) => (
        <Label key={s} x={100 + i * 10} y={26} size={4.6} rot={-90} anchor="end">
          {s}
        </Label>
      ))}
      {["7", "~6", "~5", "4", "~3", "2", "TX→1", "RX←0"].map((s, i) => (
        <Label key={s} x={200 + i * 10} y={26} size={4.6} rot={-90} anchor="end">
          {s}
        </Label>
      ))}
      {["IOREF", "RESET", "3.3V", "5V", "GND", "GND", "VIN"].map((s, i) => (
        <Label key={i} x={100 + i * 10} y={184} size={4.6} rot={-90} anchor="start">
          {s}
        </Label>
      ))}
      {["A0", "A1", "A2", "A3", "A4", "A5"].map((s, i) => (
        <Label key={s} x={180 + i * 10} y={184} size={4.6} rot={-90} anchor="start">
          {s}
        </Label>
      ))}
      <Label x={70} y={108} size={20} fill="#ffffff">
        UNO
      </Label>
      <Label x={70} y={122} size={7} fill="#d7f3f3">
        ARDUINO
      </Label>
      {/* L (pin 13), TX, ON */}
      <rect x={128} y={36} width={8} height={5} rx={1} fill={l13 > 0.02 ? `rgba(255,170,40,${0.35 + 0.65 * l13})` : "#5a4a2a"} />
      <Label x={124} y={40} size={4.5} anchor="end">
        L
      </Label>
      <rect x={128} y={46} width={8} height={5} rx={1} fill={tx ? "#ffcc40" : "#5a4a2a"} />
      <Label x={124} y={50} size={4.5} anchor="end">
        TX
      </Label>
      <rect x={238} y={88} width={8} height={5} rx={1} fill={r ? "#5cff7a" : "#2c5a36"} />
      <Label x={250} y={92} size={4.5} anchor="start">
        ON
      </Label>
      <circle cx={262} cy={46} r={7} fill="#d0d0d0" stroke="#8b8b8b" />
    </g>
  );
}

function Nano({ r }: { r: Reading }) {
  const l13 = clamp01((r?.vD13 ?? 0) / 5);
  const top = ["D12", "D11", "D10", "D9", "D8", "D7", "D6", "D5", "D4", "D3", "D2", "GND", "RST", "RX0", "TX1"];
  const bottom = ["D13", "3V3", "REF", "A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "5V", "RST", "GND", "VIN"];
  return (
    <g>
      <rect x={0} y={0} width={160} height={80} rx={3} fill="#1f4e9c" stroke="#163a75" />
      <rect x={-10} y={28} width={22} height={24} rx={2} fill="#c8ccd2" />
      <rect x={60} y={30} width={40} height={20} rx={1} fill="#151515" transform="rotate(45 80 40)" />
      {top.map((s, i) => (
        <g key={`t${i}`}>
          <rect x={10 + i * 10 - 3} y={7} width={6} height={6} rx={3} fill="#d9b44a" />
          <Label x={10 + i * 10} y={21} size={3.8}>
            {s}
          </Label>
        </g>
      ))}
      {bottom.map((s, i) => (
        <g key={`b${i}`}>
          <rect x={10 + i * 10 - 3} y={67} width={6} height={6} rx={3} fill="#d9b44a" />
          <Label x={10 + i * 10} y={63} size={3.8}>
            {s}
          </Label>
        </g>
      ))}
      <rect x={24} y={30} width={6} height={4} rx={1} fill={l13 > 0.02 ? `rgba(255,170,40,${0.35 + 0.65 * l13})` : "#5a4a2a"} />
      <Label x={130} y={44} size={6} fill="#dbe7ff">
        NANO
      </Label>
    </g>
  );
}

/* ─── Breadboards ──────────────────────────────────────────────────────── */

const BBRow: Record<string, number> = { tp: 10, tn: 20, a: 50, b: 60, c: 70, d: 80, e: 90, f: 120, g: 130, h: 140, i: 150, j: 160, bn: 190, bp: 200 };
function Breadboard({ type }: { type: string }) {
  const cols = bbCols(type);
  const w = 20 + cols * 10;
  const mini = type === "breadboard-mini";
  const y0 = mini ? 30 : 0;
  const h = mini ? 150 : 210;
  const id = `bbh-${type}`;
  return (
    <g>
      <defs>
        <pattern id={id} x={15} y={0} width={10} height={10} patternUnits="userSpaceOnUse">
          <rect x={3.4} y={3.4} width={3.2} height={3.2} rx={0.6} fill="#55595f" />
        </pattern>
      </defs>
      <rect x={0} y={y0} width={w} height={h} rx={4} fill="#efeeea" stroke="#cfccc3" />
      <rect x={4} y={y0 + (mini ? 70 : 100) - 2} width={w - 8} height={6} fill="#dcd9d0" />
      {/* hole fields: a–e and f–j */}
      <rect x={15} y={45} width={cols * 10} height={50} fill={`url(#${id})`} />
      <rect x={15} y={115} width={cols * 10} height={50} fill={`url(#${id})`} />
      {!mini && (
        <>
          <rect x={15} y={5} width={cols * 10} height={20} fill={`url(#${id})`} />
          <rect x={15} y={185} width={cols * 10} height={20} fill={`url(#${id})`} />
          <line x1={12} x2={w - 4} y1={3} y2={3} stroke="#d63b3b" strokeWidth={1.2} />
          <line x1={12} x2={w - 4} y1={27} y2={27} stroke="#2f6fd6" strokeWidth={1.2} />
          <line x1={12} x2={w - 4} y1={183} y2={183} stroke="#2f6fd6" strokeWidth={1.2} />
          <line x1={12} x2={w - 4} y1={207} y2={207} stroke="#d63b3b" strokeWidth={1.2} />
          <Label x={7} y={12} size={6} fill="#d63b3b">
            +
          </Label>
          <Label x={7} y={22} size={6} fill="#2f6fd6">
            −
          </Label>
          <Label x={7} y={192} size={6} fill="#2f6fd6">
            −
          </Label>
          <Label x={7} y={202} size={6} fill="#d63b3b">
            +
          </Label>
        </>
      )}
      {BB_ROWS.map((r) => (
        <Label key={r} x={7} y={BBRow[r] + 2} size={4.5} fill="#8a877e">
          {r}
        </Label>
      ))}
      {Array.from({ length: cols }, (_, i) => i + 1)
        .filter((c) => c === 1 || c % 5 === 0)
        .map((c) => (
          <g key={c}>
            <Label x={10 + c * 10} y={42} size={4.2} fill="#8a877e">
              {c}
            </Label>
            <Label x={10 + c * 10} y={172} size={4.2} fill="#8a877e">
              {c}
            </Label>
          </g>
        ))}
    </g>
  );
}

/* ─── Components ───────────────────────────────────────────────────────── */

function Resistor({ p }: { p: PartInstance }) {
  const [b1, b2, b3] = bands(Number(propsOf(p).r));
  return (
    <g>
      <Lead x1={0} y1={0} x2={40} y2={0} />
      <rect x={9} y={-4.2} width={22} height={8.4} rx={3.5} fill="#e7cf9f" stroke="#b49a68" strokeWidth={0.6} />
      {[b1, b2, b3].map((c, i) => (
        <rect key={i} x={12.5 + i * 4} y={-4.2} width={2.2} height={8.4} fill={c} />
      ))}
      <rect x={25.5} y={-4.2} width={2.2} height={8.4} fill="#c9a227" />
    </g>
  );
}

function Led({ p, r }: { p: PartInstance; r: Reading }) {
  const c = LED_COLORS[String(propsOf(p).color)] ?? LED_COLORS.red;
  const on = clamp01((r?.i ?? 0) / 0.015);
  const over = (r?.i ?? 0) > 0.03;
  return (
    <g>
      <Lead x1={0} y1={0} x2={0} y2={-14} />
      <Lead x1={10} y1={0} x2={10} y2={-12} />
      {on > 0.02 && <circle cx={5} cy={-24} r={9 + on * 9} fill={c.glow} opacity={0.18 + on * 0.35} style={{ filter: "blur(3px)" }} />}
      <path d="M-2 -14h14v-10a7 7 0 0 0-14 0z" fill={c.fill} opacity={0.55 + on * 0.45} stroke={over ? "#ff4d5e" : "rgba(0,0,0,.35)"} strokeWidth={over ? 1.4 : 0.6} />
      {on > 0.02 && <path d="M0 -15h10v-9a5 5 0 0 0-10 0z" fill={c.glow} opacity={on} />}
      <rect x={-3} y={-15} width={16} height={2} fill={c.fill} />
      <Label x={-2} y={4.5} size={4} fill="#9fb0c8">
        +
      </Label>
    </g>
  );
}

function RgbLed({ p, r }: { p: PartInstance; r: Reading }) {
  const k = (x: number) => Math.round(255 * clamp01(x / 0.015));
  const lit = Math.max(r?.iR ?? 0, r?.iG ?? 0, r?.iB ?? 0) > 0.0003;
  return (
    <g>
      {[0, 10, 20, 30].map((x, i) => (
        <Lead key={x} x1={x} y1={0} x2={x} y2={i === 1 ? -16 : -13} />
      ))}
      {lit && <circle cx={15} cy={-24} r={16} fill={`rgb(${k(r!.iR)},${k(r!.iG)},${k(r!.iB)})`} opacity={0.45} style={{ filter: "blur(4px)" }} />}
      <path d="M5 -14h20v-10a10 10 0 0 0-20 0z" fill={lit ? `rgb(${Math.max(60, k(r!.iR))},${Math.max(60, k(r!.iG))},${Math.max(60, k(r!.iB))})` : "#d8dde4"} opacity={0.9} stroke="rgba(0,0,0,.3)" strokeWidth={0.6} />
      {["R", propsOf(p).common === "anode" ? "+" : "−", "G", "B"].map((s, i) => (
        <Label key={i} x={i * 10} y={6} size={4} fill="#9fb0c8">
          {s}
        </Label>
      ))}
    </g>
  );
}

function Button({ live }: { live: Record<string, unknown> }) {
  const pressed = Boolean(live.pressed);
  return (
    <g>
      <rect x={-4} y={-4} width={28} height={38} rx={2} fill="#2a2d33" stroke="#15171a" />
      <circle cx={10} cy={15} r={pressed ? 7.5 : 8.5} fill={pressed ? "#c23a3a" : "#e04848"} stroke="#801f1f" data-action="press" style={{ cursor: "pointer" }} />
      {[
        [0, 0],
        [20, 0],
        [0, 30],
        [20, 30],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r={1.6} fill="#b8c2cc" />
      ))}
    </g>
  );
}

function Slide({ p, live }: { p: PartInstance; live: Record<string, unknown> }) {
  const on = Boolean(live.on ?? propsOf(p).on);
  return (
    <g data-action="toggle" style={{ cursor: "pointer" }}>
      {[0, 10, 20].map((x) => (
        <Lead key={x} x1={x} y1={0} x2={x} y2={-6} />
      ))}
      <rect x={-4} y={-18} width={28} height={12} rx={2} fill="#2b313a" stroke="#14171b" />
      <rect x={on ? 11 : 1} y={-16} width={8} height={8} rx={1} fill="#e6e9ee" />
      <Label x={0} y={4} size={4} fill="#9fb0c8">
        A
      </Label>
      <Label x={20} y={4} size={4} fill="#9fb0c8">
        B
      </Label>
    </g>
  );
}

function Pot({ p, live }: { p: PartInstance; live: Record<string, unknown> }) {
  const pos = Number(live.pos ?? propsOf(p).pos ?? 0.5);
  const a = -135 + 270 * clamp01(pos);
  return (
    <g>
      {[0, 10, 20].map((x) => (
        <Lead key={x} x1={x} y1={0} x2={x} y2={-8} />
      ))}
      <rect x={-6} y={-38} width={32} height={30} rx={3} fill="#2f5bb5" stroke="#1d3a78" />
      <g data-action="knob" style={{ cursor: "grab" }}>
        <circle cx={10} cy={-23} r={11} fill="#d7dbe2" stroke="#8b929c" />
        <line x1={10} y1={-23} x2={10} y2={-32} stroke="#262a30" strokeWidth={2.2} strokeLinecap="round" transform={`rotate(${a} 10 -23)`} />
      </g>
      <Label x={10} y={-40} size={4.2} fill="#9fb0c8">
        {eng(Number(propsOf(p).r), "Ω", 2)}
      </Label>
    </g>
  );
}

function Capacitor({ p, r }: { p: PartInstance; r: Reading }) {
  const pr = propsOf(p);
  return (
    <g>
      <Lead x1={0} y1={0} x2={0} y2={-10} />
      <Lead x1={10} y1={0} x2={10} y2={-10} />
      {pr.polar ? (
        <>
          <rect x={-3} y={-28} width={16} height={18} rx={3} fill="#24324f" stroke="#111a2c" />
          <rect x={8} y={-28} width={5} height={18} fill="#b9c3d6" opacity={0.7} />
        </>
      ) : (
        <ellipse cx={5} cy={-17} rx={8} ry={7} fill="#e2a33b" stroke="#a46e1d" />
      )}
      <Label x={5} y={-31} size={4} fill="#9fb0c8">
        {eng(Number(pr.c), "F", 2)}
      </Label>
      {r && <Label x={5} y={6} size={4} fill="#7fe3ff">{`${eng(r.v ?? 0, "V", 2)}`}</Label>}
    </g>
  );
}

function Diode() {
  return (
    <g>
      <Lead x1={0} y1={0} x2={40} y2={0} />
      <rect x={11} y={-3.6} width={18} height={7.2} rx={2} fill="#1b1b1b" />
      <rect x={25} y={-3.6} width={2.4} height={7.2} fill="#d0d4da" />
    </g>
  );
}

function To92({ label, pins }: { label: string; pins: string[] }) {
  return (
    <g>
      {[0, 10, 20].map((x) => (
        <Lead key={x} x1={x} y1={0} x2={x} y2={-10} />
      ))}
      <path d="M-3 -10h26v-10a13 9 0 0 0-26 0z" fill="#1d1d1d" />
      <Label x={10} y={-15} size={4} fill="#cfd6df">
        {label}
      </Label>
      {pins.map((s, i) => (
        <Label key={i} x={i * 10} y={6} size={4} fill="#9fb0c8">
          {s}
        </Label>
      ))}
    </g>
  );
}

function Mosfet() {
  return (
    <g>
      {[0, 10, 20].map((x) => (
        <Lead key={x} x1={x} y1={0} x2={x} y2={-12} />
      ))}
      <rect x={-6} y={-30} width={32} height={18} rx={1} fill="#1d1d1d" />
      <rect x={-6} y={-38} width={32} height={9} fill="#b9c0c9" />
      <circle cx={10} cy={-34} r={2.6} fill="#5a6270" />
      <Label x={10} y={-19} size={4} fill="#cfd6df">
        IRLZ44N
      </Label>
      {["G", "D", "S"].map((s, i) => (
        <Label key={i} x={i * 10} y={6} size={4} fill="#9fb0c8">
          {s}
        </Label>
      ))}
    </g>
  );
}

function Buzzer({ p, r }: { p: PartInstance; r: Reading }) {
  const sounding = propsOf(p).active ? (r?.v ?? 0) > 2.5 : (r?.freq ?? 0) > 0;
  return (
    <g>
      <Lead x1={0} y1={0} x2={0} y2={-8} />
      <Lead x1={20} y1={0} x2={20} y2={-8} />
      <circle cx={10} cy={-20} r={14} fill="#1b1b1b" stroke={sounding ? "#3cc4ff" : "#000"} strokeWidth={sounding ? 1.6 : 0.6} />
      <circle cx={10} cy={-20} r={3} fill="#444" />
      {sounding && (
        <>
          <path d="M28 -30a14 14 0 0 1 0 20" fill="none" stroke="#3cc4ff" strokeWidth={1.2} />
          <path d="M32 -34a20 20 0 0 1 0 28" fill="none" stroke="#3cc4ff" strokeWidth={1} opacity={0.6} />
        </>
      )}
      <Label x={0} y={6} size={4} fill="#9fb0c8">
        +
      </Label>
      {r?.freq ? (
        <Label x={10} y={-37} size={4.5} fill="#7fe3ff">
          {`${Math.round(r.freq)} Hz`}
        </Label>
      ) : null}
    </g>
  );
}

function Servo({ r }: { r: Reading }) {
  const angle = r && r.angle >= 0 ? r.angle : 90;
  return (
    <g>
      <Lead x1={0} y1={0} x2={0} y2={-8} />
      <Lead x1={10} y1={0} x2={10} y2={-8} />
      <Lead x1={20} y1={0} x2={20} y2={-8} />
      <rect x={-4} y={-12} width={28} height={6} rx={1} fill="#222" />
      <path d="M0 -12 C 0 -24, 14 -22, 14 -30" stroke="#7a4a1d" strokeWidth={1.4} fill="none" />
      <rect x={-6} y={-72} width={52} height={40} rx={3} fill="#2462c2" stroke="#173f80" />
      <circle cx={30} cy={-52} r={9} fill="#e9ecf0" />
      <g transform={`rotate(${90 - angle} 30 -52)`}>
        <path d="M30 -52 L 30 -78" stroke="#f6f7f9" strokeWidth={6} strokeLinecap="round" />
      </g>
      <Label x={8} y={-60} size={5} fill="#dbe7ff">
        SG90
      </Label>
      {r && r.angle >= 0 && (
        <Label x={8} y={-38} size={5} fill="#7fe3ff">
          {`${Math.round(angle)}°`}
        </Label>
      )}
      {["−", "+", "S"].map((s, i) => (
        <Label key={i} x={i * 10} y={6} size={4} fill="#9fb0c8">
          {s}
        </Label>
      ))}
    </g>
  );
}

function Motor({ r }: { r: Reading }) {
  const s = r?.speed ?? 0;
  const dur = Math.abs(s) > 0.02 ? Math.max(0.08, 0.6 / Math.abs(s)) : 0;
  return (
    <g>
      <Lead x1={0} y1={0} x2={0} y2={-10} />
      <Lead x1={20} y1={0} x2={20} y2={-10} />
      <rect x={-6} y={-46} width={32} height={36} rx={6} fill="#bfc6cf" stroke="#7f8893" />
      <g>
        <circle cx={10} cy={-28} r={8} fill="#e8b45c" stroke="#9c7330" />
        <line x1={10} y1={-28} x2={10} y2={-36} stroke="#3a2a10" strokeWidth={2}>
          {dur > 0 && <animateTransform attributeName="transform" type="rotate" from={`0 10 -28`} to={`${s > 0 ? 360 : -360} 10 -28`} dur={`${dur}s`} repeatCount="indefinite" />}
        </line>
      </g>
      {r && (
        <Label x={10} y={-49} size={4.5} fill="#7fe3ff">
          {`${Math.round(Math.abs(s) * 100)}%`}
        </Label>
      )}
    </g>
  );
}

function Battery({ label, w }: { label: string; w: number }) {
  return (
    <g>
      <Lead x1={0} y1={0} x2={0} y2={-10} />
      <Lead x1={w} y1={0} x2={w} y2={-10} />
      <rect x={-6} y={-60} width={w + 12} height={50} rx={4} fill="#1d1f24" stroke="#000" />
      <rect x={-6} y={-60} width={w + 12} height={14} rx={4} fill="#c9a227" />
      <Label x={w / 2} y={-28} size={8} fill="#f3f4f6">
        {label}
      </Label>
      <Label x={0} y={6} size={5} fill="#ff6b6b">
        +
      </Label>
      <Label x={w} y={6} size={5} fill="#9fb0c8">
        −
      </Label>
    </g>
  );
}

function Supply({ p, r }: { p: PartInstance; r: Reading }) {
  return (
    <g>
      <Lead x1={0} y1={0} x2={0} y2={-8} />
      <Lead x1={50} y1={0} x2={50} y2={-8} />
      <rect x={-6} y={-56} width={62} height={48} rx={4} fill="#2b2f36" stroke="#111" />
      <rect x={0} y={-50} width={50} height={20} rx={2} fill="#0b1a10" />
      <Label x={25} y={-36} size={8} fill="#5cff7a">
        {`${Number(propsOf(p).v).toFixed(1)}V`}
      </Label>
      <Label x={25} y={-20} size={5} fill="#9fb0c8">
        {r ? `${eng(Math.abs(r.i ?? 0), "A", 2)}` : "DC"}
      </Label>
      <circle cx={0} cy={-8} r={3} fill="#d63b3b" />
      <circle cx={50} cy={-8} r={3} fill="#222" stroke="#666" />
    </g>
  );
}

function Ldr({ p, live }: { p: PartInstance; live: Record<string, unknown> }) {
  const lux = Number(live.lux ?? propsOf(p).lux ?? 300);
  return (
    <g>
      <Lead x1={0} y1={0} x2={0} y2={-10} />
      <Lead x1={10} y1={0} x2={10} y2={-10} />
      <circle cx={5} cy={-17} r={8} fill="#f1e6c4" stroke="#b3a47a" />
      <path d="M0 -21h10M0 -17h10M0 -13h10" stroke="#c0392b" strokeWidth={1} />
      <Label x={5} y={-28} size={4.2} fill="#ffe54a">{`${Math.round(lux)} lx`}</Label>
    </g>
  );
}

function Thermistor({ p, live }: { p: PartInstance; live: Record<string, unknown> }) {
  const t = Number(live.temp ?? propsOf(p).temp ?? 25);
  return (
    <g>
      <Lead x1={0} y1={0} x2={0} y2={-10} />
      <Lead x1={10} y1={0} x2={10} y2={-10} />
      <ellipse cx={5} cy={-16} rx={6} ry={7} fill="#2c2c2c" />
      <Label x={5} y={-26} size={4.2} fill="#ff9a3c">{`${t.toFixed(0)}°C`}</Label>
    </g>
  );
}

function Sonar({ p, live, r }: { p: PartInstance; live: Record<string, unknown>; r: Reading }) {
  const cm = Number(live.cm ?? propsOf(p).cm ?? 50);
  return (
    <g>
      {[0, 10, 20, 30].map((x) => (
        <Lead key={x} x1={x} y1={0} x2={x} y2={-10} />
      ))}
      <rect x={-28} y={-50} width={86} height={40} rx={2} fill="#1f5fae" stroke="#123c70" />
      {[-8, 38].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={-30} r={15} fill="#c6cbd2" stroke="#7d848e" />
          <circle cx={cx} cy={-30} r={10} fill="#2e3238" />
        </g>
      ))}
      <Label x={15} y={-53} size={4.5} fill={r?.pings ? "#7fe3ff" : "#9fb0c8"}>{`${Math.round(cm)} cm`}</Label>
      {["VCC", "TRIG", "ECHO", "GND"].map((s, i) => (
        <Label key={i} x={i * 10} y={6} size={3.4} fill="#9fb0c8">
          {s}
        </Label>
      ))}
    </g>
  );
}

function Meter({ r, kind }: { r: Reading; kind: "V" | "A" }) {
  const val = kind === "V" ? r?.v : r?.i;
  return (
    <g>
      <Lead x1={0} y1={0} x2={0} y2={-8} />
      <Lead x1={30} y1={0} x2={30} y2={-8} />
      <rect x={-8} y={-46} width={46} height={38} rx={5} fill="#f2c230" stroke="#9c7a12" />
      <rect x={-3} y={-41} width={36} height={16} rx={2} fill="#c5d4b5" />
      <Label x={15} y={-29} size={8} fill="#1d2a12">
        {val === undefined ? "--" : kind === "V" ? `${val.toFixed(2)}` : `${eng(val, "", 3)}`}
      </Label>
      <Label x={15} y={-15} size={6} fill="#3a2a00">
        {kind === "V" ? "V DC" : "A DC"}
      </Label>
      <circle cx={0} cy={-8} r={2.5} fill="#d63b3b" />
      <circle cx={30} cy={-8} r={2.5} fill="#1b1b1b" />
    </g>
  );
}

function Unknown() {
  return <rect x={-10} y={-10} width={20} height={20} fill="#552" stroke="#aa4" />;
}

export const PartArt = memo(function PartArt({ p, r, live = {} }: { p: PartInstance; r?: Reading; live?: Record<string, unknown> }) {
  switch (p.type) {
    case "arduino-uno":
      return <Uno r={r} />;
    case "arduino-nano":
      return <Nano r={r} />;
    case "breadboard":
    case "breadboard-half":
    case "breadboard-mini":
      return <Breadboard type={p.type} />;
    case "resistor":
      return <Resistor p={p} />;
    case "led":
      return <Led p={p} r={r} />;
    case "rgb-led":
      return <RgbLed p={p} r={r} />;
    case "pushbutton":
      return <Button live={live} />;
    case "slide-switch":
      return <Slide p={p} live={live} />;
    case "potentiometer":
      return <Pot p={p} live={live} />;
    case "capacitor":
      return <Capacitor p={p} r={r} />;
    case "diode":
      return <Diode />;
    case "npn":
      return <To92 label="2N2222" pins={["E", "B", "C"]} />;
    case "pnp":
      return <To92 label="2N3906" pins={["E", "B", "C"]} />;
    case "nmos":
      return <Mosfet />;
    case "buzzer":
      return <Buzzer p={p} r={r} />;
    case "servo":
      return <Servo r={r} />;
    case "dc-motor":
      return <Motor r={r} />;
    case "battery-9v":
      return <Battery label="9V" w={20} />;
    case "battery-aa":
      return <Battery label={`${(1.5 * Number(propsOf(p).cells ?? 2)).toFixed(1)}V`} w={40} />;
    case "power-supply":
      return <Supply p={p} r={r} />;
    case "ldr":
      return <Ldr p={p} live={live} />;
    case "thermistor":
      return <Thermistor p={p} live={live} />;
    case "hc-sr04":
      return <Sonar p={p} live={live} r={r} />;
    case "voltmeter":
      return <Meter r={r} kind="V" />;
    case "ammeter":
      return <Meter r={r} kind="A" />;
    default: {
      const m = ModuleArt({ p, r, live });
      if (m !== undefined) return m;
      return PART_BY_TYPE.has(p.type) ? null : <Unknown />;
    }
  }
});

/** A small, non-interactive picture of a whole circuit (cards, thumbnails). */
export function CircuitThumb({ doc, className }: { doc: { parts: PartInstance[]; wires: { a: { part: string; pin: string }; b: { part: string; pin: string }; pts: [number, number][]; color: string }[] }; className?: string }) {
  return <ThumbInner doc={doc} className={className} />;
}

function ThumbInner({ doc, className }: Parameters<typeof CircuitThumb>[0]) {
  if (!doc.parts.length) return <svg className={className} viewBox="0 0 100 60" />;
  const boxes = doc.parts.map(worldBox);
  const pad = 20;
  const x0 = Math.min(...boxes.map((b) => b.x)) - pad;
  const y0 = Math.min(...boxes.map((b) => b.y)) - pad;
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad;
  const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
  const pins = new Map(doc.parts.flatMap((p) => worldPins(p).map((q) => [`${p.id}:${q.name}`, q] as const)));
  return (
    <svg className={className} viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      {doc.parts.map((p) => (
        <g key={p.id} transform={`translate(${p.x} ${p.y}) rotate(${p.rot})`}>
          <PartArt p={p} />
        </g>
      ))}
      {doc.wires.map((w, i) => {
        const a = pins.get(`${w.a.part}:${w.a.pin}`);
        const b = pins.get(`${w.b.part}:${w.b.pin}`);
        if (!a || !b) return null;
        const pts = [[a.x, a.y], ...w.pts, [b.x, b.y]].map((q) => q.join(",")).join(" ");
        return <polyline key={i} points={pts} fill="none" stroke={w.color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />;
      })}
    </svg>
  );
}

/* ─── Realistic pictures (rendered from the 3D models) ─────────────────── */

type SpriteMod = typeof import("./view3d/sprites");
let spriteMod: SpriteMod | null = null;
let spriteLoad: Promise<void> | null = null;
const spriteSubs = new Set<() => void>();
function loadSprites() {
  spriteLoad ??= import("./view3d/sprites").then((m) => {
    spriteMod = m;
    m.onSprites(() => spriteSubs.forEach((s) => s()));
    spriteSubs.forEach((s) => s());
  });
  return spriteLoad;
}

/** Re-render when realistic pictures become available. */
export function useSpriteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    spriteSubs.add(fn);
    void loadSprites();
    return () => void spriteSubs.delete(fn);
  }, []);
}

const ACTION: Record<string, string> = { pushbutton: "press", "slide-switch": "toggle", potentiometer: "knob" };

/**
 * A part on the canvas, positioned at its origin (the caller translates): the realistic picture with
 * live overlays when it's ready, else the drawing. Pictures are already rotated; drawings rotate here.
 */
export function PartVisual({ p, r, live = {}, realistic }: { p: PartInstance; r?: Reading; live?: Record<string, unknown>; realistic: boolean }) {
  const sprite = realistic && spriteMod ? spriteMod.getSprite(p, live, r) : null;
  if (!sprite)
    return (
      <g transform={`rotate(${p.rot})`}>
        <PartArt p={p} r={r} live={live} />
      </g>
    );
  const a = sprite.anchors;
  const action = ACTION[p.type];
  return (
    <g data-action={action} style={action ? { cursor: "pointer" } : undefined}>
      <image href={sprite.url} x={sprite.x} y={sprite.y} width={sprite.w} height={sprite.h} preserveAspectRatio="none" />
      <SpriteOverlay p={p} r={r} live={live} a={a} />
    </g>
  );
}

function Glow({ at, color, k, size = 1 }: { at?: [number, number]; color: string; k: number; size?: number }) {
  if (!at || k <= 0.02) return null;
  return (
    <g pointerEvents="none">
      <circle cx={at[0]} cy={at[1]} r={(10 + 12 * k) * size} fill={color} opacity={0.22 + 0.4 * k} style={{ filter: "blur(4px)" }} />
      <circle cx={at[0]} cy={at[1]} r={(4 + 3 * k) * size} fill="#ffffff" opacity={0.35 + 0.55 * k} style={{ filter: "blur(1.5px)" }} />
    </g>
  );
}

function Tag({ at, children, color = "#7fe3ff" }: { at?: [number, number]; children: ReactNode; color?: string }) {
  if (!at) return null;
  return (
    <g pointerEvents="none">
      <text x={at[0]} y={at[1]} fontSize={6} fontFamily={FONT} textAnchor="middle" fill="#050e26" stroke="#050e26" strokeWidth={2.4} strokeLinejoin="round" style={{ userSelect: "none" }}>
        {children}
      </text>
      <text x={at[0]} y={at[1]} fontSize={6} fontFamily={FONT} textAnchor="middle" fill={color} style={{ userSelect: "none" }}>
        {children}
      </text>
    </g>
  );
}

function Screen({ at, lines, bg, fg, w = 26, h = 13 }: { at?: [number, number]; lines: string[]; bg: string; fg: string; w?: number; h?: number }) {
  if (!at) return null;
  return (
    <g pointerEvents="none">
      <rect x={at[0] - w / 2} y={at[1] - h / 2} width={w} height={h} rx={1.5} fill={bg} />
      <text x={at[0]} y={at[1] + (lines[1] ? 0.5 : 2.5)} fontSize={lines[1] ? 6 : 7} fontFamily={FONT} textAnchor="middle" fill={fg} fontWeight={700}>
        {lines[0]}
      </text>
      {lines[1] && (
        <text x={at[0]} y={at[1] + 5} fontSize={3.4} fontFamily={FONT} textAnchor="middle" fill={fg}>
          {lines[1]}
        </text>
      )}
    </g>
  );
}

function SpriteOverlay({ p, r, live, a }: { p: PartInstance; r?: Reading; live: Record<string, unknown>; a: Record<string, [number, number]> }) {
  const pr = propsOf(p);
  switch (p.type) {
    case "led": {
      const c = LED_COLORS[String(pr.color)] ?? LED_COLORS.red;
      return <Glow at={a.glow} color={c.glow} k={clamp01((r?.i ?? 0) / 0.015)} />;
    }
    case "rgb-led": {
      const k = (x?: number) => clamp01((x ?? 0) / 0.015);
      const m = Math.max(k(r?.iR), k(r?.iG), k(r?.iB));
      return <Glow at={a.glow} color={`rgb(${Math.round(255 * k(r?.iR))},${Math.round(255 * k(r?.iG))},${Math.round(255 * k(r?.iB))})`} k={m} />;
    }
    case "arduino-uno":
    case "arduino-nano":
      return (
        <>
          <Glow at={a.L} color="#ffa21a" k={clamp01((r?.vD13 ?? 0) / 5)} size={0.45} />
          <Glow at={a.TX} color="#ffd23a" k={r?.tx ? 1 : 0} size={0.4} />
          <Glow at={a.ON} color="#3cff6a" k={r ? 0.8 : 0} size={0.4} />
        </>
      );
    case "buzzer": {
      const sounding = pr.active ? (r?.v ?? 0) > 2.5 : (r?.freq ?? 0) > 0;
      if (!sounding || !a.top) return null;
      return (
        <g pointerEvents="none">
          <circle cx={a.top[0]} cy={a.top[1]} r={18} fill="none" stroke="#3cc4ff" strokeWidth={1.2} opacity={0.7} />
          <circle cx={a.top[0]} cy={a.top[1]} r={26} fill="none" stroke="#3cc4ff" strokeWidth={0.8} opacity={0.4} />
          {r?.freq ? <Tag at={[a.top[0], a.top[1] - 30]}>{`${Math.round(r.freq)} Hz`}</Tag> : null}
        </g>
      );
    }
    case "servo":
      return r && r.angle >= 0 ? <Tag at={a.label}>{`${Math.round(r.angle)}°`}</Tag> : null;
    case "dc-motor":
      return r ? <Tag at={a.label}>{`${Math.round(Math.abs(r.speed ?? 0) * 100)}%`}</Tag> : null;
    case "voltmeter":
    case "ammeter": {
      const v = p.type === "voltmeter" ? r?.v : r?.i;
      return <Screen at={a.screen} bg="#c5d4b5" fg="#1d2a12" lines={[v === undefined ? "----" : p.type === "voltmeter" ? v.toFixed(2) : (v * 1000).toFixed(1), p.type === "voltmeter" ? "V DC" : "mA DC"]} w={28} h={11} />;
    }
    case "power-supply":
      return <Screen at={a.screen} bg="#0b1a10" fg="#5cff7a" lines={[`${Number(pr.v).toFixed(1)} V`, r ? `${(Math.abs(r.i ?? 0) * 1000).toFixed(0)} mA` : "DC"]} w={34} h={17} />;
    case "capacitor":
      return r ? <Tag at={a.label}>{eng(r.v ?? 0, "V", 2)}</Tag> : null;
    case "ldr":
      return <Tag at={a.label} color="#ffe54a">{`${Math.round(Number(live.lux ?? pr.lux ?? 300))} lx`}</Tag>;
    case "thermistor":
      return <Tag at={a.label} color="#ff9a3c">{`${Number(live.temp ?? pr.temp ?? 25).toFixed(0)}°C`}</Tag>;
    case "hc-sr04":
      return <Tag at={a.label}>{`${Math.round(Number(live.cm ?? pr.cm ?? 50))} cm`}</Tag>;
    default:
      return <ModuleOverlay p={p} r={r} live={live} a={a} />;
  }
}
