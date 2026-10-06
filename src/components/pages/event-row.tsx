import Link from "next/link";
import { Icon } from "@/components/brand/icons";
import { dateParts, EVENT_TYPE_LABEL, formatTime } from "@/lib/format";
import type { EventCard } from "@/server/queries/public";

export function EventRow({ e, href, locale }: { e: EventCard; href: string; locale: string }) {
  const d = dateParts(e.startsAt, locale);
  return (
    <Link href={href} className="group grid grid-cols-[4.5rem_1fr_auto] items-center gap-4 py-5 sm:grid-cols-[6.5rem_1fr_auto] sm:gap-6">
      <span className="flex flex-col items-center rounded-xl border border-[var(--line)] bg-deep/60 py-2.5 transition-colors group-hover:border-cyan/50">
        <span className="font-mono text-[0.6rem] uppercase text-fog">{d.month}</span>
        <span className="font-display text-3xl font-bold leading-none text-chalk">{d.day}</span>
        <span className="font-mono text-[0.6rem] uppercase text-fog">{d.weekday}</span>
      </span>
      <span className="min-w-0">
        <span className="t-eyebrow text-[0.56rem] text-cyan">{EVENT_TYPE_LABEL[e.type] ?? e.type}</span>
        <span className="t-title mt-1 block truncate text-lg text-chalk transition-colors group-hover:text-cyan sm:text-xl">{e.title}</span>
        <span className="block truncate text-sm text-fog">{[e.allDay ? null : formatTime(e.startsAt, locale), e.location].filter(Boolean).join(" · ")}</span>
      </span>
      <Icon name="arrow" size={18} className="text-fog transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" />
    </Link>
  );
}
