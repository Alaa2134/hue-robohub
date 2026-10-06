"use client";
import { useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Perspective tilt + pointer light + edge-light intensity (--edge) for `.frame` cards.
 * Mouse only; touch devices get the static design. CSS variables only — no React state per frame.
 */
export function Tilt({ children, className, max = 5, style }: { children: ReactNode; className?: string; max?: number; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  return (
    <div className="[perspective:1400px]">
      <div
        ref={ref}
        style={style}
        className={cn(
          "group/tilt relative h-full transition-transform duration-700 ease-[var(--ease-out-expo)] [transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] [transform-style:preserve-3d] motion-reduce:![transform:none]",
          className,
        )}
        onPointerMove={(e) => {
          if (e.pointerType !== "mouse" || !ref.current) return;
          const el = ref.current;
          const r = el.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width;
          const py = (e.clientY - r.top) / r.height;
          cancelAnimationFrame(raf.current);
          raf.current = requestAnimationFrame(() => {
            el.style.setProperty("--rx", `${(0.5 - py) * max}deg`);
            el.style.setProperty("--ry", `${(px - 0.5) * max}deg`);
            el.style.setProperty("--mx", `${px * 100}%`);
            el.style.setProperty("--my", `${py * 100}%`);
            el.style.setProperty("--edge", "1");
          });
        }}
        onPointerLeave={() => {
          const el = ref.current;
          if (!el) return;
          el.style.setProperty("--rx", "0deg");
          el.style.setProperty("--ry", "0deg");
          el.style.setProperty("--edge", "0");
        }}
      >
        {children}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[3] rounded-[inherit] opacity-0 mix-blend-screen transition-opacity duration-500 group-hover/tilt:opacity-100"
          style={{ background: "radial-gradient(480px circle at var(--mx,50%) var(--my,50%), rgb(56 220 255 / 0.12), transparent 60%)" }}
        />
      </div>
    </div>
  );
}
