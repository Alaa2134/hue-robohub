"use client";
/**
 * The menu that opens when the mascot is clicked: where to go (scrolls on the home page, otherwise
 * opens the page), a small "ask me" box answered by the guide provider (local matcher by default,
 * see lib/mascot/guide.ts), and the sound and hide switches. Escape closes it and gives focus back.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/brand/icons";
import { MENU, type MenuItem } from "@/config/mascotJourney";
import { useMascot } from "@/hooks/useMascotState";
import { cn } from "@/lib/cn";
import { guideProvider, type GuideAnswer } from "@/lib/mascot/guide";

const COPY = {
  en: { title: "BuildX guide", lead: "Where do you want to go?", ask: "Ask me anything about BuildX", send: "Ask", sound: "Sound", hide: "Hide guide", close: "Close guide", on: "On", off: "Off", thinking: "Thinking…" },
  ar: { title: "مرشد BuildX", lead: "عايز تروح فين؟", ask: "اسألني أي حاجة عن BuildX", send: "اسأل", sound: "الصوت", hide: "إخفاء المرشد", close: "إغلاق المرشد", on: "شغال", off: "مقفول", thinking: "بفكر…" },
};

export function MascotGuide({
  locale,
  path,
  anchor,
  onGo,
  onAnswer,
  onClose,
  onHide,
  onSound,
}: {
  locale: "en" | "ar";
  path: string;
  anchor: { x: number; y: number; w: number; h: number; phone: boolean };
  onGo: (item: Pick<MenuItem, "href" | "section">) => void;
  onAnswer: (a: GuideAnswer) => void;
  onClose: () => void;
  onHide: () => void;
  onSound: () => void;
}) {
  const t = COPY[locale];
  const sound = useMascot((s) => s.sound);
  const panel = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<GuideAnswer | null>(null);

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>("button[data-first]")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      // Arrow keys move between the menu's options.
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = [...(panel.current?.querySelectorAll<HTMLElement>("[data-item]") ?? [])];
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (i < 0) return;
        e.preventDefault();
        items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const ask = async (e: FormEvent) => {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    try {
      const a = await guideProvider().answer(question, { locale, path });
      setAnswer(a);
      onAnswer(a);
    } finally {
      setBusy(false);
    }
  };

  // Desktop: a popover beside the mascot, towards the middle of the screen, placed once when it opens
  // (it doesn't follow the mascot around). Phones: a sheet above the tab bar.
  const [style] = useState(() => {
    if (anchor.phone) return undefined;
    const vw = window.innerWidth;
    const onRight = anchor.x + anchor.w / 2 > vw / 2;
    const lower = anchor.y + anchor.h / 2 > window.innerHeight / 2;
    return {
      ...(lower ? { bottom: 16 } : { top: 84 }),
      maxHeight: "calc(100dvh - 100px)",
      ...(onRight ? { right: Math.max(16, vw - anchor.x - anchor.w * 0.2) } : { left: Math.max(16, anchor.x + anchor.w * 0.8) }),
    };
  });

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="false"
      aria-label={t.title}
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={cn(
        "mascot-menu-in pointer-events-auto fixed z-[45] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-3xl border border-[var(--line-2)] bg-[rgb(8_20_50/0.96)] text-chalk shadow-[0_30px_80px_-24px_rgb(0_0_0/0.9)] backdrop-blur-2xl",
        anchor.phone && "inset-x-3 bottom-[calc(5.4rem+env(safe-area-inset-bottom))] mx-auto max-h-[calc(100dvh-7.5rem)]",
      )}
      style={style}
    >
      <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
        <div>
          <p className="t-eyebrow text-[0.62rem] text-cyan">{t.title}</p>
          <p className="mt-0.5 font-medium">{t.lead}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t.close} className="flex size-9 items-center justify-center rounded-full text-fog transition hover:bg-white/10 hover:text-chalk">
          <Icon name="close" size={16} />
        </button>
      </div>

      <ul className="grid gap-0.5 p-2">
        {MENU.map((m, i) => (
          <li key={m.id}>
            <button
              type="button"
              data-item
              data-first={i === 0 ? "" : undefined}
              onClick={() => onGo(m)}
              className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-mist transition hover:bg-white/[0.06] hover:text-chalk focus-visible:bg-white/[0.06] focus-visible:text-chalk focus-visible:outline-none"
            >
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg border", m.id === "join" ? "border-volt/60 bg-volt/20 text-volt-hi" : "border-[var(--line-2)] text-cyan")}>
                <Icon name={m.icon} size={16} />
              </span>
              <span className="flex-1 text-[0.95rem]">{m.label[locale]}</span>
              <Icon name="arrow" size={14} className="opacity-0 transition group-hover:opacity-100 rtl:rotate-180" />
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={ask} className="border-t border-[var(--line)] p-3">
        <label className="sr-only" htmlFor="mascot-ask">
          {t.ask}
        </label>
        <div className="flex gap-2">
          <input
            id="mascot-ask"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.ask}
            maxLength={200}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-[var(--line-2)] bg-void/60 px-3 py-2 text-sm text-chalk placeholder:text-fog focus:border-cyan/60 focus:outline-none"
          />
          <button type="submit" disabled={busy || !q.trim()} className="rounded-xl bg-volt px-3.5 text-sm font-semibold text-white transition hover:bg-volt-hi disabled:opacity-50">
            {t.send}
          </button>
        </div>
        <div aria-live="polite" className="text-sm">
          {busy && <p className="mt-2 text-fog">{t.thinking}</p>}
          {!busy && answer && (
            <div className="mt-2 rounded-xl bg-white/[0.04] p-3">
              <p className="text-frost">{answer.text[locale]}</p>
              {answer.href && answer.label && (
                <button type="button" onClick={() => onGo({ href: answer.href!, section: answer.section })} className="mt-2 inline-flex items-center gap-1.5 font-semibold text-cyan hover:text-ice">
                  {answer.label[locale]}
                  <Icon name="arrow" size={13} className="rtl:rotate-180" />
                </button>
              )}
            </div>
          )}
        </div>
      </form>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] px-3 py-2.5 text-sm">
        <button type="button" onClick={onSound} aria-pressed={sound} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-mist transition hover:bg-white/[0.06] hover:text-chalk">
          <Icon name={sound ? "volume" : "mute"} size={15} />
          {t.sound}: {sound ? t.on : t.off}
        </button>
        <button type="button" onClick={onHide} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-mist transition hover:bg-white/[0.06] hover:text-chalk">
          <Icon name="eye" size={15} />
          {t.hide}
        </button>
      </div>
    </div>
  );
}
