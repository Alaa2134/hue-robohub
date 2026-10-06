"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";

export type WallImage = { id: string; src: string; srcSet: string; thumb: string; alt: string; caption: string; tag: string; w: number; h: number; placeholder?: string | null };

/** Editorial media wall + accessible lightbox (←/→/Esc, swipe, focus return). */
export function MediaWallGrid({ items, labels }: { items: WallImage[]; labels: { close: string; prev: string; next: string } }) {
  const [open, setOpen] = useState<number | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const spans = ["sm:col-span-2 sm:row-span-2", "", "sm:row-span-2", "", "", "sm:col-span-2", "", ""];
  return (
    <>
      <ul className="grid auto-rows-[10.5rem] grid-cols-2 gap-3 sm:auto-rows-[13rem] sm:grid-cols-4 sm:gap-4 lg:auto-rows-[15rem]">
        {items.map((it, i) => (
          <li key={it.id} className={cn("group relative overflow-hidden rounded-[14px]", spans[i % spans.length])}>
            <button
              type="button"
              onClick={(e) => {
                opener.current = e.currentTarget;
                setOpen(i);
              }}
              className="absolute inset-0 h-full w-full"
              aria-label={it.caption || it.alt}
            >
              <img src={it.thumb} srcSet={it.srcSet} sizes="(min-width:640px) 40vw, 50vw" alt={it.alt} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-[var(--ease-out-expo)] group-hover:scale-[1.05]" style={it.placeholder ? { backgroundImage: `url("${it.placeholder}")`, backgroundSize: "cover" } : undefined} />
              <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-void/85 via-transparent to-transparent opacity-70 transition-opacity group-hover:opacity-100" />
              <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 text-start sm:p-4">
                <span className="line-clamp-2 text-xs text-frost sm:text-sm">{it.caption}</span>
                <span className="t-eyebrow shrink-0 text-[0.5rem] text-fog">{it.tag}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open !== null && <Lightbox items={items} index={open} onIndex={setOpen} onClose={() => { setOpen(null); opener.current?.focus(); }} labels={labels} />}
    </>
  );
}

function Lightbox({ items, index, onIndex, onClose, labels }: { items: WallImage[]; index: number; onIndex: (i: number) => void; onClose: () => void; labels: { close: string; prev: string; next: string } }) {
  const n = items.length;
  const it = items[index]!;
  const go = useCallback((d: number) => onIndex((index + d + n) % n), [index, n, onIndex]);
  const touch = useRef<number | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    document.documentElement.setAttribute("data-locked", "");
    closeBtn.current?.focus();
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(document.dir === "rtl" ? -1 : 1);
      else if (e.key === "ArrowLeft") go(document.dir === "rtl" ? 1 : -1);
    };
    window.addEventListener("keydown", on);
    return () => {
      window.removeEventListener("keydown", on);
      document.documentElement.removeAttribute("data-locked");
    };
  }, [go, onClose]);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={it.caption || it.alt}
      className="fixed inset-0 z-[90] flex flex-col bg-void/95 backdrop-blur-xl"
      onTouchStart={(e) => (touch.current = e.touches[0]!.clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0]!.clientX - touch.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touch.current = null;
      }}
    >
      <div className="flex items-center justify-between gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <span className="font-mono text-xs text-fog" dir="ltr">
          {String(index + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
        </span>
        <button ref={closeBtn} type="button" onClick={onClose} className="btn btn-icon" aria-label={labels.close}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 py-4 sm:px-16">
        <img key={it.id} src={it.src} srcSet={it.srcSet} sizes="100vw" alt={it.alt} className="enter max-h-full max-w-full rounded-lg object-contain" />
        <button type="button" onClick={() => go(-1)} className="btn btn-icon absolute start-3 top-1/2 hidden -translate-y-1/2 sm:inline-flex" aria-label={labels.prev}>
          <Icon name="chevron" size={18} className="rotate-180 rtl:rotate-0" />
        </button>
        <button type="button" onClick={() => go(1)} className="btn btn-icon absolute end-3 top-1/2 hidden -translate-y-1/2 sm:inline-flex" aria-label={labels.next}>
          <Icon name="chevron" size={18} className="rtl:rotate-180" />
        </button>
      </div>
      <p className="mx-auto max-w-3xl px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-sm text-mist">{it.caption}</p>
    </div>,
    document.body,
  );
}
