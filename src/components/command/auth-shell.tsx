import Link from "next/link";
import type { ReactNode } from "react";
import { Lockup } from "@/components/brand/logo";
import { Picture } from "@/components/media/picture";
import { art } from "@/lib/media-library";

/** Split-screen access terminal: key art + HUD on the left, the form panel on the right (full-screen on phones). */
export function AuthShell({ title, kicker, children, footer }: { title: string; kicker: string; children: ReactNode; footer?: ReactNode }) {
  const bg = art("hero");
  return (
    <main className="relative grid min-h-[100svh] lg:grid-cols-[1.15fr_1fr]">
      <div aria-hidden className="absolute inset-0 lg:relative">
        {bg && <Picture image={bg} sizes="(min-width:1024px) 55vw, 100vw" decorative priority className="absolute inset-0 h-full w-full" />}
        <div className="absolute inset-0 bg-gradient-to-t from-abyss via-abyss/70 to-abyss/30 lg:bg-gradient-to-r lg:from-transparent lg:via-abyss/20 lg:to-abyss" />
        <div className="scanlines absolute inset-0 opacity-50" />
        <div className="absolute inset-x-0 bottom-0 hidden p-10 lg:block">
          <p className="t-eyebrow text-cyan">Mission control</p>
          <p className="t-display mt-3 max-w-lg text-[3.4rem] text-chalk">Command Center</p>
          <p className="mt-3 max-w-md text-sm text-mist">Members, projects, budgets, inventory, schedules and media — the private operations platform behind BuildX HUE.</p>
          <div className="mt-8 flex gap-8 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-fog">
            <span>
              <span className="me-2 inline-block size-1.5 rounded-full bg-ok align-middle" />
              Secure channel
            </span>
            <span>Argon2id · TOTP · RBAC</span>
            <span>Audit-logged</span>
          </div>
        </div>
      </div>
      <section className="relative flex min-h-[100svh] flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10 lg:bg-abyss lg:px-16">
        <div className="flex items-center justify-between">
          <Lockup size="sm" />
          <Link href="/" className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-fog transition-colors hover:text-chalk">
            ← Public site
          </Link>
        </div>
        <div className="my-auto w-full max-w-[26rem] self-center py-12">
          <div className="frame glass p-7 sm:p-9 lg:!bg-transparent lg:p-0 lg:![box-shadow:none] lg:before:hidden">
            <p className="t-eyebrow text-cyan">{kicker}</p>
            <h1 className="t-headline mt-3 text-3xl text-chalk">{title}</h1>
            <div className="mt-8">{children}</div>
          </div>
          {footer && <div className="mt-6 text-center text-sm text-fog lg:text-start">{footer}</div>}
        </div>
        <p className="text-center font-mono text-[0.6rem] uppercase tracking-[0.2em] text-steel lg:text-start">Authorised members only · Activity is logged</p>
      </section>
    </main>
  );
}
