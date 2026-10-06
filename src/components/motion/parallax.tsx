"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Scroll parallax for decorative/media layers (transform only; off for reduced motion & touch). */
export function Parallax({ children, speed = 0.12, className, scale = 1 }: { children: ReactNode; speed?: number; className?: string; scale?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse)").matches) return;
    let raf = 0;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.parentElement!.getBoundingClientRect();
      const c = r.top + r.height / 2 - window.innerHeight / 2;
      el.style.transform = `translate3d(0, ${(-c * speed).toFixed(1)}px, 0) scale(${scale})`;
    };
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      cancelAnimationFrame(raf);
    };
  }, [speed, scale]);
  return (
    <div ref={ref} className={className} style={{ willChange: "transform", transform: `scale(${scale})` }}>
      {children}
    </div>
  );
}
