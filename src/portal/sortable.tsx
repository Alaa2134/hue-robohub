"use client";

/**
 * A list you reorder by dragging a handle, with a finger or a mouse (pointer events, so it works on
 * phones too), or with the keyboard: focus the handle and press ↑ / ↓. While dragging, the item
 * follows the pointer, the others make room, and the page scrolls near the screen's edges.
 */
import { useRef, useState, type HTMLAttributes, type ReactNode } from "react";

export type HandleProps = HTMLAttributes<HTMLButtonElement> & { "aria-label": string };

type Drag = { from: number; to: number; dy: number; height: number };

export function Sortable<T>({
  items,
  keyOf,
  onMove,
  render,
  gap = 12,
  label = "اسحب عشان ترتّب",
}: {
  items: T[];
  keyOf: (item: T) => string;
  onMove: (from: number, to: number) => void;
  render: (item: T, index: number, handle: HandleProps, dragging: boolean) => ReactNode;
  gap?: number;
  label?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const live = useRef<{ from: number; startY: number; startScroll: number; mids: number[]; height: number; to: number; timer: number } | null>(null);

  const targetFor = (from: number, center: number, mids: number[]) => {
    let to = from;
    for (let i = from + 1; i < mids.length; i++) if (center > mids[i]!) to = i;
    for (let i = from - 1; i >= 0; i--) if (center < mids[i]!) to = i;
    return to;
  };

  const handle = (index: number): HandleProps => ({
    "aria-label": label,
    style: { touchAction: "none", cursor: "grab" },
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      const rows = [...(box.current?.children ?? [])] as HTMLElement[];
      const rects = rows.map((r) => r.getBoundingClientRect());
      const me = rects[index];
      if (!me) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      live.current = { from: index, startY: e.clientY, startScroll: window.scrollY, mids: rects.map((r) => r.top + r.height / 2), height: me.height, to: index, timer: 0 };
      setDrag({ from: index, to: index, dy: 0, height: me.height });
    },
    onPointerMove: (e) => {
      const d = live.current;
      if (!d) return;
      const step = () => {
        // Everything in the positions taken when the drag started (the page may scroll meanwhile).
        const dy = e.clientY - d.startY + (window.scrollY - d.startScroll);
        d.to = targetFor(d.from, d.mids[d.from]! + dy, d.mids);
        setDrag({ from: d.from, to: d.to, dy, height: d.height });
      };
      step();
      // Near the top or bottom of the screen, keep scrolling while the finger stays there.
      window.clearInterval(d.timer);
      const edge = e.clientY < 90 ? -14 : e.clientY > window.innerHeight - 110 ? 14 : 0;
      if (edge)
        d.timer = window.setInterval(() => {
          window.scrollBy(0, edge);
          step();
        }, 16);
    },
    onPointerUp: () => {
      const d = live.current;
      if (!d) return;
      window.clearInterval(d.timer);
      live.current = null;
      setDrag(null);
      if (d.to !== d.from) onMove(d.from, d.to);
    },
    onPointerCancel: () => {
      if (live.current) window.clearInterval(live.current.timer);
      live.current = null;
      setDrag(null);
    },
    onKeyDown: (e) => {
      if (e.key === "ArrowUp" && index > 0) {
        e.preventDefault();
        onMove(index, index - 1);
      } else if (e.key === "ArrowDown" && index < items.length - 1) {
        e.preventDefault();
        onMove(index, index + 1);
      }
    },
  });

  const shift = (i: number) => {
    if (!drag || i === drag.from) return 0;
    const room = drag.height + gap;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -room;
    if (drag.from > drag.to && i < drag.from && i >= drag.to) return room;
    return 0;
  };

  return (
    <div ref={box} className="grid" style={{ gap, gridTemplateColumns: "minmax(0, 1fr)" }}>
      {items.map((item, i) => {
        const me = drag?.from === i;
        return (
          <div
            key={keyOf(item)}
            style={{
              transform: me ? `translateY(${drag!.dy}px) scale(1.01)` : `translateY(${shift(i)}px)`,
              transition: me ? "none" : "transform 180ms ease",
              zIndex: me ? 20 : undefined,
              position: "relative",
              boxShadow: me ? "0 18px 50px -18px rgb(0 0 0 / 0.9)" : undefined,
              borderRadius: me ? 20 : undefined,
            }}
          >
            {render(item, i, handle(i), me)}
          </div>
        );
      })}
    </div>
  );
}

/** Moves one item of a list to another place. */
export function moved<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it as T);
  return next;
}
