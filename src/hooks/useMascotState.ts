"use client";
/**
 * Shared state for the BuildX guide: what the mascot is doing, saying and showing. The DOM layer
 * (position, speech, menu) writes it; the 3D layer reads it every frame without re-rendering.
 */
import { useSyncExternalStore } from "react";
import type { Line, PropName } from "@/config/mascotJourney";
import { ONE_SHOT, type ClipName } from "@/lib/mascot/clip-names";

export type MascotMode = "3d" | "poster";

export type MascotState = {
  mode: MascotMode;
  /** The 3D model has loaded (the loader shows until then). */
  ready: boolean;
  /** The visitor hid the guide (remembered on this device). */
  hidden: boolean;
  sound: boolean;
  menu: boolean;
  /** Current clip; `clipId` changes on every play, so a one-shot can repeat. */
  clip: ClipName;
  clipId: number;
  /** Looping clip to return to after a one-shot. */
  rest: ClipName;
  /** Body turn: -1 walks towards screen-left, 1 towards screen-right, 0 faces the visitor. */
  facing: number;
  /** Where to look, in viewport pixels (null: at the visitor). */
  look: { x: number; y: number } | null;
  eyesClosed: boolean;
  props: PropName[];
  goggles: boolean;
  drone: boolean;
  speech: (Line & { id: number }) | null;
  /** Mascot box on screen (for the bubble, menu and look direction). */
  box: { x: number; y: number; w: number; h: number };
};

const initial: MascotState = {
  mode: "3d",
  ready: false,
  hidden: false,
  sound: false,
  menu: false,
  clip: "Idle",
  clipId: 0,
  rest: "Idle",
  facing: 0,
  look: null,
  eyesClosed: false,
  props: [],
  goggles: false,
  drone: false,
  speech: null,
  box: { x: 0, y: 0, w: 0, h: 0 },
};

let state = initial;
const subs = new Set<() => void>();
let speechId = 0;

export const mascot = {
  get: () => state,
  set(patch: Partial<MascotState>) {
    state = { ...state, ...patch };
    for (const s of subs) s();
  },
  /** Update without notifying subscribers (per-frame values the 3D layer reads itself). */
  patch(patch: Partial<MascotState>) {
    state = { ...state, ...patch };
  },
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => void subs.delete(fn);
  },
  /** Play a clip. One-shots (Wave, Jump...) hand back to `rest` (default: the current looping clip). */
  play(clip: ClipName, rest?: ClipName) {
    const loop = ONE_SHOT.has(clip) ? (rest ?? (ONE_SHOT.has(state.clip) ? state.rest : state.clip)) : clip;
    mascot.set({ clip, clipId: state.clipId + 1, rest: loop, eyesClosed: clip === "Sleep" });
  },
  /** Show a line (or clear the bubble). Returns the line's id, to clear only that line later. */
  say(line: Line | null) {
    const id = ++speechId;
    mascot.set({ speech: line ? { ...line, id } : null });
    return id;
  },
  reset() {
    state = { ...initial, mode: state.mode, ready: state.ready, hidden: state.hidden, sound: state.sound, box: state.box };
    for (const s of subs) s();
  },
};

const server = initial;
export function useMascot<T>(pick: (s: MascotState) => T): T {
  return useSyncExternalStore(
    mascot.subscribe,
    () => pick(state),
    () => pick(server),
  );
}
