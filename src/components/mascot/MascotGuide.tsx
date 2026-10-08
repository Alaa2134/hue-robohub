"use client";
/**
 * Baqloz's menu (click him): ask him anything (with suggested questions for the page), quick actions
 * (search, switch language, back to top), "on this page" (the page's sections), every page of the
 * site, how much of the site you've explored, and the sound and hide switches. Escape closes it and
 * gives focus back; the arrow keys move between options.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/brand/icons";
import { GUIDE_NAME, PAGES, SUGGESTIONS, type PageLink } from "@/config/mascotJourney";
import { useMascot } from "@/hooks/useMascotState";
import { cn } from "@/lib/cn";
import { BASE_PATH } from "@/lib/deploy";
import { guideProvider, type GuideAction, type GuideAnswer } from "@/lib/mascot/guide";
import { pageToc } from "@/lib/mascotScenes";

const COPY = {
  en: { tag: "Your BuildX guide", ask: "Ask Baqloz anything…", send: "Ask", here: "On this page", go: "Go to", search: "Search", lang: "عربي", top: "Top", sound: "Sound", hide: "Hide Baqloz", close: "Close", on: "On", off: "Off", thinking: "Thinking…", explored: (a: number, b: number) => `Explored ${a} of ${b} pages` },
  ar: { tag: "مرشدك في BuildX", ask: "اسأل بقلظ أي حاجة…", send: "اسأل", here: "في الصفحة دي", go: "روح على", search: "البحث", lang: "English", top: "لفوق", sound: "الصوت", hide: "خبّي بقلظ", close: "اقفل", on: "شغّال", off: "مقفول", thinking: "ثانية بفكّر…", explored: (a: number, b: number) => `لفّيت ${a} من ${b} صفحة` },
};

export function MascotGuide({
  locale,
  path,
  anchor,
  explored,
  focusAsk,
  onGo,
  onToc,
  onAction,
  onAnswer,
  onClose,
  onHide,
  onSound,
}: {
  locale: "en" | "ar";
  path: string;
  anchor: { x: number; y: number; w: number; h: number; phone: boolean };
  explored: string[];
  focusAsk?: boolean;
  onGo: (item: Pick<PageLink, "href" | "section">) => void;
  onToc: (selector: string) => void;
  onAction: (a: GuideAction) => void;
  onAnswer: (a: GuideAnswer) => void;
  onClose: () => void;
  onHide: () => void;
  onSound: () => void;
}) {
  const t = COPY[locale];
  const sound = useMascot((s) => s.sound);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<GuideAnswer | null>(null);
  const [toc] = useState(() => pageToc());
  const suggestions = (SUGGESTIONS.find((s) => s.match.test(path)) ?? SUGGESTIONS[SUGGESTIONS.length - 1]).ask;
  const here = PAGES.find((p) => p.href === path)?.id;

  useEffect(() => {
    if (focusAsk) input.current?.focus();
    else panel.current?.querySelector<HTMLElement>("[data-first]")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
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
  }, [onClose, focusAsk]);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setQ(question);
    setBusy(true);
    try {
      const a = await guideProvider().answer(question.trim(), { locale, path });
      setAnswer(a);
      onAnswer(a);
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(q);
  };

  // Desktop: a popover beside him, towards the middle of the screen, placed once when it opens.
  // Phones: a sheet above the tab bar.
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

  const item = "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start text-mist transition hover:bg-white/[0.06] hover:text-chalk focus-visible:bg-white/[0.06] focus-visible:text-chalk focus-visible:outline-none";
  const heading = "t-eyebrow px-2.5 pb-1 pt-3 text-[0.62rem] text-fog";
  const seen = PAGES.filter((p) => explored.includes(p.id)).length;
  const actions = [
    ["search", "search", t.search],
    ["lang", "globe", t.lang],
    ["top", "chevronDown", t.top],
  ] as const;

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="false"
      aria-label={GUIDE_NAME[locale]}
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={cn(
        "mascot-menu-in pointer-events-auto fixed z-[45] w-[min(23rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-3xl border border-[var(--line-2)] bg-[rgb(8_20_50/0.97)] pb-1 text-chalk shadow-[0_30px_80px_-24px_rgb(0_0_0/0.9)] backdrop-blur-2xl",
        anchor.phone && "inset-x-3 bottom-[calc(5.4rem+env(safe-area-inset-bottom))] mx-auto max-h-[calc(100dvh-7.5rem)]",
      )}
      style={style}
    >
      {/* Who */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--line)] bg-[rgb(8_20_50/0.97)] px-4 py-3">
        <img src={`${BASE_PATH}/mascot/poster.webp`} alt="" className="size-11 rounded-2xl bg-white/[0.06] object-cover object-[50%_30%]" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold leading-tight">{GUIDE_NAME[locale]}</p>
          <p className="text-xs text-cyan">{t.tag}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t.close} className="flex size-9 items-center justify-center rounded-full text-fog transition hover:bg-white/10 hover:text-chalk">
          <Icon name="close" size={16} />
        </button>
      </div>

      {/* Ask */}
      <form onSubmit={submit} className="px-3 pt-3">
        <label className="sr-only" htmlFor="mascot-ask">
          {t.ask}
        </label>
        <div className="flex gap-2">
          <input
            ref={input}
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
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button key={s.en} type="button" onClick={() => void ask(s[locale])} className="rounded-full border border-[var(--line-2)] px-2.5 py-1 text-xs text-mist transition hover:border-cyan/50 hover:text-chalk">
              {s[locale]}
            </button>
          ))}
        </div>
        <div aria-live="polite" className="text-sm">
          {busy && <p className="mt-2 text-fog">{t.thinking}</p>}
          {!busy && answer && (
            <div className="mt-2 rounded-xl bg-white/[0.05] p-3">
              <p className="text-frost">{answer.text[locale]}</p>
              {answer.label && (answer.href || answer.action) && (
                <button
                  type="button"
                  onClick={() => (answer.action ? onAction(answer.action) : onGo({ href: answer.href!, section: answer.section }))}
                  className="mt-2 inline-flex items-center gap-1.5 font-semibold text-cyan hover:text-ice"
                >
                  {answer.label[locale]}
                  <Icon name="arrow" size={13} className="rtl:rotate-180" />
                </button>
              )}
            </div>
          )}
        </div>
      </form>

      {/* Quick actions */}
      <div className="mt-2 grid grid-cols-3 gap-1.5 px-3">
        {actions.map(([a, icon, label], i) => (
          <button
            key={a}
            type="button"
            data-item
            data-first={i === 0 ? "" : undefined}
            onClick={() => onAction(a)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] py-2 text-xs text-mist transition hover:border-cyan/40 hover:text-chalk focus-visible:border-cyan/60 focus-visible:outline-none"
          >
            <Icon name={icon} size={14} className={a === "top" ? "rotate-180" : undefined} />
            {label}
          </button>
        ))}
      </div>

      {/* On this page */}
      {toc.length > 1 && (
        <div className="px-1.5">
          <p className={heading}>{t.here}</p>
          <ul className="grid gap-0.5">
            {toc.map((s) => (
              <li key={s.selector}>
                <button type="button" data-item onClick={() => onToc(s.selector)} className={item}>
                  <span className="size-1.5 shrink-0 rounded-full bg-cyan" />
                  <span className="truncate text-[0.9rem]">{s.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Every page */}
      <div className="px-1.5">
        <p className={heading}>{t.go}</p>
        <ul className="grid grid-cols-2 gap-0.5">
          {PAGES.map((m) => (
            <li key={m.id}>
              <button type="button" data-item onClick={() => onGo(m)} className={cn(item, here === m.id && "text-chalk")} aria-current={here === m.id ? "page" : undefined}>
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg border", m.id === "join" ? "border-volt/60 bg-volt/20 text-volt-hi" : "border-[var(--line-2)] text-cyan")}>
                  <Icon name={m.icon} size={14} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.85rem]">{m.label[locale]}</span>
                {explored.includes(m.id) && <Icon name="check" size={12} className="shrink-0 text-ok" />}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Explored */}
      <div className="mx-3 mt-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
        <div className="flex items-center justify-between text-xs text-mist">
          <span>{t.explored(seen, PAGES.length)}</span>
          {seen === PAGES.length && <span aria-hidden>🏆</span>}
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={PAGES.length} aria-valuenow={seen} aria-label={t.explored(seen, PAGES.length)}>
          <div className="h-full rounded-full bg-gradient-to-r from-volt to-cyan transition-[width] duration-700 rtl:bg-gradient-to-l" style={{ width: `${(seen / PAGES.length) * 100}%` }} />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--line)] px-3 pt-2.5 text-sm">
        <button type="button" data-item onClick={onSound} aria-pressed={sound} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-mist transition hover:bg-white/[0.06] hover:text-chalk">
          <Icon name={sound ? "volume" : "mute"} size={15} />
          {t.sound}: {sound ? t.on : t.off}
        </button>
        <button type="button" data-item onClick={onHide} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-mist transition hover:bg-white/[0.06] hover:text-chalk">
          <Icon name="eye" size={15} />
          {t.hide}
        </button>
      </div>
    </div>
  );
}
