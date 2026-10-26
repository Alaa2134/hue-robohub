"use client";
/**
 * Robot Arena: a line-following robot driven by the learner's Arduino sketch. The sketch compiles with
 * the Lab's GCC and runs on the simulated ATmega328P; the robot (motors, gearbox, mass, IR sensors)
 * is its own physical model. The lap test runs one lap as fast as the device can and saves a pass.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CHALLENGE_POINTS } from "../academy/points";
import { academy, meStore } from "../api";
import { CodeEditor } from "../code/editor";
import { compile, onCompilerEvent } from "../compiler/client";
import { explainCompile } from "../compiler/explain";
import type { Diagnostic } from "../compiler/sketch";
import { fmtNum, useLang } from "../i18n";
import { useRoute } from "../router";
import { DEFAULT_ROBOT, type RobotParams, type Track } from "../robot/physics";
import { OFF_TRACK } from "../robot/sim";
import { PINS, STARTER, TRACKS, trackById } from "../robot/tracks";
import type { LiveFrame, RobotIn, RobotOut } from "../robot/worker";
import { Badge, Button, Card, Select, Spinner, cn, toast } from "../ui";

const CODE_KEY = "bx-lab-robot-code";
const LAP_LIMIT = 60;
const BATTERIES: { v: number; en: string; ar: string }[] = [
  { v: 6, en: "4 × AA (6 V)", ar: "٤ بطاريات AA (6 فولت)" },
  { v: 7.4, en: "2 × 18650 Li-ion (7.4 V)", ar: "٢ بطارية 18650 ليثيوم (7.4 فولت)" },
  { v: 9, en: "9 V block", ar: "بطارية 9 فولت" },
];

type Pt = { x: number; y: number };
type LapResult = Extract<RobotOut, { type: "lapResult" }>;

function readCode() {
  try {
    return localStorage.getItem(CODE_KEY) || STARTER;
  } catch {
    return STARTER;
  }
}

/* ─── Drawing ──────────────────────────────────────────────────────────── */

