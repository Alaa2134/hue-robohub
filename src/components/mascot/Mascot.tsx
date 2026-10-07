"use client";
/**
 * Entry point for the BuildX guide (mounted in the public site layout). It adds nothing to the first
 * load: the guide's code loads once the page is idle or the visitor first interacts, and the 3D
 * model only after that. Visitors who prefer reduced motion, browsers without WebGL (or with only a
 * software renderer) and data-saver connections get the still version with the same menu and speech.
 *
 * Automated browsers (tests, crawlers driving Chrome) don't get the guide unless a test asks for it
 * with localStorage "bx-guide-test" = "1" (and optionally "bx-guide-mode" = "3d" | "poster"), so it
 * can't get in the way of their clicks.
 */
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { MascotMode } from "@/hooks/useMascotState";
import type { Locale } from "@/i18n/config";
import { isQuiet } from "@/lib/mascotScenes";

const MascotController = dynamic(() => import("./MascotController"), { ssr: false });

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    const o = { failIfMajorPerformanceCaveat: true };
    return !!(c.getContext("webgl2", o) ?? c.getContext("webgl", o));
  } catch {
    return false;
  }
}

function chooseMode(): MascotMode {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "poster";
  if (nav.connection?.saveData || (nav.deviceMemory && nav.deviceMemory < 2)) return "poster";
  return hasWebGL() ? "3d" : "poster";
}

export function Mascot({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const [mode, setMode] = useState<MascotMode | null>(null);

  useEffect(() => {
    let test = false;
    let forced: MascotMode | null = null;
    try {
      test = localStorage.getItem("bx-guide-test") === "1";
      // Tests can force a mode (headless browsers only have a software renderer).
      const m = test ? localStorage.getItem("bx-guide-mode") : null;
      forced = m === "3d" || m === "poster" ? m : null;
    } catch {}
    if (navigator.webdriver && !test) return;
    let done = false;
    let timer = 0;
    let idle = 0;
    const events = ["pointerdown", "keydown", "scroll", "touchstart", "pointermove"] as const;
    const start = () => {
      if (done) return;
      done = true;
      cleanup();
      setMode(forced ?? chooseMode());
    };
    const cleanup = () => {
      events.forEach((e) => window.removeEventListener(e, start));
      window.removeEventListener("load", afterLoad);
      clearTimeout(timer);
      if (idle && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
    };
    const whenIdle = () => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(start, { timeout: 4000 });
      else timer = setTimeout(start, 2000) as unknown as number;
    };
    function afterLoad() {
      timer = window.setTimeout(whenIdle, test ? 0 : 1500);
    }
    events.forEach((e) => window.addEventListener(e, start, { once: true, passive: true }));
    if (document.readyState === "complete") afterLoad();
    else window.addEventListener("load", afterLoad, { once: true });
    return cleanup;
  }, []);

  if (!mode || isQuiet(pathname)) return null;
  return <MascotController locale={locale} mode={mode} />;
}
