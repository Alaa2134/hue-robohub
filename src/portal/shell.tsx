"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Mark } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { Button, Card, Icon, type IconKey } from "./ui";
import { appMode, isNative } from "./core";

export type Tab = { href: string; label: string; icon: IconKey; match: (path: string[]) => boolean };

/** Phone-first frame: scrolling content above a fixed bottom tab bar. */
export function AppShell({ tabs, path, children }: { tabs: Tab[]; path: string[]; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-abyss bg-[radial-gradient(120%_60%_at_50%_-10%,rgb(43_109_255/0.14),transparent_60%)]">
      <main className="mx-auto max-w-3xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-6">{children}</main>
      <nav aria-label="التنقل" className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[#081634]/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl print:hidden">
        <div className="mx-auto flex max-w-3xl">
          {tabs.map((t) => {
            const on = t.match(path);
            return (
              <a
                key={t.href}
                href={`#${t.href}`}
                aria-current={on ? "page" : undefined}
                className={cn("relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition", on ? "text-chalk" : "text-fog hover:text-mist")}
              >
                {on && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-gradient-to-l from-cyan to-volt" />}
                <Icon name={t.icon} size={22} className={on ? "text-cyan" : undefined} />
                {t.label}
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

const APP_NAME = { student: "HUE", staff: "Team" } as const;

export function BrandLine({ className }: { className?: string }) {
  // The store apps carry their own names (read after mount, so the prerendered page still matches).
  const [name, setName] = useState("App");
  useEffect(() => {
    const mode = appMode();
    if (mode) setName(APP_NAME[mode]);
  }, []);
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Mark className="h-7 w-auto" />
      <span className="font-display text-[15px] font-semibold tracking-wide text-chalk" dir="ltr">
        BuildX <span className="text-cyan">{name}</span>
      </span>
    </div>
  );
}

/* ─── Install as an app (Android prompt, iPhone instructions) ──────────── */

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<unknown> };
let deferredInstall: InstallEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e as InstallEvent;
    window.dispatchEvent(new Event("rh-installable"));
  });
}

export function useInstall() {
  const [state, setState] = useState({ can: false, ios: false, standalone: true });
  useEffect(() => {
    const update = () =>
      setState({
        can: !!deferredInstall,
        ios: /iphone|ipad|ipod/i.test(navigator.userAgent),
        // The store apps are already installed.
        standalone: isNative() || window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true,
      });
    update();
    window.addEventListener("rh-installable", update);
    return () => window.removeEventListener("rh-installable", update);
  }, []);
  const install = async () => {
    if (!deferredInstall) return;
    await deferredInstall.prompt();
    deferredInstall = null;
    setState((s) => ({ ...s, can: false }));
  };
  return { ...state, install };
}

export function InstallCard() {
  const { can, ios, standalone, install } = useInstall();
  if (standalone || (!can && !ios)) return null;
  return (
    <Card className="flex items-center gap-3 border-cyan/25 bg-cyan/[0.06]">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-cyan/15 text-cyan">
        <Icon name="install" size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-chalk">ثبّت التطبيق على موبايلك</p>
        <p className="text-xs leading-relaxed text-fog">
          {can ? "يفتح بسرعة من الشاشة الرئيسية ويعمل حتى مع إنترنت ضعيف." : "في Safari اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»."}
        </p>
      </div>
      {can && (
        <Button size="sm" variant="primary" onClick={install}>
          تثبيت
        </Button>
      )}
    </Card>
  );
}
