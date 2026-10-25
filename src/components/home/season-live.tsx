"use client";
/**
 * The season plan is written in the code, but the site is built only when something changes:
 * these re-check the dates in the visitor's browser, so a phase that ended shows as done and a
 * planned event that's over disappears even if the site wasn't rebuilt since.
 */
import { useEffect, useState, type ReactNode } from "react";
import { windowState, type Window } from "@/content/buildx";

function useState2(w: Window, built: ReturnType<typeof windowState>) {
  const [state, setState] = useState(built);
  useEffect(() => setState(windowState(w)), [w]);
  return state;
}

const LABEL = {
  ar: { past: "خلص ✓", now: "دلوقتي" },
  en: { past: "Done ✓", now: "Now" },
};

/** "Done ✓" / "Now" on a roadmap quarter; the card dims itself when done (has-[[data-phase=past]]). */
export function PhaseBadge({ w, built, locale }: { w: Window; built: ReturnType<typeof windowState>; locale: string }) {
  const state = useState2(w, built);
  if (state === "next") return null;
  const t = LABEL[locale === "ar" ? "ar" : "en"];
  return (
    <span
      data-phase={state}
      className={state === "now" ? "rounded-full bg-cyan/15 px-2.5 py-0.5 text-xs font-bold text-cyan" : "rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-fog"}
    >
      {t[state]}
    </span>
  );
}

/** A planned event: gone once its window is over, flagged while it's on. */
export function PlannedItem({ w, built, locale, children }: { w: Window; built: ReturnType<typeof windowState>; locale: string; children: ReactNode }) {
  const state = useState2(w, built);
  // The card around it hides itself on this marker (has-[[data-gone]]:hidden).
  if (state === "past") return <span data-gone hidden />;
  return (
    <>
      {state === "now" && (
        <span data-phase="now" className="mb-2 inline-block rounded-full bg-cyan/15 px-2.5 py-0.5 text-xs font-bold text-cyan">
          {LABEL[locale === "ar" ? "ar" : "en"].now}
        </span>
      )}
      {children}
    </>
  );
}
