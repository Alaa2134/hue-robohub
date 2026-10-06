"use client";
import { Command } from "cmdk";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/brand/icons";
import { Mark, Wordmark } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { ROLE_LABEL, type Role } from "@/lib/permissions";
import { logoutAction } from "@/server/actions/auth";
import type { CmdNavGroup } from "./nav";

type ShellUser = { name: string; email: string; role: Role };
export type QuickAction = { label: string; href: string; icon: Parameters<typeof Icon>[0]["name"] };

function isActive(path: string, href: string) {
  return href === "/command" ? path === "/command" : path === href || path.startsWith(`${href}/`);
}

function Clock() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const tick = () => setT(f.format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="t-data tabular-nums" suppressHydrationWarning>
      {t ?? "--- --:--:--"}
    </span>
  );
}

function NavList({ nav, path, collapsed, onNavigate }: { nav: CmdNavGroup[]; path: string; collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Command Center" className="flex flex-col gap-6">
      {nav.map((g) => (
        <div key={g.label}>
          <p className={cn("t-eyebrow mb-2 px-3 text-[0.56rem] text-steel", collapsed && "sr-only")}>{g.label}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((i) => {
              const active = isActive(path, i.href);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? i.label : undefined}
                    className={cn(
                      "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[0.86rem] transition-colors",
                      active ? "bg-panel-2 text-chalk" : "text-mist hover:bg-panel hover:text-chalk",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    {active && <span aria-hidden className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-cyan shadow-[0_0_10px_var(--color-cyan)]" />}
                    <Icon name={i.icon} size={18} className={cn("shrink-0", active ? "text-cyan" : "text-fog group-hover:text-mist")} />
                    <span className={cn("truncate", collapsed && "sr-only")}>{i.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Palette({ open, onClose, nav, actions }: { open: boolean; onClose: () => void; nav: CmdNavGroup[]; actions: QuickAction[] }) {
  const router = useRouter();
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, onClose]);
  if (!open) return null;
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-void/80 backdrop-blur-md" />
      <Command label="Command palette" className="frame relative w-full max-w-xl overflow-hidden" loop>
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4">
          <Icon name="search" size={18} className="text-cyan" />
          <Command.Input autoFocus placeholder="Jump to a module or action…" className="h-14 w-full bg-transparent text-[0.95rem] text-chalk placeholder:text-fog focus:outline-none" />
          <kbd className="rounded border border-[var(--line-2)] px-1.5 py-0.5 font-mono text-[0.6rem] text-fog">ESC</kbd>
        </div>
        <Command.List className="max-h-[55vh] overflow-y-auto p-2">
          <Command.Empty className="px-4 py-8 text-center text-sm text-fog">No matches.</Command.Empty>
          {actions.length > 0 && (
            <Command.Group heading="Quick actions" className="[&_[cmdk-group-heading]]:t-eyebrow [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[0.56rem] [&_[cmdk-group-heading]]:text-fog">
              {actions.map((a) => (
                <Command.Item key={a.href} value={`action ${a.label}`} onSelect={() => go(a.href)} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-frost data-[selected=true]:bg-panel-2 data-[selected=true]:text-chalk">
                  <Icon name={a.icon} size={16} className="text-cyan" />
                  {a.label}
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {nav.map((g) => (
            <Command.Group key={g.label} heading={g.label} className="[&_[cmdk-group-heading]]:t-eyebrow [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[0.56rem] [&_[cmdk-group-heading]]:text-fog">
              {g.items.map((i) => (
                <Command.Item key={i.href} value={`${i.label} ${i.keywords ?? ""}`} onSelect={() => go(i.href)} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-mist data-[selected=true]:bg-panel-2 data-[selected=true]:text-chalk">
                  <Icon name={i.icon} size={16} />
                  {i.label}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}

/** Mission Control chrome: collapsible sidebar, HUD top bar, ⌘K palette, mobile drawer + bottom bar. */
export function CommandShell({ user, nav, actions, unread, children }: { user: ShellUser; nav: CmdNavGroup[]; actions: QuickAction[]; unread: number; children: ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("rh_cmd_collapsed") === "1");
    } catch {}
  }, []);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  useEffect(() => setDrawer(false), [path]);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("rh_cmd_collapsed", c ? "0" : "1");
      } catch {}
      return !c;
    });
  };
  const current = nav.flatMap((g) => g.items).find((i) => isActive(path, i.href));
  const mobileTabs = nav.flatMap((g) => g.items).filter((i) => ["/command", "/command/tasks", "/command/calendar", "/command/members"].includes(i.href));

  return (
    <div className="min-h-[100svh] bg-abyss text-frost">
      {/* Sidebar (desktop) */}
      <aside className={cn("fixed inset-y-0 start-0 z-40 hidden flex-col border-e border-[var(--line)] bg-void/80 backdrop-blur-xl transition-[width] duration-500 ease-[var(--ease-out-expo)] lg:flex", collapsed ? "w-[4.5rem]" : "w-[16.5rem]")}>
        <div className={cn("flex h-16 shrink-0 items-center gap-3 border-b border-[var(--line)] px-5", collapsed && "justify-center px-0")}>
          <Link href="/command" aria-label="Command Center overview" className="flex items-center gap-3">
            <Mark className="h-7 w-auto" />
            {!collapsed && (
              <span className="flex flex-col gap-1">
                <Wordmark className="h-[0.7rem] w-auto" />
                <span className="font-mono text-[0.5rem] uppercase tracking-[0.3em] text-cyan">Mission Control</span>
              </span>
            )}
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          <NavList nav={nav} path={path} collapsed={collapsed} />
        </div>
        <div className={cn("border-t border-[var(--line)] p-3", collapsed && "px-2")}>
          <div className={cn("flex items-center gap-3 rounded-lg p-2", collapsed && "justify-center")}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-volt to-volt-lo font-display text-sm font-bold text-white">{user.name.slice(0, 1).toUpperCase()}</span>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-chalk">{user.name}</span>
                <span className="block truncate font-mono text-[0.6rem] uppercase tracking-wider text-fog">{ROLE_LABEL[user.role]}</span>
              </span>
            )}
          </div>
          <div className={cn("mt-1 flex gap-1", collapsed && "flex-col")}>
            <form action={logoutAction} className={collapsed ? "" : "flex-1"}>
              <button type="submit" className="flex h-9 w-full items-center justify-center gap-2 rounded-lg text-xs text-fog transition-colors hover:bg-panel hover:text-chalk" title="Sign out">
                <Icon name="external" size={15} />
                {!collapsed && "Sign out"}
              </button>
            </form>
            <button type="button" onClick={toggle} className="flex h-9 w-9 items-center justify-center self-center rounded-lg text-fog hover:bg-panel hover:text-chalk" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              <Icon name="chevron" size={16} className={cn("transition-transform", collapsed ? "" : "rotate-180")} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      <div className={cn("fixed inset-0 z-50 lg:hidden", drawer ? "visible" : "invisible")} aria-hidden={!drawer} inert={!drawer}>
        <button type="button" tabIndex={-1} aria-label="Close menu" onClick={() => setDrawer(false)} className={cn("absolute inset-0 bg-void/70 backdrop-blur-sm transition-opacity", drawer ? "opacity-100" : "opacity-0")} />
        <div className={cn("absolute inset-y-0 start-0 flex w-[82vw] max-w-xs flex-col bg-void transition-transform duration-500 ease-[var(--ease-out-expo)]", drawer ? "translate-x-0" : "-translate-x-full rtl:translate-x-full")} style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="flex h-16 items-center gap-3 border-b border-[var(--line)] px-5">
            <Mark className="h-7 w-auto" />
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.3em] text-cyan">Mission Control</span>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-5">
            <NavList nav={nav} path={path} onNavigate={() => setDrawer(false)} />
          </div>
          <form action={logoutAction} className="border-t border-[var(--line)] p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
            <button type="submit" className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-mist hover:bg-panel">
              <Icon name="external" size={16} />
              Sign out · {user.name}
            </button>
          </form>
        </div>
      </div>

      <div className={cn("transition-[padding] duration-500 ease-[var(--ease-out-expo)]", collapsed ? "lg:ps-[4.5rem]" : "lg:ps-[16.5rem]")}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-abyss/80 backdrop-blur-xl" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button type="button" onClick={() => setDrawer(true)} className="-ms-1 flex size-10 items-center justify-center rounded-lg text-mist hover:bg-panel lg:hidden" aria-label="Open menu">
              <Icon name="menu" size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="t-eyebrow hidden text-[0.56rem] text-fog sm:block">Command Center</p>
              <p className="truncate font-display text-[0.95rem] font-semibold text-chalk [font-stretch:110%]">{current?.label ?? "Command Center"}</p>
            </div>
            <button type="button" onClick={() => setPalette(true)} className="hidden h-9 items-center gap-3 rounded-lg border border-[var(--line)] bg-deep/60 px-3 text-sm text-fog transition-colors hover:border-[var(--line-2)] hover:text-mist md:flex">
              <Icon name="search" size={15} />
              <span>Search modules & actions</span>
              <kbd className="rounded border border-[var(--line-2)] px-1.5 font-mono text-[0.6rem]">⌘K</kbd>
            </button>
            <button type="button" onClick={() => setPalette(true)} className="flex size-10 items-center justify-center rounded-lg text-mist hover:bg-panel md:hidden" aria-label="Search">
              <Icon name="search" size={19} />
            </button>
            <div className="hidden items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-1.5 text-[0.7rem] text-fog xl:flex">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-ok" />
              <span className="font-mono uppercase tracking-wider">Cairo</span>
              <Clock />
            </div>
            <Link href="/command/notifications" className="relative flex size-10 items-center justify-center rounded-lg text-mist hover:bg-panel" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
              <Icon name="bolt" size={19} />
              {unread > 0 && <span className="absolute end-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-volt px-1 font-mono text-[0.55rem] text-white">{unread > 9 ? "9+" : unread}</span>}
            </Link>
          </div>
        </header>
        <main id="main" className="px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>
      </div>

      {/* Mobile bottom bar */}
      <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-void/90 backdrop-blur-xl lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <ul className="grid h-16 grid-cols-5">
          {mobileTabs.map((i) => {
            const active = isActive(path, i.href);
            return (
              <li key={i.href}>
                <Link href={i.href} aria-current={active ? "page" : undefined} className={cn("flex h-full flex-col items-center justify-center gap-1 text-[0.6rem]", active ? "text-chalk" : "text-fog")}>
                  <Icon name={i.icon} size={20} className={active ? "text-cyan" : ""} />
                  {i.label.split(" ")[0]}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setDrawer(true)} className="flex h-full w-full flex-col items-center justify-center gap-1 text-[0.6rem] text-fog">
              <Icon name="grid" size={20} />
              More
            </button>
          </li>
        </ul>
      </nav>

      <Palette open={palette} onClose={() => setPalette(false)} nav={nav} actions={actions} />
    </div>
  );
}
