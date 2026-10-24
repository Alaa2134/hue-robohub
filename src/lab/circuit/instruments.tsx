"use client";
/**
 * Bench instruments for a running simulation: a pin monitor (mode, voltage and current of every board
 * pin) and an oscilloscope over the board pins. Both read what the simulator actually computed: the
 * scope draws each pin's recorded voltage changes at the cycle they happened, nothing is interpolated.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useLang } from "../i18n";
import { Button, Icon, cn } from "../ui";
import { TRACE_PINS, type Frame } from "../sim/engine";
import { at, measure, toCsv, triggerTime, valueAt } from "../sim/scope";
import { TRACE_KEEP, type Trace } from "../sim/use-sim";
import { AVR_PINS } from "./parts";

const MODE: Record<number, { en: string; ar: string }> = {
  0: { en: "OUTPUT LOW", ar: "خرج LOW" },
  1: { en: "OUTPUT HIGH", ar: "خرج HIGH" },
  2: { en: "INPUT", ar: "دخل" },
  3: { en: "INPUT_PULLUP", ar: "دخل PULLUP" },
};

/* ─── Pin monitor ──────────────────────────────────────────────────────── */

export function PinMonitor({ frame, board }: { frame: Frame | null; board: string | undefined }) {
  const { l } = useLang();
  const r = board ? frame?.parts[board] : undefined;
  if (!r)
    return (
      <p className="p-3 text-sm text-fog" data-testid="pin-monitor">
        {l({ en: "Start the simulation to see every board pin live.", ar: "شغّل المحاكاة عشان تشوف كل بنات البورد لايف." })}
      </p>
    );
  return (
    <div className="h-full overflow-auto p-2" data-testid="pin-monitor">
      <table className="w-full text-xs" dir="ltr">
        <thead className="sticky top-0 bg-deep text-fog">
          <tr>
            <th className="px-2 py-1 text-start">{l({ en: "Pin", ar: "البن" })}</th>
            <th className="px-2 py-1 text-start">{l({ en: "Mode", ar: "الوضع" })}</th>
            <th className="px-2 py-1 text-end">{l({ en: "Now", ar: "دلوقتي" })}</th>
            <th className="w-40 px-2 py-1 text-start">{l({ en: "Average (frame)", ar: "المتوسط" })}</th>
            <th className="px-2 py-1 text-end">{l({ en: "Current", ar: "التيار" })}</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {Object.keys(AVR_PINS).map((pin) => {
            const mode = r[`mode${pin}`];
            const now = r[`now_v${pin}`] ?? 0;
            const avg = r[`v${pin}`] ?? 0;
            const ma = (r[`i${pin}`] ?? 0) * 1000;
            const out = mode === 0 || mode === 1;
            // An output whose average sits between the rails is switching: PWM (or fast toggling).
            const pwm = out && avg > 0.05 && avg < 4.95;
            return (
              <tr key={pin} className="border-t border-rim/60" data-pin={pin}>
                <td className="px-2 py-0.5 font-semibold text-frost">{pin}</td>
                <td className={cn("px-2 py-0.5", out ? (mode === 1 ? "text-ok" : "text-mist") : "text-cyan")}>{mode === undefined ? "—" : l(MODE[mode])}</td>
                <td className="px-2 py-0.5 text-end tabular-nums">{now.toFixed(2)} V</td>
                <td className="px-2 py-0.5">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 flex-1 rounded bg-panel-2">
                      <span className="block h-full rounded bg-cyan" style={{ width: `${Math.max(0, Math.min(100, (avg / 5) * 100))}%` }} />
                    </span>
                    <span className="w-16 text-end tabular-nums">{pwm ? `${Math.round((avg / 5) * 100)}%` : `${avg.toFixed(2)} V`}</span>
                  </span>
                </td>
                <td className={cn("px-2 py-0.5 text-end tabular-nums", Math.abs(ma) > 40 ? "text-danger" : Math.abs(ma) > 20 ? "text-warn" : "")}>{Math.abs(ma) < 0.05 ? "—" : `${ma.toFixed(1)} mA`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Oscilloscope ─────────────────────────────────────────────────────── */

const COLORS = ["#ffd23f", "#3cc4ff", "#ff5a8a", "#3cff9a"];
const TIMEBASES = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5];
const VOLTS = [0.5, 1, 2];
const DIVS_X = 10;
const DIVS_Y = 6;
const fmtT = (s: number) => (Math.abs(s) >= 1 ? `${s.toFixed(3)} s` : Math.abs(s) >= 1e-3 ? `${(s * 1e3).toFixed(3)} ms` : `${(s * 1e6).toFixed(1)} µs`);
const fmtF = (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(3)} kHz` : `${f.toFixed(2)} Hz`);

type Trig = "auto" | "rise" | "fall";

export function Oscilloscope({ trace, lost, frame, setTracing, running }: { trace: RefObject<Trace>; lost: RefObject<number>; frame: Frame | null; setTracing: (on: boolean) => void; running: boolean }) {
  const { l } = useLang();
  const [chans, setChans] = useState<(string | "")[]>(["D13", "D9", "", ""]);
  const [tb, setTb] = useState(0.005);
  const [vdiv, setVdiv] = useState(1);
  const [trig, setTrig] = useState<Trig>("rise");
  const [level, setLevel] = useState(2.5);
  const [hold, setHold] = useState<number | null>(null);
  const [cursors, setCursors] = useState<number[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const windowRef = useRef<[number, number]>([0, 0]);
  const now = frame?.t ?? 0;

  // Record only while the scope is open.
  useEffect(() => {
    setTracing(true);
    return () => setTracing(false);
  }, [setTracing]);

  const span = tb * DIVS_X;
  const ch = (i: number) => (chans[i] ? trace.current?.[TRACE_PINS.indexOf(chans[i])] : undefined);

  // The window: held, or the latest trigger, or the most recent span.
  const [t0, t1] = useMemo(() => {
    if (hold !== null) return [hold, hold + span];
    const c = ch(0);
    if (trig !== "auto" && c) {
      const tt = triggerTime(c, now, span, level, trig === "rise", TRACE_KEEP);
      if (tt !== null) return [tt - span * 0.1, tt + span * 0.9];
    }
    return [Math.max(0, now - span), Math.max(span, now)];
    // `ch` reads the live trace ref; `now` changes every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hold, span, trig, level, now, chans]);
  windowRef.current = [t0, t1];

  // Draw.
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const g = cv.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#040b1f";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(120,150,210,.18)";
    g.lineWidth = 1;
    for (let i = 0; i <= DIVS_X; i++) {
      const x = Math.round((i / DIVS_X) * w) + 0.5;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    for (let i = 0; i <= DIVS_Y; i++) {
      const y = Math.round((i / DIVS_Y) * h) + 0.5;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    const X = (t: number) => ((t - t0) / (t1 - t0)) * w;
    const Y = (v: number) => h - (v / (vdiv * DIVS_Y)) * h;
    // Trigger level.
    if (trig !== "auto") {
      g.setLineDash([4, 4]);
      g.strokeStyle = "rgba(255,210,63,.5)";
      g.beginPath();
      g.moveTo(0, Y(level));
      g.lineTo(w, Y(level));
      g.stroke();
      g.setLineDash([]);
    }
    chans.forEach((name, i) => {
      if (!name) return;
      const c = trace.current?.[TRACE_PINS.indexOf(name)];
      if (!c || !c.t.length) return;
      g.strokeStyle = COLORS[i];
      g.lineWidth = 1.6;
      g.beginPath();
      let k = Math.max(0, at(c, t0));
      let v = c.v[k];
      g.moveTo(Math.max(0, X(c.t[k])), Y(v));
      // Many changes per pixel: draw the column as a filled band instead of every edge.
      let lastX = -1;
      for (k = k + 1; k < c.t.length && c.t[k] <= t1; k++) {
        const x = X(c.t[k]);
        if (Math.floor(x) === lastX && k + 1 < c.t.length && c.t[k + 1] <= t1) {
          g.lineTo(x, Y(c.v[k]));
          v = c.v[k];
          continue;
        }
        g.lineTo(x, Y(v));
        g.lineTo(x, Y(c.v[k]));
        v = c.v[k];
        lastX = Math.floor(x);
      }
      g.lineTo(Math.min(w, X(Math.min(t1, now))), Y(v));
      g.stroke();
    });
    // Cursors.
    cursors.forEach((ct, i) => {
      const x = X(ct);
      g.strokeStyle = i ? "#ff9f43" : "#ffffff";
      g.setLineDash([2, 3]);
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
      g.setLineDash([]);
    });
    if (hover !== null) {
      g.strokeStyle = "rgba(255,255,255,.35)";
      g.beginPath();
      g.moveTo(X(hover), 0);
      g.lineTo(X(hover), h);
      g.stroke();
    }
  }, [t0, t1, vdiv, chans, cursors, hover, trig, level, now, trace]);

  const tAt = (clientX: number) => {
    const r = canvas.current!.getBoundingClientRect();
    const [a, b] = windowRef.current;
    return a + ((clientX - r.left) / r.width) * (b - a);
  };

  const meas = chans.map((_, i) => {
    const c = ch(i);
    return c ? measure(c, t0, Math.min(t1, now)) : null;
  });

  const exportCsv = () => {
    const names = chans.filter(Boolean) as string[];
    const csv = toCsv(
      names,
      names.map((n) => trace.current![TRACE_PINS.indexOf(n)]),
      Math.max(0, now - TRACE_KEEP),
      now,
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `buildx-scope-${now.toFixed(3)}s.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const sel = "rounded bg-abyss px-1 py-0.5 ring-1 ring-rim";
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 p-2 text-xs" data-testid="oscilloscope" dir="ltr">
      <div className="flex flex-wrap items-center gap-1.5">
        {chans.map((c, i) => (
          <label key={i} className="flex items-center gap-1">
            <span className="size-2.5 rounded-full" style={{ background: COLORS[i] }} />
            <select aria-label={`CH${i + 1}`} className={sel} value={c} onChange={(e) => setChans(chans.map((x, j) => (j === i ? e.target.value : x)))} data-testid={`scope-ch${i + 1}`}>
              <option value="">{`CH${i + 1} off`}</option>
              {TRACE_PINS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        ))}
        <select aria-label={l({ en: "Time per division", ar: "الزمن لكل مربع" })} className={sel} value={tb} onChange={(e) => setTb(Number(e.target.value))} data-testid="scope-timebase">
          {TIMEBASES.map((x) => (
            <option key={x} value={x}>
              {fmtT(x)}/div
            </option>
          ))}
        </select>
        <select aria-label={l({ en: "Volts per division", ar: "الفولت لكل مربع" })} className={sel} value={vdiv} onChange={(e) => setVdiv(Number(e.target.value))}>
          {VOLTS.map((x) => (
            <option key={x} value={x}>
              {x} V/div
            </option>
          ))}
        </select>
        <select aria-label={l({ en: "Trigger", ar: "التريجر" })} className={sel} value={trig} onChange={(e) => setTrig(e.target.value as Trig)}>
          <option value="auto">{l({ en: "Free run", ar: "مستمر" })}</option>
          <option value="rise">{l({ en: "CH1 rising ↑", ar: "CH1 طالع ↑" })}</option>
          <option value="fall">{l({ en: "CH1 falling ↓", ar: "CH1 نازل ↓" })}</option>
        </select>
        {trig !== "auto" && (
          <label className="flex items-center gap-1">
            <span className="text-fog">{l({ en: "level", ar: "المستوى" })}</span>
            <input type="number" min={0} max={5} step={0.1} value={level} onChange={(e) => setLevel(Number(e.target.value))} className={cn(sel, "w-14")} />V
          </label>
        )}
        <span className="flex-1" />
        <Button size="sm" variant={hold !== null ? "primary" : "soft"} onClick={() => setHold(hold !== null ? null : t0)} disabled={!frame} data-testid="scope-hold">
          <Icon name={hold !== null ? "play" : "pause"} size={14} />
          {hold !== null ? l({ en: "Run", ar: "تشغيل" }) : l({ en: "Hold", ar: "تثبيت" })}
        </Button>
        <Button size="sm" onClick={exportCsv} disabled={!frame || !chans.some(Boolean)}>
          <Icon name="download" size={14} />
          CSV
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvas}
          className="size-full cursor-crosshair rounded-lg ring-1 ring-rim"
          onPointerMove={(e) => setHover(tAt(e.clientX))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => setCursors((c) => (c.length >= 2 ? [tAt(e.clientX)] : [...c, tAt(e.clientX)]))}
          aria-label={l({ en: "Oscilloscope screen: click to place time cursors", ar: "شاشة الأوسيلوسكوب: اضغط عشان تحط مؤشرات الزمن" })}
        />
        {!running && !frame && (
          <p className="absolute inset-0 grid place-items-center text-sm text-fog">{l({ en: "Start the simulation to capture the board pins.", ar: "شغّل المحاكاة عشان تسجّل بنات البورد." })}</p>
        )}
        {hover !== null && (
          <div className="pointer-events-none absolute top-1 left-1 rounded bg-void/85 px-1.5 py-1 font-mono">
            <div className="text-fog">t = {fmtT(hover - t0)}</div>
            {chans.map((n, i) => {
              const c = ch(i);
              const v = c ? valueAt(c, hover) : null;
              return n && v !== null ? (
                <div key={i} style={{ color: COLORS[i] }}>
                  {n}: {v.toFixed(2)} V
                </div>
              ) : null;
            })}
          </div>
        )}
        {(lost.current ?? 0) > 0 && <p className="absolute right-1 bottom-1 rounded bg-warn/20 px-1.5 text-warn">{l({ en: "Some fast changes weren't recorded (too many per frame).", ar: "شوية تغييرات سريعة متسجّلتش (كتير جدًا في الفريم)." })}</p>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono" data-testid="scope-measure">
        {chans.map((n, i) => {
          const m = meas[i];
          if (!n) return null;
          return (
            <span key={i} style={{ color: COLORS[i] }}>
              {n}: {m ? `${m.freq ? fmtF(m.freq) : "— Hz"} · ${m.duty !== null ? `${(m.duty * 100).toFixed(1)}%` : "—"} · ${m.vmin.toFixed(2)}…${m.vmax.toFixed(2)} V · avg ${m.avg.toFixed(2)} V` : "—"}
            </span>
          );
        })}
        {cursors.length === 2 && (
          <span className="text-frost">
            Δt {fmtT(Math.abs(cursors[1] - cursors[0]))} · 1/Δt {fmtF(1 / Math.max(1e-9, Math.abs(cursors[1] - cursors[0])))}
          </span>
        )}
      </div>
    </div>
  );
}
