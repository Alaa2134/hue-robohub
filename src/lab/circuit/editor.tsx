"use client";
/**
 * The circuit and code editor: canvas + parts library + inspector + Arduino code + serial monitor +
 * diagnostics, with real compilation (GCC in a worker) and simulation (AVR + circuit solver in a
 * worker). `layout="code"` is the Code Studio: the code takes the stage and the board sits beside it.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { labEvent, meStore, projects, type Project, type Visibility } from "../api";
import { compile, onCompilerEvent } from "../compiler/client";
import type { BuildResult } from "../compiler/build";
import { FILE_NAME, type Diagnostic } from "../compiler/sketch";
import { CodeEditor, gotoLine } from "../code/editor";
import { CODE, CODE_EXAMPLES } from "../examples";
import { fmtDate, useLang } from "../i18n";
import { href, navigate } from "../router";
import { checkCircuit } from "../sim/diagnostics";
import { useSimulation } from "../sim/use-sim";
import { useProject } from "../use-project";
import { Badge, Button, Icon, IconButton, Input, Modal, Select, Spinner, cn, toast } from "../ui";
import { Canvas, DEFAULT_WIRE, fitView, type CanvasActions, type View } from "./canvas";
import { DocStore, isClipboard, snap, useDoc, type Clipboard } from "./doc-store";
import { GRID, validDoc, emptyDoc, type CircuitDoc } from "./model";
import { Diagnostics, Inspector, Library, PartSheet, SerialMonitor } from "./panels";
import { Oscilloscope, PinMonitor } from "./instruments";
import { PART_BY_TYPE } from "./parts";
import { CircuitThumb } from "./render";
import { ChallengeBar } from "../academy/challenge-bar";
import { bom, bomCsv, guideHtml, wiring } from "./bom";
import { AssignmentBar } from "../academy/assignment-bar";

/** The 3D view (three.js) loads only when it's opened. */
const Circuit3D = lazy(() => import("./view3d/scene"));

type Side = "code" | "inspector";
type Bottom = "serial" | "diagnostics" | "pins" | "scope";
type MobileTab = "circuit" | "code" | "serial" | "parts";

const filesKey = (d: CircuitDoc) => JSON.stringify([d.main, d.files]);

