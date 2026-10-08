"use client";
/**
 * Baqloz reacting to what the visitor does on the page:
 *  - resting the cursor on cards and buttons (HOVERS: tracks, teams, people, projects, events...),
 *  - filling in forms (a tip per field, and a nudge when a field is invalid),
 *  - and a little small talk when it has been quiet for a while (QUIPS, at most two per page).
 * Lines go through `brief`, which never cuts off something more important he's saying.
 */
import { useEffect, useRef } from "react";
import { FIELD_TIPS, HOVERS, LINE_INVALID, QUIPS, type Line, type Text } from "@/config/mascotJourney";
import type { ClipName } from "@/lib/mascot/clip-names";
import { mascot } from "./useMascotState";

/** prio: 0 small talk, 1 a reaction, 2 important. `interrupt` cuts off a scene (the visitor is doing something). */
export type Brief = (line: Line, o: { prio: number; ms?: number; clip?: ClipName; look?: Element | null; goggles?: boolean; interrupt?: boolean }) => boolean;

export function useMascotReactions(api: { brief: Brief; busy: () => boolean }, key: string, enabled: boolean) {
  const ref = useRef(api);
  useEffect(() => {
    ref.current = api;
  });

  useEffect(() => {
    if (!enabled) return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const seen = new WeakSet<Element>();
    const seenFields = new Set<string>();
    const inGuide = (el: Element) => !!el.closest("[data-mascot], [data-mascot-menu]");
    let dwell = 0;
    let lastHover = 0;
    let lastInvalid = 0;

    // Cursor resting on something he knows about (half a second, one line per thing per page).
    const over = (e: PointerEvent) => {
      if (!fine || e.pointerType !== "mouse") return;
      const t = e.target as Element | null;
      if (!t?.closest || inGuide(t)) return;
      for (const h of HOVERS) {
        const el = t.closest(h.selector);
        if (!el) continue;
        clearTimeout(dwell);
        if (seen.has(el)) return;
        // Still resting on it: try now, and again shortly if he's busy (walking, mid-sentence).
        let tries = 0;
        const attempt = () => {
          if (tries++ > 6) return;
          if (performance.now() - lastHover < 3500 || ref.current.busy()) {
            dwell = window.setTimeout(attempt, 700);
            return;
          }
          const line = h.line(el);
          if (!line) return;
          if (ref.current.brief(line, { prio: 1, clip: h.clip, look: el, goggles: h.goggles })) {
            seen.add(el);
            lastHover = performance.now();
          } else dwell = window.setTimeout(attempt, 700);
        };
        dwell = window.setTimeout(attempt, 550);
        return;
      }
    };
    const out = () => clearTimeout(dwell);

    // Forms: a tip for each field the first time it's focused; a nudge for invalid ones.
    const isField = (t: EventTarget | null): t is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
      (t instanceof HTMLInputElement && t.type !== "hidden") || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
    const focus = (e: FocusEvent) => {
      const f = e.target;
      if (!isField(f) || inGuide(f) || window.innerWidth < 768) return;
      if (f.getAttribute("aria-invalid") === "true") {
        ref.current.brief(LINE_INVALID, { prio: 2, interrupt: true, clip: "LookDown", look: f });
        return;
      }
      const name = f.name || f.id || ("placeholder" in f ? f.placeholder : "");
      // By name, by id (with or without a form prefix like "ap-"), by placeholder, then by type.
      const keys = [f.name, f.id, f.id.replace(/^[a-z]+-/, ""), "placeholder" in f ? `ph:${f.placeholder}` : "", `type_${f.type}`];
      const tip = keys.map((k) => k && FIELD_TIPS[k]).find(Boolean);
      if (!tip || seenFields.has(name)) return;
      // The visitor is busy with the form: the tip comes first.
      if (ref.current.brief(tip, { prio: 2, interrupt: true, ms: 4800, look: f })) seenFields.add(name);
    };
    const invalid = (e: Event) => {
      const now = performance.now();
      if (now - lastInvalid < 4000) return;
      lastInvalid = now;
      ref.current.brief(LINE_INVALID, { prio: 2, interrupt: true, clip: "LookDown", look: e.target as Element });
    };

    // Small talk after 40 quiet seconds (two per page at most).
    let quips = 0;
    let quietSince = performance.now();
    const unsubscribe = mascot.subscribe(() => {
      if (mascot.get().speech) quietSince = performance.now();
    });
    const tick = window.setInterval(() => {
      if (quips >= 2 || document.hidden || mascot.get().speech || ref.current.busy()) return;
      if (performance.now() - quietSince < 40000) return;
      quips++;
      quietSince = performance.now();
      ref.current.brief(QUIPS[Math.floor(Math.random() * QUIPS.length)], { prio: 0, ms: 4800, clip: "LookAround" });
    }, 10000);

    document.addEventListener("pointerover", over, { passive: true });
    document.addEventListener("pointerout", out, { passive: true });
    document.addEventListener("focusin", focus);
    document.addEventListener("invalid", invalid, true);
    return () => {
      clearTimeout(dwell);
      clearInterval(tick);
      unsubscribe();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("invalid", invalid, true);
    };
  }, [key, enabled]);
}
