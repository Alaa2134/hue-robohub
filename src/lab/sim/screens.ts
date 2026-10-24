/**
 * The latest picture of each simulated display, outside React state: frames only carry a screen when
 * it changed, and only the display that changed re-renders.
 */
import { useSyncExternalStore } from "react";

const pictures = new Map<string, Uint8Array>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function putScreens(s: Record<string, Uint8Array> | undefined) {
  if (!s) return;
  for (const [id, pic] of Object.entries(s)) pictures.set(id, pic);
  emit();
}
export function clearScreens() {
  if (!pictures.size) return;
  pictures.clear();
  emit();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export function useScreen(part: string): Uint8Array | undefined {
  return useSyncExternalStore(
    subscribe,
    () => pictures.get(part),
    () => undefined,
  );
}
