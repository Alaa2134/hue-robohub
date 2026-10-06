import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/brand/icons";
import { cn } from "@/lib/cn";

/* ─── Page structure ─────────────────────────────────────────────────────── */

export function PageHeader({ kicker, title, description, actions, className }: { kicker?: ReactNode; title: string; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {kicker && <p className="t-eyebrow text-[0.6rem] text-cyan">{kicker}</p>}
        <h1 className="t-headline mt-2 text-[clamp(1.6rem,3vw,2.3rem)] text-chalk">{title}</h1>
        {description && <div className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ title, kicker, action, children, className, padded = true, id }: { title?: ReactNode; kicker?: string; action?: ReactNode; children: ReactNode; className?: string; padded?: boolean; id?: string }) {
  return (
    <section id={id} className={cn("rounded-2xl border border-[var(--line)] bg-[linear-gradient(180deg,rgb(14_26_48/0.55),rgb(6_12_24/0.7))] shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-3.5">
          <div className="min-w-0">
            {kicker && <p className="t-eyebrow text-[0.55rem] text-fog">{kicker}</p>}
            {title && <h2 className="truncate font-display text-[0.95rem] font-semibold text-chalk [font-stretch:108%]">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

/* ─── Figures ────────────────────────────────────────────────────────────── */

const TONE = {
  default: "text-chalk",
  volt: "text-volt-hi",
  cyan: "text-cyan",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  gold: "text-gold",
} as const;

export function Kpi({ label, value, unit, sub, tone = "default", icon, href, bar }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: keyof typeof TONE; icon?: IconName; href?: string; bar?: number }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="t-eyebrow text-[0.56rem] text-fog">{label}</p>
        {icon && <Icon name={icon} size={16} className="text-steel transition-colors group-hover:text-cyan" />}
      </div>
      <p className={cn("t-display mt-3 text-[2.2rem] leading-none", TONE[tone])}>
        {value}
        {unit && <span className="ms-1.5 font-mono text-sm font-normal normal-case tracking-normal text-fog">{unit}</span>}
      </p>
      {typeof bar === "number" && <Meter value={bar} className="mt-4" />}
      {sub && <p className="mt-3 text-xs text-fog">{sub}</p>}
    </>
  );
  const cls = "group relative block overflow-hidden rounded-2xl border border-[var(--line)] bg-[linear-gradient(180deg,rgb(14_26_48/0.6),rgb(6_12_24/0.75))] p-5 transition-colors";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-[var(--line-2)]")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Meter({ value, className, tone = "volt" }: { value: number; className?: string; tone?: "volt" | "warn" | "danger" | "ok" | "gold" }) {
  const v = Math.max(0, Math.min(100, value));
  const bg = { volt: "from-volt to-cyan", warn: "from-warn to-[#ffd38a]", danger: "from-danger to-[#ff8a95]", ok: "from-ok to-[#8af2c9]", gold: "from-[#a87724] to-gold" }[tone];
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-white/[0.06]", className)} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)}>
      <div className={cn("h-full rounded-full bg-gradient-to-r", bg)} style={{ width: `${v}%` }} />
    </div>
  );
}

/* ─── Status ─────────────────────────────────────────────────────────────── */

type Tone = "neutral" | "info" | "progress" | "ok" | "warn" | "danger" | "gold" | "violet";
const BADGE: Record<Tone, string> = {
  neutral: "border-steel/60 text-mist bg-white/[0.03]",
  info: "border-cyan/40 text-cyan bg-cyan/[0.07]",
  progress: "border-volt/50 text-volt-hi bg-volt/[0.1]",
  ok: "border-ok/40 text-ok bg-ok/[0.08]",
  warn: "border-warn/40 text-warn bg-warn/[0.08]",
  danger: "border-danger/40 text-danger bg-danger/[0.08]",
  gold: "border-gold/50 text-gold bg-gold/[0.08]",
  violet: "border-team-innov/50 text-team-innov bg-team-innov/[0.08]",
};

export const STATUS_TONE: Record<string, Tone> = {
  // applications
  pending: "info",
  interview: "progress",
  accepted: "ok",
  waitlist: "warn",
  rejected: "danger",
  trainee: "violet",
  converted: "gold",
  // projects
  idea: "neutral",
  research: "info",
  design: "info",
  prototype: "progress",
  testing: "warn",
  competition_ready: "ok",
  completed: "gold",
  archived: "neutral",
  // tasks
  backlog: "neutral",
  todo: "info",
  in_progress: "progress",
  review: "warn",
  done: "ok",
  // bom
  needed: "warn",
  ordered: "info",
  received: "progress",
  installed: "ok",
  failed: "danger",
  replacement_needed: "danger",
  // members / generic
  active: "ok",
  inactive: "neutral",
  alumni: "gold",
  disabled: "danger",
  new: "info",
  read: "neutral",
  archived_msg: "neutral",
  planned: "neutral",
  registered: "info",
  competing: "progress",
  withdrawn: "danger",
  present: "ok",
  late: "warn",
  absent: "danger",
  excused: "neutral",
  low: "neutral",
  medium: "info",
  high: "warn",
  critical: "danger",
};

export function humanize(s: string) {
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function StatusBadge({ status, label, tone }: { status: string; label?: string; tone?: Tone }) {
  const t = tone ?? STATUS_TONE[status] ?? "neutral";
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-[0.08em]", BADGE[t])}>
      <span className="size-1 rounded-full bg-current" />
      {label ?? humanize(status)}
    </span>
  );
}

/* ─── Tables ─────────────────────────────────────────────────────────────── */

export type Column<T> = { key: string; label: string; className?: string; align?: "start" | "end" | "center"; render: (row: T) => ReactNode };

/** Accessible data table with sticky header, horizontal scroll on phones and a designed empty state. */
export function DataTable<T>({ columns, rows, rowKey, empty, caption, rowHref }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; empty?: ReactNode; caption?: string; rowHref?: (r: T) => string }) {
  if (!rows.length) return <>{empty ?? <EmptyPanel title="Nothing here yet" />}</>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="sticky top-0 bg-deep/95 backdrop-blur">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("border-b border-[var(--line)] px-4 py-3 font-mono text-[0.6rem] font-medium uppercase tracking-[0.14em] text-fog", c.align === "end" ? "text-end" : c.align === "center" ? "text-center" : "text-start", c.className)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className="group border-b border-[var(--line)] last:border-0 hover:bg-panel/50">
              {columns.map((c, i) => (
                <td key={c.key} className={cn("px-4 py-3 align-middle text-mist", c.align === "end" ? "text-end" : c.align === "center" ? "text-center" : "text-start", c.className)}>
                  {i === 0 && rowHref ? (
                    <Link href={rowHref(r)} className="font-medium text-chalk after:absolute after:inset-0 hover:text-cyan [tr:has(&)]:relative">
                      {c.render(r)}
                    </Link>
                  ) : (
                    c.render(r)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyPanel({ icon = "signal", title, body, action }: { icon?: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-[var(--line-2)] px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl border border-[var(--line-2)] bg-panel/60 text-cyan">
        <Icon name={icon} size={20} />
      </span>
      <p className="mt-4 font-display text-base font-semibold text-chalk">{title}</p>
      {body && <p className="mt-1.5 max-w-sm text-sm text-fog">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ─── Navigation helpers ─────────────────────────────────────────────────── */

export function Tabs({ items, current }: { items: { href: string; label: string; count?: number }[]; current: string }) {
  return (
    <nav aria-label="Sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--line)]">
      {items.map((i) => {
        const on = i.href === current;
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined} className={cn("relative whitespace-nowrap px-4 py-3 text-sm transition-colors", on ? "text-chalk" : "text-fog hover:text-mist")}>
            {i.label}
            {typeof i.count === "number" && <span className="ms-2 rounded-full bg-white/[0.06] px-1.5 font-mono text-[0.62rem] text-fog">{i.count}</span>}
            {on && <span aria-hidden className="absolute inset-x-3 -bottom-px h-[2px] bg-cyan shadow-[0_0_8px_var(--color-cyan)]" />}
          </Link>
        );
      })}
    </nav>
  );
}

/** GET search/filter bar (works without JavaScript; state lives in the URL). */
export function Toolbar({ children, q, placeholder = "Search…" }: { children?: ReactNode; q?: string; placeholder?: string }) {
  return (
    <form method="get" className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
      <label className="relative flex-1">
        <span className="sr-only">Search</span>
        <Icon name="search" size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-fog" />
        <input name="q" defaultValue={q} placeholder={placeholder} className="h-10 w-full rounded-lg border border-[var(--line-2)] bg-deep/70 ps-10 pe-3 text-sm text-chalk placeholder:text-fog outline-none focus:border-cyan/60" />
      </label>
      {children && <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0 [&>select]:shrink-0">{children}</div>}
    </form>
  );
}

export function money(n: number | string | null | undefined, currency = "EGP") {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat("en-EG", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
}

export function relTime(d: Date | string) {
  const t = typeof d === "string" ? new Date(d) : d;
  const s = Math.round((Date.now() - t.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(-s, "second");
  if (abs < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  return rtf.format(-Math.round(s / 86400), "day");
}
