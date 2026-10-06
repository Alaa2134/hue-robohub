"use client";
import Link from "next/link";
import { APP_HREF, COMMAND_URL } from "@/lib/deploy";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Lockup } from "@/components/brand/logo";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import { localePath, stripLocale, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n";
import { PRIMARY_NAV, isActive } from "./nav";
import { ui, useUi } from "./ui-state";

/**
 * Site header: transparent over cinematic heroes, glass once scrolled, tucks away while reading down
 * and returns on the first upward scroll. A hairline progress bar tracks reading position.
 */
export function Header({ locale, t }: { locale: Locale; t: Dictionary["nav"] }) {
  const pathname = usePathname();
  const { path } = stripLocale(pathname);
  const { menu } = useUi();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let last = window.scrollY;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        setScrolled(y > 12);
        if (Math.abs(y - last) > 8) {
          setHidden(y > last && y > 220);
          last = y;
        }
        const max = document.documentElement.scrollHeight - window.innerHeight;
        bar.current?.style.setProperty("transform", `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`);
      });
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => {
      window.removeEventListener("scroll", on);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el?.closest("input, textarea, select, [contenteditable='true']");
      if ((e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        ui.set({ search: true, menu: false });
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  // Close overlays on navigation.
  useEffect(() => {
    if (ui.get().menu || ui.get().search) ui.set({ menu: false, search: false });
  }, [pathname]);

  const href = (p: string) => localePath(locale, p);
  const other: Locale = locale === "en" ? "ar" : "en";

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[transform,background-color,border-color] duration-500 ease-[var(--ease-out-expo)]",
        "border-b border-transparent",
        scrolled && !menu && "border-[var(--line)] bg-[rgb(1_3_9/0.74)] backdrop-blur-xl backdrop-saturate-150",
        hidden && !menu && "-translate-y-full",
      )}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {!scrolled && <div aria-hidden className="pointer-events-none absolute inset-0 -bottom-10 bg-gradient-to-b from-void/80 to-transparent" />}
      <div className="relative mx-auto flex h-[3.75rem] max-w-[1680px] items-center gap-4 px-4 sm:px-6 lg:h-[4.5rem] lg:px-8">
        <Link href={href("/")} aria-label="BuildX HUE — home" className="relative z-10 -m-1 rounded p-1">
          <Lockup size="sm" className="lg:hidden" />
          <Lockup className="hidden lg:flex" />
        </Link>

        <nav aria-label="Primary" className="ms-4 hidden items-center xl:flex 2xl:ms-10">
          {PRIMARY_NAV.map((n) => {
            const active = isActive(path, n.href);
            return (
              <Link
                key={n.href}
                href={href(n.href)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative px-3 py-3 font-display text-[0.7rem] font-semibold uppercase tracking-[0.15em] [font-stretch:112%] transition-colors duration-300 2xl:px-4 rtl:text-[0.85rem] rtl:tracking-normal",
                  active ? "text-chalk" : "text-mist hover:text-chalk",
                )}
              >
                {t[n.key]}
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-3 -bottom-px h-[2px] origin-center bg-gradient-to-r from-volt via-cyan to-volt transition-transform duration-500 ease-[var(--ease-out-expo)] 2xl:inset-x-4",
                    active ? "scale-x-100 shadow-[0_0_12px_rgb(56_220_255/0.9)]" : "scale-x-0 group-hover:scale-x-50",
                  )}
                />
              </Link>
            );
          })}
        </nav>

        <div className="ms-auto flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => ui.set({ search: true, menu: false })}
            className="group flex h-10 items-center gap-2.5 rounded-md px-2.5 text-mist transition-colors hover:text-chalk"
            aria-label={t.search}
          >
            <Icon name="search" size={19} />
            <kbd className="hidden rounded border border-[var(--line-2)] px-1.5 py-0.5 font-mono text-[0.6rem] tracking-wider text-fog 2xl:inline">⌘K</kbd>
          </button>
          <Link
            href={localePath(other, path)}
            hrefLang={other}
            lang={other}
            aria-label={t.switchLanguage}
            className="hidden h-10 min-w-10 items-center justify-center rounded-md px-2 font-display text-[0.8rem] font-semibold text-mist transition-colors hover:text-chalk sm:flex"
          >
            {locale === "en" ? "ع" : "EN"}
          </Link>
          {COMMAND_URL && (
            <Link href={COMMAND_URL} className="btn btn-sm hidden lg:inline-flex" prefetch={false}>
              <Icon name="lock" size={15} />
              <span className="hidden 2xl:inline">{t.commandCenter}</span>
              <span className="2xl:hidden">CC</span>
            </Link>
          )}
          <a href={APP_HREF} className="btn btn-sm hidden lg:inline-flex">
            <Icon name="grid" size={15} />
            <span>{t.app}</span>
          </a>
          <Link href={href("/join")} className="btn btn-primary btn-sm hidden md:inline-flex">
            <span aria-hidden className="btn-sheen" />
            <span>{t.join}</span>
          </Link>
          <button
            type="button"
            onClick={() => ui.set({ menu: !menu, search: false })}
            aria-expanded={menu}
            aria-controls="site-menu"
            aria-label={menu ? t.closeMenu : t.openMenu}
            className="relative flex size-11 items-center justify-center rounded-md text-chalk"
          >
            <span aria-hidden className="relative block h-3 w-6">
              <span className={cn("absolute inset-x-0 top-0 h-[1.5px] bg-current transition-transform duration-500 ease-[var(--ease-out-expo)]", menu && "translate-y-[5.25px] rotate-45")} />
              <span
                className={cn(
                  "absolute bottom-0 h-[1.5px] bg-current transition-all duration-500 ease-[var(--ease-out-expo)] end-0",
                  menu ? "w-full -translate-y-[5.25px] -rotate-45" : "w-4",
                )}
              />
            </span>
          </button>
        </div>
      </div>
      <div aria-hidden className={cn("absolute inset-x-0 -bottom-px h-px overflow-hidden transition-opacity", scrolled && !menu ? "opacity-100" : "opacity-0")}>
        <div ref={bar} className="h-full origin-left bg-gradient-to-r from-volt to-cyan rtl:origin-right" style={{ transform: "scaleX(0)" }} />
      </div>
    </header>
  );
}
