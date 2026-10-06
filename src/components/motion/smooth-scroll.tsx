"use client";
import { useEffect } from "react";

/** Inertial scrolling on desktop pointers only; native scrolling on touch and reduced motion. */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse)").matches) return;
    let lenis: { destroy: () => void; raf: (t: number) => void } | undefined;
    let raf = 0;
    import("lenis").then(({ default: Lenis }) => {
      lenis = new Lenis({ lerp: 0.12, smoothWheel: true });
      (window as unknown as { __lenis?: unknown }).__lenis = lenis;
      const loop = (t: number) => {
        lenis!.raf(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(raf);
      lenis?.destroy();
      delete (window as unknown as { __lenis?: unknown }).__lenis;
    };
  }, []);
  return null;
}
