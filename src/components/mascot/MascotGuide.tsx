"use client";
/**
 * Baqloz's menu (click him), in two tabs:
 *  - "Talk to me": a chat. He "types", answers appear letter by letter, each answer can be read
 *    aloud and comes with a button to the right page and suggested next questions. The
 *    conversation is kept for the visit, and he remembers what you were talking about.
 *  - "Go to": quick actions (site tour, search, language, back to top), the page's own sections,
 *    every page of the site and how much of it you've explored.
 * Escape closes it and gives focus back; the arrow keys move between options.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/brand/icons";
import { GUIDE_NAME, PAGES, SUGGESTIONS, type PageLink } from "@/config/mascotJourney";
import { useMascot } from "@/hooks/useMascotState";
import { cn } from "@/lib/cn";
import { BASE_PATH } from "@/lib/deploy";
import type { BrainReply } from "@/lib/mascot/brain";
import { ask, rememberedName, type ChatMsg } from "@/lib/mascot/chat";
import type { GuideAction } from "@/lib/mascot/guide";
import { canSpeak } from "@/lib/mascot/voice";
import { pageToc } from "@/lib/mascotScenes";

const COPY = {
  en: { tag: "Your BuildX guide", chat: "Talk to me", explore: "Go to", ask: "Ask Baqloz anything…", send: "Send", here: "On this page", go: "Pages", tour: "Site tour", pagetour: "Tour this page", search: "Search", lang: "عربي", top: "Top", sound: "Baqloz's voice", hide: "Hide Baqloz", close: "Close", on: "On", off: "Off", typing: "Baqloz is typing…", listen: "Read aloud", hello: (n?: string) => `Hi${n ? ` ${n}` : ""}! I'm Baqloz 👋 Ask me anything about BuildX: tracks, competitions, events or joining.`, explored: (a: number, b: number) => `Explored ${a} of ${b} pages` },
  ar: { tag: "مرشدك في BuildX", chat: "اتكلم معايا", explore: "روح على", ask: "اسأل بقلظ أي حاجة…", send: "ابعت", here: "في الصفحة دي", go: "كل الصفحات", tour: "جولة في الموقع", pagetour: "لفّة في الصفحة دي", search: "البحث", lang: "English", top: "لفوق", sound: "صوت بقلظ", hide: "خبّي بقلظ", close: "اقفل", on: "شغّال", off: "مقفول", typing: "بقلظ بيكتب…", listen: "اسمع الرد", hello: (n?: string) => `أهلاً${n ? ` يا ${n}` : ""}! أنا بقلظ 👋 اسألني عن أي حاجة في BuildX: التراكات، المسابقات، الإيفنتات، أو إزاي تنضم.`, explored: (a: number, b: number) => `لفّيت ${a} من ${b} صفحة` },
};

const CHAT_KEY = "bx-guide-chat";
let msgId = Date.now();

function loadChat(): ChatMsg[] {
  try {
    return JSON.parse(sessionStorage.getItem(CHAT_KEY) ?? "[]") as ChatMsg[];
  } catch {
    return [];
  }
}

/** Text that appears letter by letter (all at once with reduced motion). */
function Typed({ text, animate, onDone }: { text: string; animate: boolean; onDone?: () => void }) {
  const [n, setN] = useState(animate ? 0 : text.length);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(text.length);
      done.current?.();
      return;
    }
    const chars = [...text];
    let i = 0;
    const timer = window.setInterval(() => {
      i = Math.min(chars.length, i + 2);
      setN(chars.slice(0, i).join("").length);
      if (i >= chars.length) {
        clearInterval(timer);
        done.current?.();
      }
    }, 22);
    return () => clearInterval(timer);
  }, [text, animate]);
  return <>{text.slice(0, n)}</>;
}