export function CircuitEditor({ id, share, layout = "circuit" }: { id: string; share: string | null; layout?: "circuit" | "code" }) {
  const { t, l, lang } = useLang();
  const store = useMemo(() => new DocStore(emptyDoc()), []);
  const { doc, v, canUndo, canRedo, sel } = useDoc(store);
  const [view, setView] = useState<View>({ x: -60, y: -300, zoom: 1 });
  const stage = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const codeBox = useRef<HTMLDivElement>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const [wireColor, setWireColor] = useState(DEFAULT_WIRE);
  const [side, setSide] = useState<Side>(layout === "code" ? "code" : "code");
  const [bottom, setBottom] = useState<Bottom>("serial");
  const [bottomOpen, setBottomOpen] = useState(true);
  const [mobile, setMobile] = useState<MobileTab>(layout === "code" ? "code" : "circuit");
  const [file, setFile] = useState("sketch.ino");
  const [build, setBuild] = useState<(BuildResult & { key: string }) | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [toolchainBytes, setToolchainBytes] = useState<number | null>(null);
  const [dialog, setDialog] = useState<null | "share" | "versions" | "export" | "newfile" | "rename">(null);
  const [fontSize, setFontSize] = useState(() => {
    try {
      return Math.min(22, Math.max(10, Number(localStorage.getItem("bx-lab-code-font")) || 13));
    } catch {
      return 13;
    }
  });
  const zoomCode = (d: number) =>
    setFontSize((f) => {
      const n = Math.min(22, Math.max(10, f + d));
      try {
        localStorage.setItem("bx-lab-code-font", String(n));
      } catch {
        // Private mode: the size just isn't remembered.
      }
      return n;
    });
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [view3d, setView3d] = useState(false);
  const [sheet, setSheet] = useState<{ type: string; mode: "pinout" | "docs" } | null>(null);
  const [labelFor, setLabelFor] = useState<{ kind: "part" | "wire"; id: string; text: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState(0);
  const [inspectSheet, setInspectSheet] = useState(false);
  /** The last copy, used when the system clipboard can't be read (and to step repeated pastes). */
  const clip = useRef<{ data: Clipboard; pastes: number } | null>(null);

  const sim = useSimulation((seconds) => labEvent("sim_run", id, { seconds: Math.round(seconds * 10) / 10 }));
  const running = sim.status !== "idle";

  const proj = useProject<CircuitDoc>(id, share, {
    version: v,
    getData: () => store.current,
    getThumb: () => {
      const svg = thumb.current?.querySelector("svg");
      if (!svg) return undefined;
      const s = new XMLSerializer().serializeToString(svg);
      return s.length < 280_000 ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(s)))}` : undefined;
    },
    onLoad: (data) => {
      const d = validDoc(data) ? data : emptyDoc();
      if (!d.files.length) d.files = emptyDoc().files;
      store.reset(d);
      setFile(d.main || d.files[0].name);
      const r = stage.current?.getBoundingClientRect();
      setView(d.view ?? fitView(d, r?.width || 900, r?.height || 600));
    },
  });
  const readOnly = !proj.canEdit;

  useEffect(() => onCompilerEvent((e) => setToolchainBytes(e.type === "progress" ? e.loaded : null)), []);

  // Fit once the stage has its real size.
  useEffect(() => {
    const el = stage.current;
    if (!el || !proj.project) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && !store.current.view) setView(fitView(store.current, r.width, r.height));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proj.project?.id]);

  const fileObj = doc.files.find((f) => f.name === file) ?? doc.files[0];
  const stale = !build || build.key !== filesKey(doc);
  const hasBoard = doc.parts.some((p) => p.type === "arduino-uno" || p.type === "arduino-nano");
  const staticDiag = useMemo(() => checkCircuit(doc, undefined, !!build?.ok && !stale), [doc, build, stale]);
  const simDiag = sim.frame?.diagnostics ?? staticDiag;

  const doCompile = useCallback(async () => {
    setCompiling(true);
    const key = filesKey(store.current);
    try {
      const r = await compile(store.current.files, store.current.main);
      setBuild({ ...r, key });
      labEvent(r.ok ? "compile_ok" : "compile_error", id, { ms: r.ms, flash: r.sizes?.flash ?? null, errors: r.diagnostics.filter((d) => d.severity === "error").length });
      if (!r.ok) {
        setBottom("diagnostics");
        setBottomOpen(true);
        if (layout === "circuit") setSide("code");
      }
      return r;
    } catch (e) {
      toast(`${t("compileFailed")}: ${(e as Error).message}`, "danger");
      return null;
    } finally {
      setCompiling(false);
    }
  }, [store, id, layout, t]);

  const startSim = useCallback(async () => {
    let hex: string | null = null;
    if (hasBoard) {
      const r = stale ? await doCompile() : build;
      if (!r?.ok) return;
      hex = r.hex ?? null;
    }
    store.select({ parts: [], wires: [] });
    setPlacing(null);
    sim.start(store.current, hex);
    // Leave an open instrument where it is; otherwise show the serial output.
    setBottom((b) => (b === "diagnostics" ? "serial" : b));
  }, [hasBoard, stale, doCompile, build, sim, store]);

  const save = useCallback(async () => {
    if (readOnly) return;
    const ok = await proj.save();
    if (ok) toast(t("saved"));
  }, [proj, readOnly, t]);

  /** Copy to the system clipboard as JSON (so it can go to another tab or project) and keep a local copy. */
  const copySel = useCallback(() => {
    const data = store.copy();
    if (!data) return;
    clip.current = { data, pastes: 0 };
    navigator.clipboard?.writeText(JSON.stringify(data)).catch(() => {});
  }, [store]);

  /** Paste parts copied here or in another tab: at a canvas point, or stepped from the original. */
  const pasteClip = useCallback(
    async (at?: { x: number; y: number }) => {
      let data = clip.current?.data;
      try {
        const text = await navigator.clipboard?.readText();
        const parsed: unknown = text ? JSON.parse(text) : null;
        if (isClipboard(parsed)) {
          if (!clip.current || JSON.stringify(clip.current.data) !== text) clip.current = { data: parsed, pastes: 0 };
          data = parsed;
        }
      } catch {
        // No permission or not our data: use the local copy.
      }
      if (!data || !clip.current) return;
      if (at) {
        const x0 = Math.min(...data.parts.map((p) => p.x));
        const y0 = Math.min(...data.parts.map((p) => p.y));
        store.paste(data, snap(at.x - x0), snap(at.y - y0));
      } else {
        clip.current.pastes += 1;
        store.paste(data, 2 * GRID * clip.current.pastes);
      }
    },
    [store],
  );

  /** Deleting several parts at once asks first (one part or wire is a quick undo away). */
  const askDelete = useCallback(() => {
    const n = store.selection.parts.filter((id) => !store.current.parts.find((p) => p.id === id)?.locked).length;
    if (n >= 3) setConfirmDel(n);
    else store.deleteSelection();
  }, [store]);

  // Keyboard shortcuts (not while typing in a field or the code editor, except Ctrl+S).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || !!(e.target as HTMLElement)?.closest?.(".cm-editor");
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
        return;
      }
      if (mod && e.key === "Enter") {
        e.preventDefault();
        void startSim();
        return;
      }
      if (typing || running || readOnly) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        store.redo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        store.duplicate();
      } else if (mod && e.key.toLowerCase() === "c") {
        if (!store.selection.parts.length) return;
        e.preventDefault();
        copySel();
      } else if (mod && e.key.toLowerCase() === "x") {
        if (!store.selection.parts.length) return;
        e.preventDefault();
        copySel();
        store.deleteSelection();
      } else if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        void pasteClip();
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        store.selectAll();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        askDelete();
      } else if (e.key.toLowerCase() === "r" && !mod) store.rotate(store.selection.parts, e.shiftKey);
      else if (e.key.startsWith("Arrow") && store.selection.parts.length) {
        e.preventDefault();
        const d = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key] ?? [0, 0];
        store.moveParts(store.selection.parts, d[0], d[1], "nudge");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, save, startSim, running, readOnly, copySel, pasteClip, askDelete]);

  const setCode = (text: string) => store.setFiles(store.current.files.map((f) => (f.name === fileObj.name ? { ...f, text } : f)), `code:${fileObj.name}`);
  const gotoDiag = (f: string, line: number) => {
    if (doc.files.some((x) => x.name === f)) setFile(f);
    setSide("code");
    setMobile("code");
    setTimeout(() => gotoLine(codeBox.current, line), 50);
  };

  /** A finding was clicked: select what it's about and bring it into view. */
  const selectFinding = ({ part, wire }: { part?: string; wire?: string }) => {
    store.select({ parts: part ? [part] : [], wires: wire ? [wire] : [] });
    setView3d(false);
    setMobile("circuit");
    const r = stage.current?.getBoundingClientRect();
    const p = part ? doc.parts.find((x) => x.id === part) : undefined;
    const w = wire ? doc.wires.find((x) => x.id === wire) : undefined;
    const at = p ? { x: p.x, y: p.y } : w?.pts[0] ? { x: w.pts[0][0], y: w.pts[0][1] } : null;
    if (r && at) setView({ ...view, x: at.x - r.width / 2 / view.zoom, y: at.y - r.height / 2 / view.zoom });
  };
  const fit = () => {
    const r = stage.current?.getBoundingClientRect();
    if (r) setView(fitView(doc, r.width, r.height));
  };
  const zoom = (f: number) => {
    const r = stage.current?.getBoundingClientRect();
    if (!r) return;
    const z = Math.min(6, Math.max(0.15, view.zoom * f));
    const cx = view.x + r.width / 2 / view.zoom;
    const cy = view.y + r.height / 2 / view.zoom;
    setView({ zoom: z, x: cx - r.width / 2 / z, y: cy - r.height / 2 / z });
  };

  const clone = async () => {
    try {
      const nid = await projects.clone(id, share);
      navigate(`${layout === "code" ? "code" : "circuits"}/${nid}`);
    } catch {
      toast(t("error"), "danger");
    }
  };

  if (proj.error)
    return (
      <div className="grid min-h-[60vh] place-items-center p-6 text-center">
        <div className="grid gap-3">
          <p>{proj.error === "not_found" ? t("notFound") : t("error")}</p>
          <div className="flex justify-center gap-2">
            {proj.error === "network" && <Button onClick={() => void proj.reload()}>{t("retry")}</Button>}
            <Button variant="ghost" onClick={() => navigate("projects")}>
              {t("navProjects")}
            </Button>
          </div>
        </div>
      </div>
    );
  if (!proj.project)
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner size={28} />
      </div>
    );
  const p = proj.project;
  const challenge = p.tags?.find((x) => x.startsWith("challenge:"))?.slice(10) ?? null;
  const assignment = p.tags?.find((x) => x.startsWith("assignment:"))?.slice(11) ?? null;

  const statusText =
    proj.state === "saving" ? t("saving") : proj.state === "dirty" ? t("unsaved") : proj.state === "readonly" ? t("readOnly") : proj.state === "conflict" ? t("conflict") : proj.state === "error" ? t("error") : `${p.local ? t("savedLocal") : t("saved")}${proj.savedAt ? ` · ${proj.savedAt.toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}`;

  const readings = sim.frame?.parts ?? {};
  const boardId = doc.parts.find((x) => x.type === "arduino-uno" || x.type === "arduino-nano")?.id;
  const boardVolts = (part: string, pin: string) => (part === boardId && sim.frame ? readings[part]?.[`now_v${pin}`] : undefined);

  const actions: CanvasActions = {
    inspect: (pid) => {
      store.select({ parts: [pid], wires: [] });
      setSide("inspector");
      // Phones have no side panel next to the canvas: show the inspector over it.
      if (layout === "circuit" && window.matchMedia("(max-width: 1023px)").matches) setInspectSheet(true);
    },
    pinout: (type) => setSheet({ type, mode: "pinout" }),
    docs: (type) => setSheet({ type, mode: "docs" }),
    label: ({ kind, id: tid }) => {
      const cur = kind === "part" ? doc.parts.find((x) => x.id === tid)?.label : doc.wires.find((w) => w.id === tid)?.label;
      setLabelFor({ kind, id: tid, text: cur ?? "" });
    },
    copy: copySel,
    paste: (at) => void pasteClip(at),
    fit,
    confirmDelete: askDelete,
  };
  const saveLabel = () => {
    if (!labelFor) return;
    const text = labelFor.text.trim().slice(0, 40) || undefined;
    if (labelFor.kind === "part") store.setPart(labelFor.id, { label: text });
    else store.setWire(labelFor.id, { label: text });
    setLabelFor(null);
  };

  const canvas = (
    <div ref={stage} className="relative min-h-0 flex-1 overflow-hidden" dir="ltr">
      {view3d && (
        <div className="absolute inset-0 z-10">
          <Suspense
            fallback={
              <div className="grid size-full place-items-center bg-[#0a1430]">
                <Spinner size={28} />
              </div>
            }
          >
            <Circuit3D doc={doc} readings={readings} live={sim.live} running={running} onLive={sim.setLive} />
          </Suspense>
        </div>
      )}
      <Canvas
        store={store}
        view={view}
        setView={setView}
        running={running}
        readings={readings}
        live={sim.live}
        onLive={sim.setLive}
        placing={placing}
        setPlacing={setPlacing}
        wireColor={wireColor}
        readOnly={readOnly}
        boardPinVolts={boardVolts}
        actions={actions}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-2 p-2">
        <div className="pointer-events-auto flex gap-1 rounded-xl bg-deep/90 p-1 ring-1 ring-rim backdrop-blur">
          <div className="flex rounded-lg bg-abyss p-0.5 ring-1 ring-rim" role="radiogroup" aria-label="2D / 3D">
            {([false, true] as const).map((v) => (
              <button key={String(v)} type="button" role="radio" aria-checked={view3d === v} onClick={() => setView3d(v)} data-testid={v ? "view-3d" : "view-2d"} className={cn("rounded-md px-2.5 py-1 font-mono text-xs font-semibold", view3d === v ? "bg-volt text-white" : "text-mist hover:text-frost")}>
                {v ? "3D" : "2D"}
              </button>
            ))}
          </div>
          {!view3d && (
            <>
              <IconButton icon="zoomIn" label={t("zoomIn")} onClick={() => zoom(1.25)} />
              <IconButton icon="zoomOut" label={t("zoomOut")} onClick={() => zoom(0.8)} />
              <IconButton icon="fit" label={t("fit")} onClick={fit} />
            </>
          )}
        </div>
        {!readOnly && !running && !view3d && (
          <div className="pointer-events-auto flex items-center gap-1 rounded-xl bg-deep/90 p-1.5 ring-1 ring-rim backdrop-blur" role="radiogroup" aria-label={t("wireColor")}>
            {["#e5484d", "#2b2b2b", "#3e63dd", "#30a46c", "#f5d90a", "#f76b15", "#ffffff"].map((c) => (
              <button key={c} type="button" role="radio" aria-checked={wireColor === c} aria-label={c} onClick={() => setWireColor(c)} className={cn("size-5 rounded-full ring-2", wireColor === c ? "ring-cyan" : "ring-transparent")} style={{ background: c }} />
            ))}
          </div>
        )}
        {sim.frame && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-deep/90 px-3 py-1.5 font-mono text-xs ring-1 ring-rim backdrop-blur" data-testid="sim-clock">
            <span title="ATmega328P · 16 MHz">
              {t("simTimeLabel")} {sim.frame.t.toFixed(2)} s · {t("speed")} {Math.round(Math.min(sim.frame.speed, 9.99) * 100)}%
            </span>
            <select aria-label={l({ en: "Simulation speed", ar: "سرعة المحاكاة" })} className="rounded bg-abyss px-1 py-0.5 ring-1 ring-rim" value={sim.speed} onChange={(e) => sim.setSpeed(Number(e.target.value))} data-testid="sim-speed">
              {[0.1, 0.25, 0.5, 1, 2, 4].map((x) => (
                <option key={x} value={x}>
                  ×{x}
                </option>
              ))}
            </select>
            {simDiag.some((d) => d.level === "error") && <span className="text-danger">● {simDiag.filter((d) => d.level === "error").length}</span>}
          </div>
        )}
      </div>
      {running && <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-fog">{t("pressHint")}</p>}
      {sim.crash && <p className="absolute inset-x-4 bottom-10 rounded-lg bg-danger/20 p-2 text-center text-sm text-[#ffd0d5] ring-1 ring-danger/50">{sim.crash}</p>}
    </div>
  );

  const codePanel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--line)] px-2 py-1.5" dir="ltr">
        {doc.files.map((f) => (
          <button key={f.name} type="button" onClick={() => setFile(f.name)} className={cn("rounded-md px-2.5 py-1 font-mono text-xs", f.name === fileObj.name ? "bg-panel-2 text-frost" : "text-fog hover:text-frost")}>
            {f.name}
          </button>
        ))}
        {!readOnly && <IconButton icon="plus" label={t("newFile")} onClick={() => setDialog("newfile")} className="size-7" />}
        {!readOnly && fileObj.name !== doc.main && <IconButton icon="file" label={l({ en: "Rename file", ar: "تغيير اسم الملف" })} className="size-7" onClick={() => setDialog("rename")} />}
        {!readOnly && fileObj.name !== doc.main && (
          <IconButton
            icon="trash"
            label={t("del")}
            className="size-7"
            onClick={() => {
              store.setFiles(doc.files.filter((f) => f.name !== fileObj.name), "files");
              setFile(doc.main);
            }}
          />
        )}
        <span className="flex-1" />
        <button type="button" className="rounded px-1.5 font-mono text-xs text-fog hover:text-frost disabled:opacity-40" onClick={() => zoomCode(-1)} disabled={fontSize <= 10} aria-label={l({ en: "Smaller code", ar: "تصغير الكود" })}>
          A−
        </button>
        <button type="button" className="rounded px-1.5 font-mono text-sm text-fog hover:text-frost disabled:opacity-40" onClick={() => zoomCode(1)} disabled={fontSize >= 22} aria-label={l({ en: "Larger code", ar: "تكبير الكود" })}>
          A+
        </button>
        {!readOnly && (
          <Select
            aria-label={t("examplesCode")}
            className="h-7 w-36 text-xs"
            value=""
            onChange={(e) => {
              const k = e.target.value as keyof typeof CODE;
              if (k && CODE[k]) {
                store.setFiles(doc.files.map((f) => (f.name === doc.main ? { ...f, text: CODE[k].trim() + "\n" } : f)), "example");
                setFile(doc.main);
              }
            }}
          >
            <option value="">{t("examplesCode")}…</option>
            {CODE_EXAMPLES.map((x) => (
              <option key={x.key} value={x.key}>
                {l(x.title)}
              </option>
            ))}
          </Select>
        )}
      </div>
      <div ref={codeBox} className="min-h-0 flex-1" style={{ ["--code-font" as string]: `${fontSize}px` }}>
        <CodeEditor value={fileObj.text} fileName={fileObj.name} onChange={setCode} diagnostics={build && !stale ? build.diagnostics : build?.diagnostics ?? []} readOnly={readOnly} />
      </div>
      <div className="flex items-center gap-2 border-t border-[var(--line)] px-3 py-1.5 text-xs text-fog" dir="ltr">
        {compiling ? (
          <>
            <Spinner size={12} /> {toolchainBytes !== null ? `${t("toolchainLoading")} ${(toolchainBytes / 1048576).toFixed(1)} MB` : t("compiling")}
          </>
        ) : build ? (
          build.ok ? (
            <span className={cn(stale ? "text-fog" : "text-ok")} data-testid="compile-status">
              ✓ {t("compileOk")} · {build.sizes?.flash} B · {build.ms} ms{stale ? " · (edited)" : ""}
            </span>
          ) : (
            <span className="text-danger" data-testid="compile-status">
              ✗ {t("compileFailed")} ({build.diagnostics.filter((d) => d.severity === "error").length})
            </span>
          )
        ) : (
          <span>Arduino Uno · ATmega328P · avr-gcc</span>
        )}
      </div>
    </div>
  );

  const bottomPanel = (
    <div className={cn("flex min-h-0 flex-col border-t border-[var(--line)] bg-deep", !bottomOpen ? "h-9" : bottom === "scope" || bottom === "pins" ? "h-80" : "h-56")}>
      <div className="flex items-center gap-1 px-2 py-1">
        {(["serial", "diagnostics", "pins", "scope"] as const).filter((k) => layout === "circuit" || k === "serial" || k === "diagnostics").map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setBottom(k);
              setBottomOpen(true);
            }}
            className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs", bottom === k && bottomOpen ? "bg-panel-2 text-frost" : "text-fog hover:text-frost")}
            data-testid={`bottom-${k}`}
          >
            <Icon name={k === "serial" ? "terminal" : k === "diagnostics" ? "alert" : k === "pins" ? "pins" : "scope"} size={14} />
            {k === "serial" ? t("serial") : k === "diagnostics" ? t("diagnostics") : k === "pins" ? l({ en: "Pins", ar: "البنات" }) : l({ en: "Oscilloscope", ar: "أوسيلوسكوب" })}
            {k === "diagnostics" && (build?.diagnostics.some((d) => d.severity === "error") || simDiag.some((d) => d.level !== "info")) && <span className="size-1.5 rounded-full bg-warn" />}
          </button>
        ))}
        <span className="flex-1" />
        <IconButton icon={bottomOpen ? "minus" : "plus"} label="toggle" className="size-7" onClick={() => setBottomOpen(!bottomOpen)} />
      </div>
      {bottomOpen && (
        <div className="min-h-0 flex-1">
          {bottom === "serial" ? (
            <SerialMonitor text={sim.serial} lines={sim.serialLines} onSend={sim.sendSerial} onClear={sim.clearSerial} enabled={sim.status === "running"} code={doc.files.map((f) => f.text).join("\n")} />
          ) : bottom === "pins" ? (
            <PinMonitor frame={sim.frame} board={boardId} />
          ) : bottom === "scope" ? (
            <Oscilloscope trace={sim.trace} lost={sim.traceLost} frame={sim.frame} setTracing={sim.setTracing} running={running} />
          ) : (
            <Diagnostics compile={build?.diagnostics ?? []} sim={simDiag} doc={doc} onGoto={gotoDiag} onSelect={selectFinding} sizes={build?.ok ? build.sizes : undefined} />
          )}
        </div>
      )}
    </div>
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--line)] bg-deep px-2 py-1.5">
      <IconButton icon="back" label={t("navProjects")} onClick={() => navigate(layout === "code" ? "code" : "circuits")} />
      <div className="flex min-w-0 items-center gap-2">
        {titleDraft !== null ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const tt = titleDraft.trim();
              if (tt) void proj.rename(tt);
              setTitleDraft(null);
            }}
          >
            <Input autoFocus value={titleDraft} maxLength={120} onChange={(e) => setTitleDraft(e.target.value)} onBlur={(e) => e.currentTarget.form?.requestSubmit()} className="h-8 w-56" />
          </form>
        ) : (
          <button type="button" className="max-w-[16rem] truncate font-semibold hover:text-cyan" disabled={p.role !== "owner"} onClick={() => setTitleDraft(p.title)} title={t("rename")} data-testid="project-title">
            {p.title}
          </button>
        )}
        <span className={cn("hidden text-xs sm:inline", proj.state === "conflict" || proj.state === "error" ? "text-danger" : proj.state === "dirty" ? "text-warn" : "text-fog")} data-testid="save-state">
          {statusText}
        </span>
      </div>
      <span className="flex-1" />
      {!readOnly && (
        <div className="flex items-center">
          <IconButton icon="undo" label={t("undo")} disabled={!canUndo || running} onClick={() => store.undo()} />
          <IconButton icon="redo" label={t("redo")} disabled={!canRedo || running} onClick={() => store.redo()} />
          <IconButton icon="rotate" label={t("rotate")} disabled={!sel.parts.length || running} onClick={() => store.rotate(sel.parts)} />
          <IconButton icon="trash" label={t("deleteSel")} disabled={!(sel.parts.length + sel.wires.length) || running} onClick={askDelete} />
        </div>
      )}
      <div className="flex items-center gap-1">
        <Button size="sm" icon="code" onClick={() => void doCompile()} disabled={compiling || !hasBoard} data-testid="compile">
          {compiling ? t("compiling") : t("compile")}
        </Button>
        {sim.status === "idle" ? (
          <Button size="sm" variant="primary" icon="play" onClick={() => void startSim()} disabled={compiling} data-testid="sim-start">
            {t("startSim")}
          </Button>
        ) : (
          <>
            {sim.status === "running" ? (
              <IconButton icon="pause" label={t("pause")} onClick={sim.pause} data-testid="sim-pause" />
            ) : (
              <IconButton icon="play" label={t("resume")} onClick={sim.resume} data-testid="sim-resume" />
            )}
            <IconButton icon="reset" label={t("reset")} onClick={sim.reset} />
            <IconButton icon="stop" label={t("stop")} onClick={sim.stop} className="text-danger" data-testid="sim-stop" />
          </>
        )}
        <IconButton icon={sim.sound ? "volume" : "mute"} label={t("sound")} active={sim.sound} onClick={() => sim.setSound(!sim.sound)} />
      </div>
      <div className="flex items-center gap-1">
        {!readOnly && !p.local && <IconButton icon="history" label={t("versions")} onClick={() => setDialog("versions")} />}
        <IconButton icon="download" label={t("exportFile")} onClick={() => setDialog("export")} />
        {p.role === "owner" && !p.local && <IconButton icon="share" label={t("share")} onClick={() => setDialog("share")} />}
        {readOnly ? (
          <Button size="sm" icon="copy" onClick={() => void clone()}>
            {t("cloneToEdit")}
          </Button>
        ) : (
          <Button size="sm" icon="save" onClick={() => void save()} disabled={proj.state === "saving"} data-testid="save">
            {t("save")}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] flex-col">
      {toolbar}
      {proj.recovered && (
        <div className="flex items-center gap-3 bg-volt/15 px-3 py-2 text-sm">
          <Icon name="info" className="text-cyan" /> {t("recovered")}
          <Button size="sm" variant="ghost" onClick={proj.discardRecovered}>
            {t("discard")}
          </Button>
        </div>
      )}
      {challenge && <ChallengeBar slug={challenge} project={id} getDoc={() => store.current} readOnly={readOnly} />}
      {assignment && <AssignmentBar assignment={assignment} challenge={challenge} project={id} getDoc={() => store.current} save={proj.save} readOnly={readOnly} />}
      {readOnly && (
        <div className="flex items-center gap-2 bg-panel px-3 py-1.5 text-xs text-mist">
          <Icon name="lock" size={14} /> {t("readOnly")} · {p.owner ? `${t("by")} ${p.owner}` : ""}
        </div>
      )}
      {/* Mobile tabs */}
      <div className="flex gap-1 border-b border-[var(--line)] px-2 py-1 lg:hidden">
        {(["circuit", "code", "serial", ...(readOnly ? [] : ["parts"])] as MobileTab[]).map((k) => (
          <button key={k} type="button" onClick={() => setMobile(k)} className={cn("flex-1 rounded-md py-1.5 text-xs", mobile === k ? "bg-panel-2 text-frost" : "text-fog")}>
            {k === "circuit" ? t("navCircuits") : k === "code" ? t("code") : k === "serial" ? t("serial") : t("parts")}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1">
        {layout === "circuit" && !readOnly && (
          <aside className={cn("w-60 shrink-0 border-e border-[var(--line)] bg-deep", mobile === "parts" ? "max-lg:flex-1" : "max-lg:hidden")}>
            <Library
              disabled={running}
              onPick={(type) => {
                setPlacing(type);
                setMobile("circuit");
              }}
            />
          </aside>
        )}
        {layout === "code" && <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col border-e border-[var(--line)] bg-[#060f27]", mobile === "code" ? "" : "max-lg:hidden")}>{codePanel}</section>}
        <main className={cn("flex min-h-0 min-w-0 flex-col", layout === "code" ? "w-[44%] max-lg:w-auto max-lg:flex-1" : "flex-1", mobile === "circuit" || mobile === "serial" ? "" : "max-lg:hidden")}>
          <div className={cn("flex min-h-0 flex-1 flex-col", mobile === "serial" && "max-lg:hidden")}>{canvas}</div>
          <div className={cn(mobile !== "serial" && "max-lg:hidden", mobile === "serial" && "max-lg:flex-1")}>{bottomPanel}</div>
        </main>
        {layout === "circuit" && (
          <aside className={cn("flex w-[26rem] shrink-0 flex-col border-s border-[var(--line)] bg-deep", mobile === "code" ? "max-lg:flex-1" : "max-lg:hidden")}>
            <div className="flex gap-1 border-b border-[var(--line)] p-1.5 max-lg:hidden">
              {(["code", "inspector"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setSide(k)} className={cn("flex-1 rounded-md py-1.5 text-sm", side === k ? "bg-panel-2 text-frost" : "text-fog hover:text-frost")} data-testid={`side-${k}`}>
                  {t(k === "code" ? "code" : "inspector")}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{side === "code" || mobile === "code" ? codePanel : <Inspector store={store} readings={sim.frame?.parts} running={running} live={sim.live} onLive={sim.setLive} readOnly={readOnly} />}</div>
          </aside>
        )}
        {layout === "code" && sel.parts.length > 0 && (
          <aside className="w-72 shrink-0 overflow-y-auto border-s border-[var(--line)] bg-deep max-xl:hidden">
            <Inspector store={store} readings={sim.frame?.parts} running={running} live={sim.live} onLive={sim.setLive} readOnly={readOnly} />
          </aside>
        )}
      </div>

      {/* Off-screen picture of the circuit for the project thumbnail. */}
      {typeof document !== "undefined" &&
        createPortal(
          <div ref={thumb} aria-hidden className="pointer-events-none fixed -left-[9999px] top-0 h-[180px] w-[320px]">
            <CircuitThumb doc={doc} className="h-[180px] w-[320px]" />
          </div>,
          document.body,
        )}

      <ConflictDialog proj={proj} layout={layout} />
      <Modal open={dialog === "newfile"} onClose={() => setDialog(null)} title={t("newFile")}>
        <NewFile
          existing={doc.files.map((f) => f.name)}
          onCreate={(name) => {
            store.setFiles([...doc.files, { name, text: name.endsWith(".h") ? `#pragma once\n` : name.endsWith(".ino") ? "" : `#include <Arduino.h>\n` }], "files");
            setFile(name);
            setDialog(null);
          }}
        />
      </Modal>
      <Modal open={dialog === "rename"} onClose={() => setDialog(null)} title={l({ en: "Rename file", ar: "تغيير اسم الملف" })}>
        {dialog === "rename" && (
          <NewFile
            initial={fileObj.name}
            submit={l({ en: "Rename", ar: "تغيير الاسم" })}
            existing={doc.files.map((f) => f.name).filter((n) => n !== fileObj.name)}
            onCreate={(name) => {
              store.setFiles(doc.files.map((f) => (f.name === fileObj.name ? { ...f, name } : f)), "files");
              setFile(name);
              setDialog(null);
            }}
          />
        )}
      </Modal>
      <Modal open={dialog === "export"} onClose={() => setDialog(null)} title={t("exportFile")}>
        <ExportPanel doc={doc} project={p} hex={build?.ok && !stale ? build.hex : undefined} thumb={thumb} onDone={() => setDialog(null)} />
      </Modal>
      <Modal open={dialog === "share"} onClose={() => setDialog(null)} title={t("share")}>
        <SharePanel project={p} layout={layout} onChange={(patch) => proj.setProject({ ...p, ...patch })} />
      </Modal>
      <Modal open={!!sheet} onClose={() => setSheet(null)} title={sheet?.mode === "docs" ? t("cmDocs") : t("cmPinout")} wide>
        {sheet && <PartSheet type={sheet.type} mode={sheet.mode} />}
      </Modal>
      <Modal open={inspectSheet} onClose={() => setInspectSheet(false)} title={t("inspector")}>
        {inspectSheet && <Inspector store={store} readings={sim.frame?.parts} running={running} live={sim.live} onLive={sim.setLive} readOnly={readOnly} />}
      </Modal>
      <Modal open={!!labelFor} onClose={() => setLabelFor(null)} title={t("cmLabel")}>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveLabel();
          }}
        >
          <Input autoFocus maxLength={40} value={labelFor?.text ?? ""} onChange={(e) => setLabelFor((f) => f && { ...f, text: e.target.value })} placeholder={labelFor?.kind === "wire" ? "SDA, 5V…" : "status LED…"} data-testid="label-input" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setLabelFor(null)}>
              {t("cancel")}
            </Button>
            <Button type="submit">{t("save")}</Button>
          </div>
        </form>
      </Modal>
      <Modal open={confirmDel > 0} onClose={() => setConfirmDel(0)} title={t("deleteSel")}>
        <div className="grid gap-4">
          <p className="text-sm text-mist">{l({ en: `Delete ${confirmDel} parts and the wires attached to them? You can undo this.`, ar: `هتمسح ${confirmDel} قطع والسلوك المتوصّلة بيها؟ تقدر ترجّعها بالتراجع.` })}</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDel(0)}>
              {t("cancel")}
            </Button>
            <Button
              variant="danger"
              autoFocus
              data-testid="confirm-delete"
              onClick={() => {
                store.deleteSelection();
                setConfirmDel(0);
              }}
            >
              {t("del")}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal open={dialog === "versions"} onClose={() => setDialog(null)} title={t("versions")} wide>
        <VersionsPanel
          id={id}
          lang={lang}
          onRestore={async () => {
            setDialog(null);
            await proj.reload();
          }}
        />
      </Modal>
    </div>
  );
}

function ConflictDialog({ proj, layout }: { proj: ReturnType<typeof useProject<CircuitDoc>>; layout: "circuit" | "code" }) {
  const { t, lang } = useLang();
  return (
    <Modal open={!!proj.conflict} onClose={() => {}} title={t("conflict")}>
      <p className="mb-4 text-sm text-mist">
        {proj.conflict?.by} · {proj.conflict?.at ? fmtDate(proj.conflict.at, lang) : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={proj.resolveReload}>{t("reload")}</Button>
        <Button
          variant="primary"
          onClick={async () => {
            const nid = await proj.resolveCopy();
            if (nid) navigate(`${layout === "code" ? "code" : "circuits"}/${nid}`);
          }}
        >
          {t("saveCopy")}
        </Button>
      </div>
    </Modal>
  );
}

function NewFile({ existing, onCreate, initial = "helpers.h", submit }: { existing: string[]; onCreate: (name: string) => void; initial?: string; submit?: string }) {
  const { t } = useLang();
  const [name, setName] = useState(initial);
  const ok = FILE_NAME.test(name) && !existing.includes(name);
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onCreate(name);
      }}
    >
      <label className="grid gap-1 text-sm">
        {t("fileName")} (.ino .h .cpp)
        <Input value={name} dir="ltr" onChange={(e) => setName(e.target.value.trim())} autoFocus />
      </label>
      <Button type="submit" variant="primary" disabled={!ok}>
        {submit ?? t("newFile")}
      </Button>
    </form>
  );
}

