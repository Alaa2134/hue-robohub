"use client";
import { useSyncExternalStore } from "react";

/** Tiny shared UI store for the site chrome (menu + search overlays), no context provider needed. */
type State = { menu: boolean; search: boolean };
let state: State = { menu: false, search: false };
const subs = new Set<() => void>();

function emit() {
  for (const s of subs) s();
}

export const ui = {
  get: () => state,
  set(patch: Partial<State>) {
    state = { ...state, ...patch };
    const locked = state.menu || state.search;
    document.documentElement.toggleAttribute("data-locked", locked);
    const lenis = (window as unknown as { __lenis?: { stop(): void; start(): void } }).__lenis;
    if (lenis) (locked ? lenis.stop() : lenis.start());
    emit();
  },
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};

const server: State = { menu: false, search: false };
export function useUi() {
  return useSyncExternalStore(ui.subscribe, ui.get, () => server);
}
