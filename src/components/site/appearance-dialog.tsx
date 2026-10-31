"use client";
/**
 * The visitor's appearance picker: theme, main color, icon style. Each choice applies at once (and is
 * remembered on this device); every option shows a small preview of itself.
 */
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/brand/icons";
import type { Dictionary } from "@/i18n";
import {
  ACCENT_SWATCH,
  ACCENTS,
  APPEARANCE_KEY,
  applyAppearance,
  DEFAULT_APPEARANCE,
  ICON_STYLES,
  parseAppearance,
  THEME_SWATCH,
  THEMES,
  type Appearance,
} from "@/lib/appearance";
import { cn } from "@/lib/cn";
import { ui, useUi } from "./ui-state";

const PREVIEW_ICONS: IconName[] = ["robotics", "trophy", "calendar", "users", "search"];

function save(a: Appearance) {
  try {
    if (a.theme === DEFAULT_APPEARANCE.theme && a.accent === DEFAULT_APPEARANCE.accent && a.icons === DEFAULT_APPEARANCE.icons) localStorage.removeItem(APPEARANCE_KEY);
    else localStorage.setItem(APPEARANCE_KEY, JSON.stringify(a));
  } catch {
    /* private mode: it still applies for this visit */
  }
}

export function AppearanceDialog({ t }: { t: Dictionary["appearance"] & { close: string } }) {
  const { appearance: open } = useUi();
  const [a, setA] = useState<Appearance>(DEFAULT_APPEARANCE);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(APPEARANCE_KEY);
    } catch {
      /* none */
    }
    setA(parseAppearance(stored));
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  }, [open]);

  // "Automatic" follows the device when it switches between light and dark.
  useEffect(() => {
    if (a.theme !== "auto") return;
    const mq = matchMedia("(prefers-color-scheme: light)");
    const f = () => applyAppearance(a);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [a]);

  const pick = (patch: Partial<Appearance>) => {
    const next = { ...a, ...patch };
    setA(next);
    applyAppearance(next);
    save(next);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
      aria-hidden={!open}
      inert={!open}
      className={cn("fixed inset-0 z-[60] flex items-end justify-center transition-[visibility] duration-300 sm:items-center sm:px-6", open ? "visible" : "invisible")}
      onKeyDown={(e) => e.key === "Escape" && ui.set({ appearance: false })}
      data-testid="appearance"
    >
      <button type="button" tabIndex={-1} aria-label={t.close} onClick={() => ui.set({ appearance: false })} className={cn("absolute inset-0 bg-void/70 backdrop-blur-md transition-opacity duration-300", open ? "opacity-100" : "opacity-0")} />
      <div
        ref={panel}
        className={cn(
          "frame relative max-h-[88svh] w-full max-w-xl overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] transition-[opacity,transform] duration-500 ease-[var(--ease-out-expo)] sm:p-6",
          open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        )}
        style={{ ["--edge" as string]: 0.4 }}
      >
        <div className="mb-1 flex items-center gap-3">
          <Icon name="palette" size={20} className="text-cyan" />
          <h2 className="t-headline me-auto text-xl text-chalk">{t.title}</h2>
          <button type="button" onClick={() => ui.set({ appearance: false })} className="flex size-10 items-center justify-center rounded-md text-mist hover:text-chalk" aria-label={t.close}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <p className="mb-5 text-sm text-fog">{t.intro}</p>

        <Group label={t.theme}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {THEMES.map((k) => {
              const [bg, card, ink] = THEME_SWATCH[k];
              return (
                <Choice key={k} on={a.theme === k} onPick={() => pick({ theme: k })} testid={`theme-${k}`}>
                  <span aria-hidden className="relative mb-2 block h-14 overflow-hidden rounded-md border border-[var(--line)]" style={{ background: bg }}>
                    {k === "auto" && <span className="absolute inset-y-0 end-0 w-1/2" style={{ background: THEME_SWATCH.light[0] }} />}
                    <span className="absolute inset-x-2 top-2 h-1.5 rounded-full opacity-70" style={{ background: ink }} />
                    <span className="absolute start-2 bottom-2 h-5 w-3/5 rounded" style={{ background: card, border: `1px solid ${ink}22` }} />
                    <span className="absolute end-2 bottom-2.5 size-3 rounded-full" style={{ background: ACCENT_SWATCH[a.accent][0] }} />
                  </span>
                  <span className="block text-[0.82rem] leading-tight text-chalk">{t.themes[k]}</span>
                </Choice>
              );
            })}
          </div>
        </Group>

        <Group label={t.accent}>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((k) => (
              <Choice key={k} on={a.accent === k} onPick={() => pick({ accent: k })} testid={`accent-${k}`} compact>
                <span aria-hidden className="block size-6 rounded-full" style={{ background: `linear-gradient(135deg, ${ACCENT_SWATCH[k][0]}, ${ACCENT_SWATCH[k][1]})` }} />
                <span className="text-[0.82rem] text-chalk">{t.accents[k]}</span>
              </Choice>
            ))}
          </div>
        </Group>

        <Group label={t.icons}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {ICON_STYLES.map((k) => (
              <Choice key={k} on={a.icons === k} onPick={() => pick({ icons: k })} testid={`icons-${k}`}>
                <span aria-hidden data-icon-preview={k} className="mb-2 flex items-center justify-between gap-1 text-cyan">
                  {PREVIEW_ICONS.map((n) => (
                    <Icon key={n} name={n} size={20} />
                  ))}
                </span>
                <span className="block text-[0.82rem] text-chalk">{t.iconStyles[k]}</span>
              </Choice>
            ))}
          </div>
        </Group>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-sm" onClick={() => pick(DEFAULT_APPEARANCE)} data-testid="appearance-reset">
            {t.reset}
          </button>
          <button type="button" className="btn btn-primary btn-sm ms-auto" onClick={() => ui.set({ appearance: false })}>
            <span aria-hidden className="btn-sheen" />
            <span>{t.done}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-5">
      <legend className="t-eyebrow mb-2.5 text-[0.62rem] text-fog">{label}</legend>
      <div role="radiogroup" aria-label={label}>
        {children}
      </div>
    </fieldset>
  );
}

function Choice({ on, onPick, children, testid, compact = false }: { on: boolean; onPick: () => void; children: React.ReactNode; testid: string; compact?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      data-testid={testid}
      className={cn(
        "rounded-lg border text-start transition-colors",
        compact ? "flex items-center gap-2 px-2.5 py-1.5" : "block p-2.5",
        on ? "border-volt bg-volt/10 ring-1 ring-volt/60" : "border-[var(--line)] hover:border-[var(--line-2)] hover:bg-panel/60",
      )}
    >
      {children}
    </button>
  );
}
