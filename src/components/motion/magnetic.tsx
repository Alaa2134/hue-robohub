"use client";
import { useRef, type ReactNode } from "react";

/** Magnetic pull toward the pointer (mouse only). */
export function Magnetic({ children, strength = 0.25, className }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  return (
    <div
      ref={ref}
      className={className}
      style={{ display: "inline-flex", transition: "transform .6s var(--ease-out-expo)", willChange: "transform" }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse" || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * strength;
        const y = (e.clientY - r.top - r.height / 2) * strength;
        cancelAnimationFrame(raf.current);
        raf.current = requestAnimationFrame(() => ref.current && (ref.current.style.transform = `translate3d(${x}px,${y}px,0)`));
      }}
      onPointerLeave={() => ref.current && (ref.current.style.transform = "")}
    >
      {children}
    </div>
  );
}
