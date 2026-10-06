"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import { localePath, stripLocale, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n";
import { TAB_BAR, isActive } from "./nav";
import { ui, useUi } from "./ui-state";

/** Phone navigation that behaves like a native app tab bar (safe-area aware, thumb-reachable). */
export function TabBar({ locale, t }: { locale: Locale; t: Dictionary["nav"] }) {
  const pathname = usePathname();
  const { path } = stripLocale(pathname);
  const { menu } = useUi();
  return (
    <nav
      aria-label={t.menu}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--line)] bg-[rgb(5_14_38/0.86)] backdrop-blur-2xl backdrop-saturate-150 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid h-[4.25rem] max-w-lg grid-cols-5 items-stretch px-1.5">
        {TAB_BAR.map((n) => {
          if (n.key === "join") {
            return (
              <li key={n.key} className="flex items-center justify-center">
                <Link
                  href={localePath(locale, n.href)}
                  className="group relative -mt-5 flex size-[3.6rem] flex-col items-center justify-center text-white"
                  aria-label={t.join}
                >
                  <span aria-hidden className="chamfer absolute inset-0 bg-gradient-to-b from-[#8db4ff] via-volt to-volt-lo [--c:12px]" />
                  <span aria-hidden className="chamfer absolute inset-px bg-gradient-to-b from-[#3d7dff] to-[#1b4fd6] [--c:11.6px]" />
                  <span aria-hidden className="absolute -inset-3 -z-10 rounded-full bg-volt/30 blur-xl" />
                  <Icon name="plus" size={22} className="relative transition-transform duration-500 group-active:rotate-90" />
                  <span className="relative mt-0.5 font-display text-[0.5rem] font-bold uppercase tracking-[0.18em] rtl:tracking-normal rtl:text-[0.6rem]">{locale === "ar" ? "انضم" : "Join"}</span>
                </Link>
              </li>
            );
          }
          const isMenu = n.key === "menu";
          const active = isMenu ? menu : !menu && isActive(path, n.href);
          const body = (
            <>
              <span aria-hidden className={cn("absolute top-0 h-[2px] w-6 rounded-full bg-cyan shadow-[0_0_10px_var(--color-cyan)] transition-opacity", active ? "opacity-100" : "opacity-0")} />
              <Icon name={isMenu && menu ? "close" : n.icon!} size={21} />
              <span className="text-[0.62rem] font-medium tracking-wide">{t[n.key]}</span>
            </>
          );
          const cls = cn("relative flex h-full w-full flex-col items-center justify-center gap-1 transition-colors", active ? "text-chalk" : "text-fog active:text-mist");
          return (
            <li key={n.key}>
              {isMenu ? (
                <button type="button" onClick={() => ui.set({ menu: !menu, search: false })} aria-expanded={menu} aria-controls="site-menu" className={cls}>
                  {body}
                </button>
              ) : (
                <Link href={localePath(locale, n.href)} aria-current={active ? "page" : undefined} className={cls}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
