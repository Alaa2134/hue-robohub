"use client";
/** The simulation worker from the editor's side: start/pause/stop, live inputs, serial and sound. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CircuitDoc } from "../circuit/model";
import type { Frame } from "./engine";

export type SimStatus = "idle" | "running" | "paused";
const SERIAL_MAX = 200_000;

export function useSimulation(onEnd?: (simSeconds: number) => void) {
  const worker = useRef<Worker | null>(null);
  const [status, setStatus] = useState<SimStatus>("idle");
  const [frame, setFrame] = useState<Frame | null>(null);
  const [serial, setSerial] = useState("");
  const [crash, setCrash] = useState<string | null>(null);
  const [live, setLiveState] = useState<Record<string, Record<string, unknown>>>({});
  const [sound, setSound] = useState(false);
  const last = useRef<{ doc: CircuitDoc; hex: string | null } | null>(null);
  const simT = useRef(0);
  const audio = useRef<{ ctx: AudioContext; tones: Map<string, OscillatorNode & { gainNode?: GainNode }> } | null>(null);
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
      setCrash(null);
      setLiveState({});
      w.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (m.type === "frame") {
          const f = m.frame as Frame;
          simT.current = f.t;
          setFrame(f);
          if (f.serial) setSerial((s) => (s + f.serial).slice(-SERIAL_MAX));
        } else if (m.type === "crash") {
          setCrash(m.message);
          setStatus("paused");
        }
      };
      w.onerror = (e) => {
        setCrash(e.message || "worker error");
        setStatus("paused");
      };
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

  const sendSerial = useCallback((text: string) => worker.current?.postMessage({ type: "serial", text }), []);
  const clearSerial = useCallback(() => setSerial(""), []);

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

  return { status, frame, serial, crash, live, sound, setSound, start, stop, pause, resume, reset, setLive, sendSerial, clearSerial };
}
