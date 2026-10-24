"use client";
/** A minimal observable value with a React hook (no library needed for a few shared states). */
import { useSyncExternalStore } from "react";

export function create<T>(initial: T) {
  let value = initial;
  const subs = new Set<() => void>();
  const api = {
    get: () => value,
    set(v: T) {
      if (Object.is(v, value)) return;
      value = v;
      subs.forEach((s) => s());
    },
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    use: () => useSyncExternalStore(api.subscribe, api.get, () => initial),
  };
  return api;
}