function draw(c: HTMLCanvasElement, track: Track, robot: { x: number; y: number; heading: number; sensors: Record<string, boolean> }, trail: Pt[], ghost: Pt[] | null) {
  const dpr = window.devicePixelRatio || 1;
  const W = c.clientWidth;
  const H = c.clientHeight;
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
  }
  const g = c.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = Math.min(W / track.size.w, H / track.size.h);
  const ox = (W - track.size.w * s) / 2;
  const oy = (H - track.size.h * s) / 2;
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => oy + (track.size.h - y) * s;

  g.fillStyle = "#e9edf3";
  g.fillRect(0, 0, W, H);
  // 10 cm grid
  g.strokeStyle = "rgba(20,40,80,.08)";
  g.lineWidth = 1;
  for (let x = 0; x <= track.size.w + 1e-9; x += 0.1) {
    g.beginPath();
    g.moveTo(X(x), Y(0));
    g.lineTo(X(x), Y(track.size.h));
    g.stroke();
  }
  for (let y = 0; y <= track.size.h + 1e-9; y += 0.1) {
    g.beginPath();
    g.moveTo(X(0), Y(y));
    g.lineTo(X(track.size.w), Y(y));
    g.stroke();
  }
  // the tape
  g.strokeStyle = "#111";
  g.lineWidth = Math.max(1.5, track.width * s);
  g.lineJoin = "round";
  g.beginPath();
  track.points.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y))));
  if (track.closed) g.closePath();
  g.stroke();
  // start mark, across the line
  const n = { x: -Math.sin(track.heading), y: Math.cos(track.heading) };
  g.strokeStyle = "#16a34a";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(X(track.start.x - n.x * 0.04), Y(track.start.y - n.y * 0.04));
  g.lineTo(X(track.start.x + n.x * 0.04), Y(track.start.y + n.y * 0.04));
  g.stroke();

  const path = (pts: Pt[], color: string, dash: number[]) => {
    if (pts.length < 2) return;
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.setLineDash(dash);
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y))));
    g.stroke();
    g.setLineDash([]);
  };
  if (ghost) path(ghost, "rgba(234,88,12,.85)", [6, 4]);
  path(trail, "rgba(37,99,235,.7)", []);

  // the robot (metres in its own frame: x ahead, y left)
  g.save();
  g.translate(X(robot.x), Y(robot.y));
  g.rotate(-robot.heading);
  g.scale(s, s);
  g.fillStyle = "rgba(15,40,90,.9)";
  g.beginPath();
  g.roundRect(-0.05, -0.055, 0.14, 0.11, 0.012);
  g.fill();
  const half = DEFAULT_ROBOT.track / 2;
  const r = DEFAULT_ROBOT.wheelRadius;
  g.fillStyle = "#1f2937";
  for (const side of [half, -half]) {
    g.beginPath();
    g.roundRect(-r, side - 0.013, 2 * r, 0.026, 0.006);
    g.fill();
  }
  g.fillStyle = "#94a3b8";
  g.beginPath();
  g.arc(-0.04, 0, 0.009, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#334155";
  g.fillRect(0.06, -0.035, 0.03, 0.07);
  for (const sn of DEFAULT_ROBOT.sensors) {
    g.fillStyle = robot.sensors[sn.name] ? "#ef4444" : "#64748b";
    g.beginPath();
    g.arc(sn.ahead, sn.side, 0.0065, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/* ─── Page ─────────────────────────────────────────────────────────────── */

export function RobotPage() {
  const { l, lang } = useLang();
  const me = meStore.use();
  const [code, setCode] = useState(readCode);
  const { query } = useRoute();
  const [trackId, setTrackId] = useState(() => trackById(query.get("track") ?? "").id);
  const [battery, setBattery] = useState(DEFAULT_ROBOT.vBattery);
  const [speed, setSpeed] = useState(1);
  const [diags, setDiags] = useState<Diagnostic[]>([]);
  const [busy, setBusy] = useState<null | "compile" | "lap">(null);
  const [loaded, setLoaded] = useState<number | null>(null);
  const [state, setState] = useState<"idle" | "running" | "paused">("idle");
  const [frame, setFrame] = useState<LiveFrame | null>(null);
  const [serial, setSerial] = useState("");
  const [lap, setLap] = useState<{ t: number; progress: number } | null>(null);
  const [result, setResult] = useState<LapResult | null>(null);
  const [passed, setPassed] = useState<Record<string, string>>({});
  const canvas = useRef<HTMLCanvasElement>(null);
  const worker = useRef<Worker | null>(null);
  const trail = useRef<Pt[]>([]);
  const live = useRef<LiveFrame | null>(null);
  const track = trackById(trackId);
  const params: Partial<RobotParams> = { vBattery: battery };

  useEffect(() => {
    try {
      localStorage.setItem(CODE_KEY, code);
    } catch {
      /* kept in memory only */
    }
  }, [code]);
  useEffect(() => onCompilerEvent((e) => setLoaded(e.type === "progress" ? e.loaded : null)), []);
  useEffect(() => {
    void academy.passed().then(setPassed);
  }, [me]);

  const send = useCallback((m: RobotIn) => worker.current?.postMessage(m), []);
  const getWorker = useCallback(() => {
    if (worker.current) return worker.current;
    const w = new Worker(new URL("../robot/worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<RobotOut>) => {
      const m = e.data;
      if (m.type === "frame") {
        live.current = m.frame;
        const tr = trail.current;
        const lastPt = tr[tr.length - 1];
        if (!lastPt || Math.hypot(lastPt.x - m.frame.x, lastPt.y - m.frame.y) > 0.004) {
          tr.push({ x: m.frame.x, y: m.frame.y });
          if (tr.length > 4000) tr.splice(0, 1000);
        }
        setFrame(m.frame);
        if (m.serial !== undefined) setSerial(m.serial);
      } else if (m.type === "lapProgress") setLap({ t: m.t, progress: m.progress });
      else if (m.type === "lapResult") {
        setBusy(null);
        setLap(null);
        setResult(m);
      } else if (m.type === "error") {
        setBusy(null);
        setState("idle");
        toast(m.message, "danger");
      }
    };
    w.onerror = () => {
      setBusy(null);
      setState("idle");
      worker.current = null;
      toast(l({ en: "The robot simulator stopped unexpectedly", ar: "محاكي الروبوت وقف فجأة" }), "danger");
    };
    worker.current = w;
    return w;
  }, [l]);
  useEffect(() => () => worker.current?.terminate(), []);

  // Draw at the screen's rate from the latest frame.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const c = canvas.current;
      if (c) {
        const f = live.current;
        draw(c, track, f ?? { x: track.start.x, y: track.start.y, heading: track.heading, sensors: {} }, trail.current, result?.trail ?? null);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [track, result]);

  const reset = useCallback(() => {
    send({ type: "stop" });
    live.current = null;
    trail.current = [];
    setFrame(null);
    setSerial("");
    setState("idle");
  }, [send]);

  async function build(): Promise<string | null> {
    setBusy("compile");
    try {
      const r = await compile([{ name: "sketch.ino", text: code }], "sketch.ino");
      setDiags(r.diagnostics);
      if (!r.ok || !r.hex) {
        toast(l({ en: "The sketch didn't compile — see the messages below", ar: "الكود معملش كومبايل — شوف الرسايل تحت" }), "danger");
        return null;
      }
      return r.hex;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "danger");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    const hex = await build();
    if (!hex) return;
    reset();
    setResult(null);
    getWorker();
    send({ type: "speed", value: speed });
    send({ type: "start", hex, track: track.id, params });
    setState("running");
  }

  async function lapTest() {
    const hex = await build();
    if (!hex) return;
    reset();
    setResult(null);
    setBusy("lap");
    setLap({ t: 0, progress: 0 });
    getWorker();
    send({ type: "lap", hex, track: track.id, params, limit: LAP_LIMIT });
  }

  const slug = `robot-${track.id}`;
  const checks = result
    ? [
        { label: { en: "Finished a full lap", ar: "كمّل لفة كاملة" }, ok: result.progress >= 1, got: `${fmtNum(Math.min(1, Math.max(0, result.progress)) * 100)}%` },
        { label: { en: "Never off the line for more than 0.5 s", ar: "مخرجش من الخط أكتر من نص ثانية" }, ok: result.longestOff <= 0.5, got: `${fmtNum(result.longestOff, 2)} s` },
        { label: { en: `Within ${LAP_LIMIT} s`, ar: `في أقل من ${LAP_LIMIT} ثانية` }, ok: result.lapTime !== null, got: result.lapTime !== null ? `${fmtNum(result.lapTime, 1)} s` : "—" },
      ]
    : [];

  // Save a pass once (signed-in students only).
  const saved = useRef<string>("");
  useEffect(() => {
    if (!result?.passed || me?.kind !== "student") return;
    const key = `${slug}:${result.lapTime}`;
    if (saved.current === key) return;
    saved.current = key;
    academy.pass(slug, null, checks, result.lapTime ?? 0).then(
      (r) => {
        if (r.ok) {
          setPassed((p) => ({ ...p, [slug]: new Date().toISOString() }));
          toast(l({ en: "Lap challenge passed and saved", ar: "عدّيت تحدي اللفة واتحفظ" }));
        }
      },
      () => toast(l({ en: "Passed, but couldn't save it — try again", ar: "عدّيت، بس معرفتش أحفظها — جرّب تاني" }), "danger"),
    );
    // checks derive from result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, me, slug]);

  const f = frame;
  const errs = diags.filter((d) => d.severity !== "note");
  const wheel = (v: number) => (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-panel" dir="ltr">
      <div className={cn("absolute inset-y-0", v >= 0 ? "left-1/2 bg-volt" : "right-1/2 bg-warn")} style={{ width: `${Math.min(50, Math.abs(v) * 50)}%` }} />
    </div>
  );

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <h1 className="font-display text-2xl font-bold">{l({ en: "Robot Arena", ar: "حلبة الروبوت" })}</h1>
        <p className="max-w-3xl text-sm text-fog">
          {l({
            en: "Program a line-following robot in Arduino C++. Your sketch compiles with GCC and runs on a simulated ATmega328P; the robot itself is a physical model — geared DC motors with back-EMF and gearbox friction, mass and inertia, a real battery and driver drop, and three IR sensors reading the floor.",
            ar: "برمج روبوت بيمشي على الخط بلغة أردوينو. الكود بيتعمله كومبايل بـ GCC وبيشتغل على معالج ATmega328P متمثّل، والروبوت نفسه نموذج فيزيائي: موتورات DC بجيربوكس فيها back-EMF واحتكاك، كتلة وقصور ذاتي، بطارية حقيقية وفقد في الدرايفر، و٣ حساسات IR بتقرا الأرض.",
          })}
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs text-fog">
              {l({ en: "Track", ar: "التراك" })}
              <Select value={trackId} onChange={(e) => (reset(), setResult(null), setTrackId(e.target.value))} data-testid="robot-track">
                {TRACKS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {l(t.name)} (+{CHALLENGE_POINTS[`robot-${t.id}`] ?? 0})
                    {passed[`robot-${t.id}`] ? " ✓" : ""}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-xs text-fog">
              {l({ en: "Battery", ar: "البطارية" })}
              <Select value={battery} onChange={(e) => setBattery(Number(e.target.value))} disabled={state !== "idle"}>
                {BATTERIES.map((b) => (
                  <option key={b.v} value={b.v}>
                    {l(b)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-xs text-fog">
              {l({ en: "Speed", ar: "السرعة" })}
              <Select
                value={speed}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSpeed(v);
                  send({ type: "speed", value: v });
                }}
              >
                {[0.25, 0.5, 1, 2].map((v) => (
                  <option key={v} value={v}>
                    {v}×
                  </option>
                ))}
              </Select>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon="play" onClick={() => void run()} disabled={!!busy} data-testid="robot-run">
                {l({ en: "Run", ar: "شغّل" })}
              </Button>
              {state !== "idle" && (
                <Button
                  icon={state === "running" ? "pause" : "play"}
                  onClick={() => {
                    send({ type: state === "running" ? "pause" : "resume" });
                    setState(state === "running" ? "paused" : "running");
                  }}
                >
                  {state === "running" ? l({ en: "Pause", ar: "إيقاف مؤقت" }) : l({ en: "Resume", ar: "كمّل" })}
                </Button>
              )}
              <Button icon="reset" onClick={reset} disabled={state === "idle" && !f}>
                {l({ en: "Reset", ar: "من الأول" })}
              </Button>
              <Button icon="trophy" onClick={() => void lapTest()} disabled={!!busy} data-testid="robot-lap">
                {l({ en: "Lap test", ar: "اختبار اللفة" })}
              </Button>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-[var(--line)]" style={{ aspectRatio: `${track.size.w} / ${track.size.h}` }}>
            <canvas ref={canvas} className="absolute inset-0 size-full" aria-label={l({ en: "Top view of the robot on the track", ar: "منظر من فوق للروبوت على التراك" })} data-testid="robot-canvas" />
            {busy && (
              <div className="absolute inset-0 grid place-items-center bg-void/40 text-sm text-white">
                <span className="flex items-center gap-2 rounded-lg bg-void/80 px-3 py-2">
                  <Spinner />
                  {busy === "compile"
                    ? loaded !== null
                      ? l({ en: `Downloading the compiler… ${fmtNum(loaded / 1e6, 1)} MB`, ar: `بنزّل الكومبايلر… ${fmtNum(loaded / 1e6, 1)} ميجا` })
                      : l({ en: "Compiling…", ar: "بيعمل كومبايل…" })
                    : l({ en: `Lap test… ${fmtNum(lap?.t ?? 0, 0)} s simulated, ${fmtNum(Math.max(0, (lap?.progress ?? 0) * 100))}%`, ar: `اختبار اللفة… ${fmtNum(lap?.t ?? 0, 0)} ثانية محاكاة، ${fmtNum(Math.max(0, (lap?.progress ?? 0) * 100))}%` })}
                </span>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2" data-testid="robot-stats">
            <Card className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-fog">{l({ en: "Time", ar: "الوقت" })}</span>
                <span dir="ltr">{fmtNum(f?.t ?? 0, 1)} s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fog">{l({ en: "Speed", ar: "السرعة" })}</span>
                <span dir="ltr">{fmtNum(Math.abs(f?.v ?? 0), 2)} m/s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fog">{l({ en: "Laps", ar: "اللفات" })}</span>
                <span dir="ltr" data-testid="robot-laps">
                  {fmtNum(f?.laps ?? 0)} · {fmtNum(Math.max(0, ((f?.progress ?? 0) % 1) * 100))}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-fog">{l({ en: "Off the line", ar: "برّه الخط" })}</span>
                <span dir="ltr" className={cn(f?.off && "text-danger")}>
                  {fmtNum(f?.offSeconds ?? 0, 1)} s
                </span>
              </div>
            </Card>
            <Card className="grid gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-fog">{l({ en: "Sensors", ar: "الحساسات" })}</span>
                <span className="flex gap-2" dir="ltr">
                  {(["L", "C", "R"] as const).map((k) => (
                    <span key={k} className="flex items-center gap-1 text-xs" data-testid={`robot-sensor-${k}`} data-on={f?.sensors[k] ? "1" : "0"}>
                      <span className={cn("size-3 rounded-full", f?.sensors[k] ? "bg-danger shadow-[0_0_8px_rgb(239_68_68)]" : "bg-panel-2 ring-1 ring-rim")} />
                      {k} D{PINS.sensors[k]}
                    </span>
                  ))}
                </span>
              </div>
              <div className="grid gap-1">
                <span className="text-xs text-fog">{l({ en: "Left motor (D5, D7, D8)", ar: "الموتور الشمال (D5، D7، D8)" })}</span>
                {wheel(f?.left ?? 0)}
              </div>
              <div className="grid gap-1">
                <span className="text-xs text-fog">{l({ en: "Right motor (D6, D9, D10)", ar: "الموتور اليمين (D6، D9، D10)" })}</span>
                {wheel(f?.right ?? 0)}
              </div>
            </Card>
          </div>

          {result && (
            <Card className="grid gap-2" data-testid="robot-result">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{l({ en: `Lap test — ${l(track.name)}`, ar: `اختبار اللفة — ${l(track.name)}` })}</p>
                <Badge tone={result.passed ? "ok" : "danger"}>{result.passed ? l({ en: "Passed", ar: "عدّيت" }) : l({ en: "Not yet", ar: "لسه" })}</Badge>
              </div>
              <ul className="grid gap-1 text-sm">
                {checks.map((c) => (
                  <li key={c.label.en} className="flex items-center justify-between gap-2">
                    <span className={c.ok ? "text-ok" : "text-danger"}>
                      {c.ok ? "✓" : "✗"} {l(c.label)}
                    </span>
                    <span className="text-fog" dir="ltr">
                      {c.got}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-fog">
                {l({
                  en: `The orange dashed line is the path from the test. “Off the line” means more than ${OFF_TRACK * 100} cm from the tape's centre.`,
                  ar: `الخط البرتقالي المتقطع هو المسار في الاختبار. «برّه الخط» يعني أبعد من ${OFF_TRACK * 100} سم من نص الشريط.`,
                })}
                {result.passed && me?.kind !== "student" ? ` ${l({ en: "Sign in with your student code to save passes.", ar: "سجّل دخول بكود الطالب عشان النجاح يتحفظ." })}` : ""}
              </p>
            </Card>
          )}
        </div>

        <div className="grid content-start gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">sketch.ino</p>
            <Button
              size="sm"
              variant="ghost"
              icon="undo"
              onClick={() => {
                if (code === STARTER || confirm(l({ en: "Replace your code with the starter sketch?", ar: "تستبدل الكود بتاعك بكود البداية؟" }))) setCode(STARTER);
              }}
            >
              {l({ en: "Starter code", ar: "كود البداية" })}
            </Button>
          </div>
          <div className="h-[30rem] overflow-hidden rounded-2xl border border-[var(--line)]" dir="ltr" data-testid="robot-code">
            <CodeEditor value={code} onChange={setCode} diagnostics={diags} fileName="sketch.ino" />
          </div>
          {errs.length > 0 && (
            <Card className="grid max-h-64 gap-2 overflow-y-auto text-sm" data-testid="robot-diagnostics">
              {errs.map((d, i) => {
                const ex = explainCompile(d.message);
                return (
                  <div key={i} className="grid gap-0.5">
                    <p dir="ltr" className={cn("font-mono text-xs", d.severity === "error" ? "text-danger" : "text-warn")}>
                      {d.line ? `${d.line}:${d.col} ` : ""}
                      {d.message}
                    </p>
                    {ex && (
                      <p className="text-xs text-mist">
                        {l(ex.why)} <span className="text-frost">{l(ex.fix)}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </Card>
          )}
          <Card className="grid gap-1">
            <p className="text-xs text-fog">{l({ en: "Serial monitor (9600)", ar: "السيريال مونيتور (9600)" })}</p>
            <pre dir="ltr" className="max-h-40 min-h-16 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-mist" data-testid="robot-serial">
              {serial.slice(-2000) || "—"}
            </pre>
          </Card>
          <Card className="grid gap-1 text-xs text-fog">
            <p className="font-semibold text-mist">{l({ en: "The robot's wiring", ar: "توصيلات الروبوت" })}</p>
            <p dir={lang === "ar" ? "rtl" : "ltr"}>
              {l({
                en: "L298N driver: left motor ENA = D5 (PWM), IN1 = D7, IN2 = D8; right motor ENB = D6 (PWM), IN3 = D9, IN4 = D10. IN1 HIGH + IN2 LOW turns a wheel forward; both HIGH brakes, both LOW coasts. IR sensors (TCRT5000): left D2, centre D3, right D4 — HIGH over the black line.",
                ar: "درايفر L298N: الموتور الشمال ENA = D5 (PWM)، IN1 = D7، IN2 = D8؛ الموتور اليمين ENB = D6 (PWM)، IN3 = D9، IN4 = D10. IN1 HIGH و IN2 LOW العجلة تمشي لقدّام؛ الاتنين HIGH فرامل، الاتنين LOW بتسيب. حساسات IR (TCRT5000): الشمال D2، النص D3، اليمين D4 — HIGH فوق الخط الأسود.",
              })}
            </p>
            <p>
              {l({
                en: "Motors: TT gear motors, 200 rpm and 0.078 N·m at 6 V, 66 mm wheels 13 cm apart, 0.55 kg. Below about PWM 25–35 (lower with a stronger battery) the gearbox friction holds the wheel still — like the real thing.",
                ar: "الموتورات: TT بجيربوكس، 200 لفة/دقيقة و 0.078 نيوتن·متر على 6 فولت، عجل 66 مم والمسافة بينهم 13 سم، والوزن 0.55 كجم. تحت حوالي PWM 25–35 (أقل مع بطارية أقوى) احتكاك الجيربوكس بيمسك العجلة — زي الحقيقة.",
              })}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