export function MascotGuide({
  locale,
  path,
  anchor,
  explored,
  focusAsk,
  onGo,
  onToc,
  onAction,
  onReply,
  onSpeak,
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
  onReply: (r: BrainReply) => void;
  onSpeak: (text: string) => void;
  onClose: () => void;
  onHide: () => void;
  onSound: () => void;
}) {
  const t = COPY[locale];
  const sound = useMascot((s) => s.sound);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"chat" | "explore">("chat");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>(loadChat);
  const [fresh, setFresh] = useState<number | null>(null);
  const [toc] = useState(() => pageToc());
  const [voice] = useState(canSpeak);
  const suggestions = (SUGGESTIONS.find((s) => s.match.test(path)) ?? SUGGESTIONS[SUGGESTIONS.length - 1]).ask;
  const here = PAGES.find((p) => p.href === path)?.id;

  useEffect(() => {
    try {
      sessionStorage.setItem(CHAT_KEY, JSON.stringify(msgs.slice(-30)));
    } catch {}
    thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  useEffect(() => {
    if (focusAsk || tab === "chat") input.current?.focus();
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
  }, [onClose, focusAsk, tab]);

  const send = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setQ("");
    setTab("chat");
    const mine: ChatMsg = { id: ++msgId, role: "user", text };
    setMsgs((m) => [...m, mine]);
    setBusy(true);
    const started = performance.now();
    try {
      const r = await ask(text, [...msgs, mine], path);
      // A moment of "typing", so it reads like a reply.
      const wait = Math.max(0, 450 + Math.min(900, r.text.length * 6) - (performance.now() - started));
      await new Promise((res) => setTimeout(res, wait));
      const { text: answer, ...reply } = r;
      const bot: ChatMsg = { id: ++msgId, role: "bot", text: answer, reply, ai: r.ai };
      setFresh(bot.id);
      setMsgs((m) => [...m, bot]);
      onReply(r);
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(q);
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
  const last = msgs[msgs.length - 1];
  const chips = (last?.role === "bot" ? last.reply?.followups : null)?.length ? last.reply!.followups : msgs.length ? [] : suggestions.map((s) => s[locale]);
  const actions = [
    ["tour", "rocket", t.tour],
    ["pagetour", "layers", t.pagetour],
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
        "mascot-menu-in pointer-events-auto fixed z-[45] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border border-[var(--line-2)] bg-[rgb(8_20_50/0.97)] text-chalk shadow-[0_30px_80px_-24px_rgb(0_0_0/0.9)] backdrop-blur-2xl",
        anchor.phone && "inset-x-3 bottom-[calc(5.4rem+env(safe-area-inset-bottom))] mx-auto max-h-[calc(100dvh-7.5rem)]",
      )}
      style={style}
    >
      {/* Who */}
      <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
        <span className="relative">
          <img src={`${BASE_PATH}/mascot/poster.webp`} alt="" className="size-11 rounded-2xl bg-white/[0.06] object-cover object-[50%_30%]" />
          <span aria-hidden className="absolute -bottom-0.5 -end-0.5 size-3 rounded-full border-2 border-[rgb(8_20_50)] bg-ok" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold leading-tight">{GUIDE_NAME[locale]}</p>
          <p className="text-xs text-cyan">{t.tag}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t.close} className="flex size-9 items-center justify-center rounded-full text-fog transition hover:bg-white/10 hover:text-chalk">
          <Icon name="close" size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div role="tablist" className="grid grid-cols-2 gap-1 p-2">
        {(
          [
            ["chat", t.chat],
            ["explore", t.explore],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("rounded-xl py-2 text-sm font-semibold transition", tab === k ? "bg-white/[0.08] text-chalk" : "text-fog hover:text-mist")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "chat" ? (
        <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
          <div ref={thread} aria-live="polite" className="min-h-[12rem] flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 pb-2" style={{ maxHeight: anchor.phone ? "42dvh" : "min(46dvh, 26rem)" }}>
            <p className="max-w-[88%] rounded-2xl rounded-ss-md bg-white/[0.06] px-3.5 py-2.5 text-[0.92rem] leading-relaxed text-frost">{t.hello(rememberedName())}</p>
            {msgs.map((m) =>
              m.role === "user" ? (
                <p key={m.id} className="ms-auto w-fit max-w-[85%] rounded-2xl rounded-se-md bg-volt px-3.5 py-2 text-[0.92rem] text-white">
                  {m.text}
                </p>
              ) : (
                <div key={m.id} className="max-w-[90%]">
                  <div className="rounded-2xl rounded-ss-md bg-white/[0.06] px-3.5 py-2.5 text-[0.92rem] leading-relaxed text-frost">
                    <Typed text={m.text} animate={m.id === fresh} onDone={() => m.id === fresh && sound && onSpeak(m.text)} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 ps-1">
                    {m.reply?.label && (m.reply.href || m.reply.action) && (
                      <button
                        type="button"
                        onClick={() => (m.reply!.action ? onAction(m.reply!.action) : onGo({ href: m.reply!.href!, section: m.reply!.section }))}
                        className="inline-flex items-center gap-1 rounded-full border border-cyan/40 px-2.5 py-1 text-xs font-semibold text-cyan transition hover:bg-cyan/10"
                      >
                        {m.reply.label}
                        <Icon name="arrow" size={12} className="rtl:rotate-180" />
                      </button>
                    )}
                    {voice && (
                      <button type="button" onClick={() => onSpeak(m.text)} aria-label={t.listen} title={t.listen} className="flex size-7 items-center justify-center rounded-full text-fog transition hover:bg-white/10 hover:text-chalk">
                        <Icon name="volume" size={14} />
                      </button>
                    )}
                    {m.ai && <span className="text-[0.65rem] text-fog">AI</span>}
                  </div>
                </div>
              ),
            )}
            {busy && (
              <p className="flex w-fit items-center gap-2 rounded-2xl rounded-ss-md bg-white/[0.06] px-3.5 py-2.5 text-xs text-fog">
                <span className="mascot-typing" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                {t.typing}
              </p>
            )}
          </div>
          {!!chips.length && !busy && (
            <div className="flex flex-wrap gap-1.5 px-3 pb-2">
              {chips.map((s) => (
                <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-[var(--line-2)] px-2.5 py-1 text-xs text-mist transition hover:border-cyan/50 hover:text-chalk">
                  {s}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={submit} className="flex gap-2 border-t border-[var(--line)] p-3">
            <label className="sr-only" htmlFor="mascot-ask">
              {t.ask}
            </label>
            <input
              ref={input}
              id="mascot-ask"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.ask}
              maxLength={300}
              autoComplete="off"
              className="min-w-0 flex-1 rounded-xl border border-[var(--line-2)] bg-void/60 px-3 py-2 text-sm text-chalk placeholder:text-fog focus:border-cyan/60 focus:outline-none"
            />
            <button type="submit" disabled={busy || !q.trim()} className="rounded-xl bg-volt px-3.5 text-sm font-semibold text-white transition hover:bg-volt-hi disabled:opacity-50">
              {t.send}
            </button>
          </form>
        </div>
      ) : (
        <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
          <div className="grid grid-cols-2 gap-1.5 px-3">
            {actions.map(([a, icon, label], i) => (
              <button
                key={a}
                type="button"
                data-item
                autoFocus={i === 0}
                onClick={() => onAction(a)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs transition focus-visible:outline-none",
                  a === "tour" && "col-span-2 py-2.5 text-sm",
                  a === "tour" ? "border-volt/50 bg-volt/15 font-semibold text-ice hover:bg-volt/25" : "border-[var(--line)] text-mist hover:border-cyan/40 hover:text-chalk focus-visible:border-cyan/60",
                )}
              >
                <Icon name={icon} size={14} className={a === "top" ? "rotate-180" : undefined} />
                {label}
              </button>
            ))}
          </div>

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

          <div className="mx-3 mt-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
            <div className="flex items-center justify-between text-xs text-mist">
              <span>{t.explored(seen, PAGES.length)}</span>
              {seen === PAGES.length && <span aria-hidden>🏆</span>}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={PAGES.length} aria-valuenow={seen} aria-label={t.explored(seen, PAGES.length)}>
              <div className="h-full rounded-full bg-gradient-to-r from-volt to-cyan transition-[width] duration-700 rtl:bg-gradient-to-l" style={{ width: `${(seen / PAGES.length) * 100}%` }} />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] px-3 py-2 text-sm">
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
