"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Hero camera: scroll drift + pointer parallax written to CSS variables on the section
 * (no React renders per frame). Disabled for reduced motion; pointer parallax only for mice.
 */
export function HeroCamera({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let mx = 0;
    let my = 0;
    let tx = 0;
    let ty = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = !!e?.isIntersecting));
    io.observe(el);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      tx += (mx - tx) * 0.06;
      ty += (my - ty) * 0.06;
      const y = Math.min(window.scrollY, window.innerHeight * 1.2);
      el.style.setProperty("--mx", tx.toFixed(4));
      el.style.setProperty("--my", ty.toFixed(4));
      el.style.setProperty("--sy", y.toFixed(1));
      el.style.setProperty("--sp", (y / window.innerHeight).toFixed(4));
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener("pointermove", move, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", move);
    };
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Lab clock (Africa/Cairo). Server renders a placeholder; the client fills it in. */
export function LabClock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const tick = () => setNow(f.format(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="tabular-nums" suppressHydrationWarning>
      {now ?? "--:--:--"}
    </span>
  );
}

/** Oscilloscope trace — a live-looking signal for the telemetry panel (canvas, ~30 fps, paused off-screen). */
export function Scope({ className, color = "#38dcff" }: { className?: string; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    const size = () => {
      w = c.clientWidth;
      h = c.clientHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(c);
    let raf = 0;
    let last = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = !!e?.isIntersecting));
    io.observe(c);
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible || t - last < 33 || w < 8 || h < 8) return;
      last = t;
      const s = t / 1000;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(120,160,230,0.12)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += w / 8) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const p = x / w;
        const env = Math.sin(p * Math.PI);
        const y =
          h / 2 +
          env *
            h *
            0.36 *
            (Math.sin(p * 18 - s * 4.2) * 0.55 + Math.sin(p * 47 + s * 7.3) * 0.18 + Math.sin(p * 5 - s * 1.3) * 0.27 + (Math.sin(p * 210 + s * 31) > 0.96 ? 0.35 : 0));
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (reduced) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [color]);
  return <canvas ref={ref} aria-hidden className={className} />;
}
