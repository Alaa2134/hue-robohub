"use client";
import { useEffect, useState } from "react";
import { useInView, useReducedMotion } from "./use-in-view";

export function Counter({ value, duration = 1500, pad = 2, suffix = "", className }: { value: number; duration?: number; pad?: number; suffix?: string; className?: string }) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const reduced = useReducedMotion();
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (!inView || reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setN(Math.round(value * (1 - Math.pow(1 - p, 4))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, value, duration]);
  return (
    <span ref={ref} className={className} aria-label={`${value}${suffix}`}>
      <span aria-hidden className="tabular-nums">
        {String(n ?? value).padStart(pad, "0")}
        {suffix}
      </span>
    </span>
  );
}
