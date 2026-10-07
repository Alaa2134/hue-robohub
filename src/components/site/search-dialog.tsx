"use client";
import { STATIC_SITE } from "@/lib/deploy";
import { searchLive } from "@/lib/site-content";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import { localePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n";
import { ui, useUi } from "./ui-state";

export type SearchSeed = { title: string; subtitle: string; href: string; kind: "page" | "track" | "team" };
type Hit = { type: string; title: string; subtitle: string; href: string };

const TYPE_ICON: Record<string, IconName> = {
  page: "grid",
  track: "layers",
  team: "flag",
  member: "users",
  project: "cpu",
  event: "calendar",
  article: "news",
  resource: "book",
  achievement: "trophy",
};

function norm(s: string) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** ⌘K command palette: instant local matches (pages, tracks, teams) + debounced full-text search. */
export function SearchDialog({ locale, t, seeds }: { locale: Locale; t: Dictionary["search"] & { close: string }; seeds: SearchSeed[] }) {
  const { search: open } = useUi();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) {
      setSel(0);
      requestAnimationFrame(() => input.current?.focus());
    } else {
      setQ("");
      setRemote([]);
    }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRemote([]);
      setLoading(false);
      return;
    }
    const ctl = new AbortController();
    let alive = true;
    setLoading(true);
    const id = setTimeout(() => {
      // The static site searches the content published from the BuildX App straight from Supabase.
      const load: Promise<Hit[]> = STATIC_SITE
        ? searchLive(term, locale)
        : fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
            .then((r) => (r.ok ? r.json() : { results: [] }))
            .then((d: { results?: Hit[] }) => d.results ?? []);
      load
        .then((r) => alive && setRemote(r))
        .catch(() => {})
        .finally(() => alive && setLoading(false));
    }, STATIC_SITE ? 250 : 160);
    return () => {
      alive = false;
      clearTimeout(id);
      ctl.abort();
    };
  }, [q, locale]);

  const local = useMemo(() => {
    const term = norm(q.trim());
    if (!term) return seeds.filter((s) => s.kind === "page").slice(0, 8);
    return seeds.filter((s) => norm(`${s.title} ${s.subtitle}`).includes(term)).slice(0, 8);
  }, [q, seeds]);

  const items = useMemo(
    () => [
      ...local.map((s) => ({ type: s.kind, title: s.title, subtitle: s.subtitle, href: s.href, external: false })),
      ...remote.map((h) => ({ ...h, external: /^https?:/.test(h.href) })),
    ],
    [local, remote],
  );

  useEffect(() => setSel(0), [q]);

  function go(i: number) {
    const it = items[i];
    if (!it) return;
    ui.set({ search: false });
    if (it.external) window.open(it.href, "_blank", "noopener,noreferrer");
    else router.push(localePath(locale, it.href));
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") ui.set({ search: false });
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(sel);
    }
  }

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
      aria-hidden={!open}
      inert={!open}
      className={cn("fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[max(4.5rem,env(safe-area-inset-top))] transition-[visibility] duration-300 sm:px-6 sm:pt-[12vh]", open ? "visible" : "invisible")}
      onKeyDown={onKey}
    >
      <button type="button" tabIndex={-1} aria-label={t.close} onClick={() => ui.set({ search: false })} className={cn("absolute inset-0 bg-void/75 backdrop-blur-md transition-opacity duration-300", open ? "opacity-100" : "opacity-0")} />
      <div
        className={cn(
          "frame relative w-full max-w-2xl overflow-hidden transition-[opacity,transform] duration-500 ease-[var(--ease-out-expo)]",
          open ? "translate-y-0 scale-100 opacity-100" : "-translate-y-3 scale-[0.98] opacity-0",
        )}
        style={{ ["--edge" as string]: 0.4 }}
      >
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 sm:px-5">
          <Icon name="search" size={19} className="shrink-0 text-cyan" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.placeholder}
            aria-label={t.placeholder}
            aria-controls="search-results"
            aria-activedescendant={items[sel] ? `sr-${sel}` : undefined}
            role="combobox"
            aria-expanded="true"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            className="h-14 w-full bg-transparent text-base text-chalk placeholder:text-fog focus:outline-none sm:h-16 sm:text-lg"
          />
          {loading && <span aria-hidden className="size-1.5 animate-pulse-dot rounded-full bg-cyan" />}
          <kbd className="hidden rounded border border-[var(--line-2)] px-1.5 py-0.5 font-mono text-[0.6rem] text-fog sm:block">ESC</kbd>
        </div>
        <ul ref={list} id="search-results" role="listbox" className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
          {items.length === 0 && q.trim().length >= 2 && !loading && <li className="px-4 py-10 text-center text-sm text-fog">{t.empty}</li>}
          {items.map((it, i) => (
            <li key={`${it.type}:${it.href}:${i}`} id={`sr-${i}`} role="option" aria-selected={sel === i} data-i={i}>
              <button
                type="button"
                onPointerMove={() => setSel(i)}
                onClick={() => go(i)}
                className={cn("flex w-full items-center gap-3.5 rounded-lg px-3 py-2.5 text-start transition-colors", sel === i ? "bg-panel-2" : "hover:bg-panel")}
              >
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md border", sel === i ? "border-volt/60 text-cyan" : "border-[var(--line)] text-fog")}>
                  <Icon name={TYPE_ICON[it.type] ?? "grid"} size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.95rem] text-chalk">{it.title}</span>
                  {it.subtitle && <span className="block truncate text-xs text-fog">{it.subtitle}</span>}
                </span>
                <span className="t-eyebrow hidden shrink-0 text-[0.58rem] text-fog sm:block">{t.types[it.type as keyof typeof t.types] ?? it.type}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-2.5 font-mono text-[0.62rem] uppercase tracking-wider text-fog">
          <span>↑↓ · ↵</span>
          <span>{t.hint}</span>
        </div>
      </div>
    </div>
  );
}
