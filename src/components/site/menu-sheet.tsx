"use client";
import Link from "next/link";
import { APP_HREF, COMMAND_URL } from "@/lib/deploy";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/brand/icons";
import { Mark } from "@/components/brand/logo";
import { SOCIAL_LABEL, SocialIcon, safeHref } from "@/components/brand/social-icons";
import { cn } from "@/lib/cn";
import { localePath, stripLocale, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n";
import type { SocialConfig } from "@/lib/site-config";
import { MENU_GROUPS, isActive, type NavKey } from "./nav";
import { ui, useUi } from "./ui-state";

export type MenuPreview = { key: NavKey; href: string; image: string | null; caption: string };

/**
 * Full-screen navigation. Desktop: oversized primary list with a live render preview per destination.
 * Phones: a bottom sheet with the same hierarchy, sized for thumbs.
 */
export function MenuSheet({ locale, t, previews, socials, email }: { locale: Locale; t: Dictionary["nav"]; previews: MenuPreview[]; socials: SocialConfig; email: string }) {
  const { menu } = useUi();
  const pathname = usePathname();
  const { path } = stripLocale(pathname);
  const [hover, setHover] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const href = (p: string) => localePath(locale, p);

  useEffect(() => {
    if (!menu) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("a,button")?.focus({ preventScroll: true });
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") ui.set({ menu: false });
      if (e.key === "Tab" && panel.current) {
        const f = [...panel.current.querySelectorAll<HTMLElement>("a,button")].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", on);
    return () => {
      window.removeEventListener("keydown", on);
      prev?.focus?.({ preventScroll: true });
    };
  }, [menu]);

  const socialEntries = (Object.entries(socials) as [keyof SocialConfig, string][]).filter(([, v]) => safeHref(v));
  const current = previews[hover] ?? previews[0];

  return (
    <div
      id="site-menu"
      role="dialog"
      aria-modal="true"
      aria-label={t.menu}
      aria-hidden={!menu}
      inert={!menu}
      className={cn("fixed inset-0 z-40 transition-[visibility] duration-700", menu ? "visible" : "invisible")}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={t.closeMenu}
        onClick={() => ui.set({ menu: false })}
        className={cn("absolute inset-0 bg-void/70 backdrop-blur-sm transition-opacity duration-500 lg:hidden", menu ? "opacity-100" : "opacity-0")}
      />
      <div
        ref={panel}
        className={cn(
          "absolute inset-x-0 bottom-0 flex max-h-[88svh] flex-col overflow-hidden rounded-t-[22px] border-t border-[var(--line-2)] bg-abyss/95 backdrop-blur-2xl transition-transform duration-700 ease-[var(--ease-out-expo)]",
          "lg:inset-0 lg:max-h-none lg:rounded-none lg:border-0 lg:bg-void/97",
          menu ? "translate-y-0 lg:[clip-path:inset(0_0_0_0)]" : "translate-y-full lg:translate-y-0 lg:[clip-path:inset(0_0_100%_0)]",
          "lg:transition-[clip-path]",
        )}
      >
        <div aria-hidden className="grid-lines mask-radial pointer-events-none absolute inset-0 opacity-40" />
        <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-steel lg:hidden" />

        <div className="relative mx-auto grid w-full max-w-[1680px] flex-1 grid-cols-1 gap-8 overflow-y-auto px-5 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-8 lg:grid-cols-12 lg:gap-10 lg:overflow-hidden lg:px-8 lg:pb-10 lg:pt-28">
          {/* Primary destinations */}
          <nav aria-label={t.explore} className="lg:col-span-5 xl:col-span-4">
            <p className="t-eyebrow mb-4 text-fog lg:mb-6">{t.explore}</p>
            <ol className="space-y-0.5 lg:space-y-1">
              {previews.map((p, i) => {
                const active = isActive(path, p.href);
                return (
                  <li key={p.href} onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)}>
                    <Link
                      href={href(p.href)}
                      className={cn(
                        "group flex items-baseline gap-4 py-1.5 transition-colors duration-300 lg:py-1",
                        active ? "text-chalk" : "text-mist hover:text-chalk",
                      )}
                      style={{ transitionDelay: menu ? `${80 + i * 45}ms` : "0ms" }}
                    >
                      <span className="t-data w-7 shrink-0 text-[0.7rem] text-fog transition-colors group-hover:text-cyan">{String(i + 1).padStart(2, "0")}</span>
                      <span
                        className={cn(
                          "t-display text-[2.1rem] transition-transform duration-700 ease-[var(--ease-out-expo)] sm:text-[2.6rem] lg:text-[3.1rem] xl:text-[3.5rem]",
                          menu ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
                          "group-hover:translate-x-2 rtl:group-hover:-translate-x-2",
                        )}
                        style={{ transitionDelay: menu ? `${120 + i * 50}ms` : "0ms", transitionProperty: "transform, opacity" }}
                      >
                        {t[p.key]}
                      </span>
                      {active && <span className="size-1.5 shrink-0 self-center rounded-full bg-cyan shadow-[0_0_10px_var(--color-cyan)]" />}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* Live preview (desktop) */}
          <div className="relative hidden lg:col-span-4 lg:block xl:col-span-5">
            <div className="frame relative h-full max-h-[62vh] overflow-hidden">
              {previews.map((p, i) =>
                p.image ? (
                  <img
                    key={p.href}
                    src={p.image}
                    alt=""
                    loading="lazy"
                    className={cn(
                      "absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-1000 ease-[var(--ease-out-expo)]",
                      i === hover ? "scale-100 opacity-100" : "scale-105 opacity-0",
                    )}
                  />
                ) : null,
              )}
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-void via-void/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 p-6">
                <p className="t-title max-w-sm text-lg text-frost">{current?.caption}</p>
                <span className="t-data text-[0.65rem] text-cyan">{String(hover + 1).padStart(2, "0")} / {String(previews.length).padStart(2, "0")}</span>
              </div>
              <div aria-hidden className="corners absolute inset-3" />
            </div>
          </div>

          {/* Groups, language, command center */}
          <div className="flex flex-col gap-7 lg:col-span-3 lg:gap-8">
            {MENU_GROUPS.map((g) => (
              <div key={g.key}>
                <p className="t-eyebrow mb-3 text-fog">{t[g.key]}</p>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1 lg:grid-cols-1">
                  {g.items.map((n) => (
                    <li key={n.href}>
                      <Link
                        href={href(n.href)}
                        className={cn("flex min-h-10 items-center gap-2.5 text-[0.95rem] transition-colors", isActive(path, n.href) ? "text-chalk" : "text-mist hover:text-chalk")}
                      >
                        {n.icon && <Icon name={n.icon} size={16} className="text-fog" />}
                        {t[n.key]}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-6">
              <Link href={localePath(locale === "en" ? "ar" : "en", path)} hrefLang={locale === "en" ? "ar" : "en"} className="btn btn-sm">
                <Icon name="globe" size={15} />
                <span>{t.language}</span>
              </Link>
              <a href={APP_HREF} className="btn btn-sm">
                <Icon name="grid" size={15} />
                <span>{t.app}</span>
              </a>
              {COMMAND_URL && (
                <Link href={COMMAND_URL} prefetch={false} className="btn btn-sm">
                  <Icon name="lock" size={15} />
                  <span>{t.commandCenter}</span>
                </Link>
              )}
            </div>
            <div className="flex items-center gap-1">
              {socialEntries.map(([k, v]) => (
                <a key={k} href={safeHref(v)!} target="_blank" rel="noopener noreferrer" className="flex size-10 items-center justify-center rounded-md text-fog transition-colors hover:text-chalk" aria-label={SOCIAL_LABEL[k]}>
                  <SocialIcon name={k} />
                </a>
              ))}
              {email && (
                <a href={`mailto:${email}`} className="ms-auto truncate font-mono text-xs text-fog hover:text-chalk">
                  {email}
                </a>
              )}
            </div>
          </div>
        </div>

        <div aria-hidden className="pointer-events-none absolute -bottom-10 end-6 hidden opacity-[0.04] lg:block">
          <Mark tone="white" className="h-[22rem] w-auto" />
        </div>
      </div>
    </div>
  );
}