function download(name: string, data: BlobPart, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const slug = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "project";

function ExportPanel({ doc, project, hex, thumb, onDone }: { doc: CircuitDoc; project: Project; hex?: string; thumb: React.RefObject<HTMLDivElement | null>; onDone: () => void }) {
  const { t, l, lang } = useLang();
  const lines = bom(doc, l);
  const svgText = () => {
    const svg = thumb.current?.querySelector("svg");
    if (!svg) return null;
    const big = svg.cloneNode(true) as SVGSVGElement;
    big.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    return new XMLSerializer().serializeToString(big);
  };
  const name = slug(project.title);
  const done = (kind: string) => {
    labEvent("export", project.id, { format: kind });
    onDone();
  };
  return (
    <div className="grid gap-2">
      <Button icon="file" onClick={() => (download(`${name}.buildx.json`, JSON.stringify({ format: "buildx-lab", version: 1, kind: project.kind, title: project.title, description: project.description, tags: project.tags, data: doc }, null, 1), "application/json"), done("json"))}>
        {t("exportJson")}
      </Button>
      <Button icon="code" onClick={() => (download(`${name}.ino`, doc.files.find((f) => f.name === doc.main)?.text ?? "", "text/plain"), done("ino"))}>
        {t("exportIno")}
      </Button>
      <Button icon="chip" disabled={!hex} onClick={() => hex && (download(`${name}.hex`, hex, "text/plain"), done("hex"))}>
        {t("exportHex")} {!hex && <span className="text-xs text-fog">({t("compile")} ↑)</span>}
      </Button>
      <Button
        icon="gallery"
        onClick={() => {
          const svg = thumb.current?.querySelector("svg");
          if (!svg) return;
          const big = svg.cloneNode(true) as SVGSVGElement;
          big.setAttribute("width", "1600");
          big.setAttribute("height", "900");
          big.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          download(`${name}.svg`, new XMLSerializer().serializeToString(big), "image/svg+xml");
          done("svg");
        }}
      >
        {t("exportPng")}
      </Button>
      <div className="mt-3 grid gap-2 border-t border-[var(--line)] pt-3" data-testid="real-project">
        <p className="font-semibold">{l({ en: "Build it for real", ar: "اعملها في الحقيقة" })}</p>
        {lines.length ? (
          <ul className="grid max-h-48 gap-1 overflow-y-auto text-sm" data-testid="bom">
            {lines.map((x) => (
              <li key={`${x.type}|${x.spec}`} className="flex gap-2">
                <span className="w-8 shrink-0 font-mono text-cyan">{x.qty}×</span>
                <span className="min-w-0 flex-1">{l(x.name)}</span>
                {x.spec && (
                  <span className="text-fog" dir="auto">
                    {x.spec}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fog">{l({ en: "Add parts to get a parts list.", ar: "ضيف قطع عشان تطلع قائمة المكونات." })}</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button
            icon="file"
            disabled={!lines.length}
            onClick={() => {
              const code = doc.files.map((f) => (doc.files.length > 1 ? `// ── ${f.name} ──\n${f.text}` : f.text)).join("\n\n");
              download(`${name}-guide.html`, guideHtml({ title: project.title, description: project.description, svg: svgText(), lines, steps: wiring(doc, l), code, lang, l }), "text/html");
              done("guide");
            }}
          >
            {l({ en: "Build guide", ar: "دليل التركيب" })}
          </Button>
          <Button icon="download" disabled={!lines.length} onClick={() => (download(`${name}-parts.csv`, "\ufeff" + bomCsv(lines, l), "text/csv"), done("bom"))}>
            {l({ en: "Parts list (CSV)", ar: "قائمة المكونات (CSV)" })}
          </Button>
        </div>
        <Button variant="ghost" icon="cube" onClick={() => (onDone(), navigate("3d/new"))}>
          {l({ en: "Need a case or bracket? Design it in 3D Studio", ar: "محتاج علبة أو حامل؟ صمّمه في استوديو 3D" })}
        </Button>
      </div>
    </div>
  );
}

function SharePanel({ project, layout, onChange }: { project: Project; layout: "circuit" | "code"; onChange: (p: Partial<Project>) => void }) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const base = `${location.origin}${href(`${layout === "code" ? "code" : "circuits"}/${project.id}`)}`;
  const link = project.visibility === "unlisted" && project.share_token ? `${base}?share=${project.share_token}` : project.visibility === "public" ? base : null;
  const set = async (visibility: Visibility) => {
    setBusy(true);
    try {
      const r = await projects.settings(project.id, { visibility });
      if (r.ok) onChange({ visibility, share_token: r.share_token ?? project.share_token });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-2" disabled={busy}>
        <legend className="mb-1 text-sm text-fog">{t("visibility")}</legend>
        {(["private", "unlisted", "public"] as const).map((v) => (
          <label key={v} className={cn("flex cursor-pointer items-center gap-3 rounded-xl p-3 ring-1", project.visibility === v ? "bg-volt/15 ring-volt/60" : "ring-rim")}>
            <input type="radio" name="vis" checked={project.visibility === v} onChange={() => void set(v)} className="accent-volt" />
            <Icon name={v === "private" ? "lock" : v === "unlisted" ? "link" : "globe"} />
            <span>{t(v)}</span>
          </label>
        ))}
      </fieldset>
      {link && (
        <div className="flex gap-2">
          <Input readOnly value={link} dir="ltr" onFocus={(e) => e.target.select()} />
          <Button
            icon="copy"
            onClick={() => {
              void navigator.clipboard.writeText(link).then(() => toast(t("copied")));
            }}
          >
            {t("copyLink")}
          </Button>
        </div>
      )}
    </div>
  );
}

function VersionsPanel({ id, lang, onRestore }: { id: string; lang: "ar" | "en"; onRestore: () => void }) {
  const { t } = useLang();
  const [list, setList] = useState<Awaited<ReturnType<typeof projects.versions>> | null>(null);
  useEffect(() => {
    void projects.versions(id).then(setList, () => setList([]));
  }, [id]);
  if (!list) return <Spinner />;
  if (!list.length) return <p className="text-sm text-fog">{t("emptyProjects")}</p>;
  return (
    <ul className="grid max-h-[60vh] gap-2 overflow-y-auto">
      {list.map((v) => (
        <li key={v.id} className="flex items-center gap-3 rounded-xl bg-abyss p-3 ring-1 ring-rim">
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              r{v.revision} · {fmtDate(v.at, lang)} {v.note && <Badge>{v.note}</Badge>}
            </p>
            <p className="text-xs text-fog">{v.by}</p>
          </div>
          <Button
            size="sm"
            onClick={async () => {
              const r = await projects.restoreVersion(id, v.id);
              if (r.ok) onRestore();
              else toast(t("error"), "danger");
            }}
          >
            {t("restore")}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Create a project and open it (from "new", an example, or an imported file). */
export async function createAndOpen(kind: "circuit" | "code", title: string, data: CircuitDoc, meta: { description?: string; tags?: string[] } = {}) {
  const nid = await projects.create(kind, title, data, meta);
  navigate(`${kind === "code" ? "code" : "circuits"}/${nid}`, { replace: false });
  return nid;
}

export const isSignedIn = () => !!meStore.get();
