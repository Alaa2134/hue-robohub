"use client";
/** The simulation worker from the editor's side: start/pause/stop, live inputs, serial and sound. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CircuitDoc } from "../circuit/model";
import { TRACE_PINS, type Frame } from "./engine";
import { clearScreens, putScreens } from "./screens";

export type SimStatus = "idle" | "running" | "paused";
const SERIAL_MAX = 200_000;
/** Simulated seconds of pin history the oscilloscope keeps. */
export const TRACE_KEEP = 5;
const TRACE_POINTS = 200_000;

/** Per board pin: times (s) and voltages of every change, oldest first. */
export type Trace = { t: number[]; v: number[] }[];
/** Serial output split into lines, each stamped with the simulated time its first character arrived. */
export type SerialLine = { t: number; text: string };
const SERIAL_LINES = 5000;

export function addSerial(lines: SerialLine[], text: string, t: number): SerialLine[] {
  const out = lines.slice();
  const parts = text.split("\n");
  parts.forEach((p, i) => {
    const lastOpen = out.length && !out[out.length - 1].text.endsWith("\n");
    const chunk = i < parts.length - 1 ? `${p}\n` : p;
    if (!chunk) return;
    if (i === 0 && lastOpen) out[out.length - 1] = { ...out[out.length - 1], text: out[out.length - 1].text + chunk };
    else out.push({ t, text: chunk });
  });
  return out.length > SERIAL_LINES ? out.slice(-SERIAL_LINES) : out;
}
export const newTrace = (): Trace => TRACE_PINS.map(() => ({ t: [], v: [] }));

