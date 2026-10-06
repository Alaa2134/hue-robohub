"use client";
import { createElement, Fragment, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useInView } from "./use-in-view";

type As = "div" | "li" | "section" | "article" | "span" | "p" | "header" | "figure";

export function Reveal({ children, className, delay = 0, as = "div", style }: { children: ReactNode; className?: string; delay?: number; as?: As; style?: CSSProperties }) {
  const { ref, inView } = useInView<HTMLElement>();
  return createElement(as, { ref, className: cn("reveal", className), "data-in": inView, style: { ...style, ["--d" as string]: `${delay}ms` } }, children);
}

/** Masked word-by-word headline reveal; the sentence stays a single string for assistive tech. */
export function MaskText({ text, delay = 0, stagger = 40, className }: { text: string; delay?: number; stagger?: number; className?: string }) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <span ref={ref} className={className} data-in={inView}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((w, i) => (
          <Fragment key={i}>
            <span className="mask-word" style={{ ["--d" as string]: `${delay + i * stagger}ms` }}>
              <span>{w}</span>
            </span>
            {i < words.length - 1 ? " " : null}
          </Fragment>
        ))}
      </span>
    </span>
  );
}

export function ClipReveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={cn("clip-reveal", className)} data-in={inView} style={{ ["--d" as string]: `${delay}ms` }}>
      {children}
    </div>
  );
}