export function useSimulation(onEnd?: (simSeconds: number) => void) {
  const worker = useRef<Worker | null>(null);
  const [status, setStatus] = useState<SimStatus>("idle");
  const [frame, setFrame] = useState<Frame | null>(null);
  const [serial, setSerial] = useState("");
  const [serialLines, setSerialLines] = useState<SerialLine[]>([]);
  const [crash, setCrash] = useState<string | null>(null);
  const [live, setLiveState] = useState<Record<string, Record<string, unknown>>>({});
  const [sound, setSound] = useState(false);
  const last = useRef<{ doc: CircuitDoc; hex: string | null } | null>(null);
  const simT = useRef(0);
  const audio = useRef<{ ctx: AudioContext; tones: Map<string, OscillatorNode & { gainNode?: GainNode }> } | null>(null);
  const rate = useRef(1);
  const [speed, setSpeedState] = useState(1);
  const tracing = useRef(false);
  /** Pin history for the oscilloscope (read every animation frame, not React state). */
  const trace = useRef<Trace>(newTrace());
  const traceLost = useRef(0);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;

  const kill = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    audio.current?.tones.forEach((o) => o.stop());
    audio.current?.tones.clear();
  }, []);

  const start = useCallback(
    (doc: CircuitDoc, hex: string | null) => {
      kill();
      const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      worker.current = w;
      last.current = { doc, hex };
      simT.current = 0;
      setSerial("");
      setSerialLines([]);
      setCrash(null);
      setLiveState({});
      trace.current = newTrace();
      traceLost.current = 0;
      clearScreens();
      w.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (m.type === "frame") {
          const f = m.frame as Frame;
          simT.current = f.t;
          if (f.trace) addTrace(trace.current, f.trace, f.t);
          if (f.traceLost) traceLost.current += f.traceLost;
          putScreens(f.screens);
          setFrame(f);
          if (f.serial) {
            setSerial((s) => (s + f.serial).slice(-SERIAL_MAX));
            setSerialLines((l) => addSerial(l, f.serial, f.t));
          }
        } else if (m.type === "crash") {
          setCrash(m.message);
          setStatus("paused");
        }
      };
      w.onerror = (e) => {
        setCrash(e.message || "worker error");
        setStatus("paused");
      };
      w.postMessage({ type: "speed", value: rate.current });
      w.postMessage({ type: "trace", on: tracing.current });
      w.postMessage({ type: "start", doc, hex });
      setStatus("running");
    },
    [kill],
  );

  const stop = useCallback(() => {
    if (worker.current) endRef.current?.(simT.current);
    kill();
    setStatus("idle");
    setFrame(null);
    clearScreens();
  }, [kill]);

  const pause = useCallback(() => {
    worker.current?.postMessage({ type: "pause" });
    setStatus("paused");
  }, []);
  const resume = useCallback(() => {
    worker.current?.postMessage({ type: "resume" });
    setStatus("running");
  }, []);
  const reset = useCallback(() => {
    if (last.current) start(last.current.doc, last.current.hex);
  }, [start]);

  const setLive = useCallback((part: string, key: string, value: number | boolean) => {
    setLiveState((s) => ({ ...s, [part]: { ...s[part], [key]: value } }));
    worker.current?.postMessage({ type: "live", part, key, value });
  }, []);

  /** Run faster or slower than real time (the device may not keep up: the frame reports the real speed). */
  const setSpeed = useCallback((value: number) => {
    rate.current = value;
    setSpeedState(value);
    worker.current?.postMessage({ type: "speed", value });
  }, []);
  /** Record pin voltages for the oscilloscope while it's open. */
  const setTracing = useCallback((on: boolean) => {
    if (tracing.current === on) return;
    tracing.current = on;
    trace.current = newTrace();
    worker.current?.postMessage({ type: "trace", on });
  }, []);

  const sendSerial = useCallback((text: string) => worker.current?.postMessage({ type: "serial", text }), []);
  const clearSerial = useCallback(() => {
    setSerial("");
    setSerialLines([]);
  }, []);

  // Sound: one oscillator per sounding buzzer, at the frequency the simulation measured.
  useEffect(() => {
    if (!frame || !sound || status !== "running") {
      audio.current?.tones.forEach((o) => o.stop());
      audio.current?.tones.clear();
      return;
    }
    audio.current ??= { ctx: new AudioContext(), tones: new Map() };
    const { ctx, tones } = audio.current;
    const want = new Map<string, number>();
    for (const [id, r] of Object.entries(frame.parts)) {
      if (r.freq && r.freq > 20) want.set(id, r.freq);
      else if (r.v !== undefined && r.freq === undefined && last.current?.doc.parts.find((p) => p.id === id && p.type === "buzzer" && p.props.active) && r.v > 2.5) want.set(id, 2300);
    }
    for (const [id, o] of tones) if (!want.has(id)) (o.stop(), tones.delete(id));
    for (const [id, f] of want) {
      let o = tones.get(id);
      if (!o) {
        o = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0.04;
        o.type = "square";
        o.connect(g).connect(ctx.destination);
        o.start();
        tones.set(id, o);
      }
      o.frequency.setTargetAtTime(Math.min(8000, f), ctx.currentTime, 0.01);
    }
  }, [frame, sound, status]);

  useEffect(() => () => kill(), [kill]);

  return { status, frame, serial, serialLines, crash, live, sound, setSound, start, stop, pause, resume, reset, setLive, sendSerial, clearSerial, speed, setSpeed, setTracing, trace, traceLost };
}

/** Append a frame's pin changes and drop what's older than TRACE_KEEP seconds. */
export function addTrace(tr: Trace, flat: number[], now: number) {
  for (let i = 0; i < flat.length; i += 3) {
    const c = tr[flat[i + 1]];
    if (!c) continue;
    c.t.push(flat[i]);
    c.v.push(flat[i + 2]);
  }
  const cut = now - TRACE_KEEP;
  for (const c of tr) {
    let k = 0;
    // Keep one point before the window so the trace starts at the right level.
    while (k + 1 < c.t.length && (c.t[k + 1] < cut || c.t.length - k > TRACE_POINTS)) k++;
    if (k) {
      c.t.splice(0, k);
      c.v.splice(0, k);
    }
  }
}
