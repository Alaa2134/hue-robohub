import Link from "next/link";
import { Icon } from "@/components/brand/icons";
import { Mark } from "@/components/brand/logo";
import { Picture } from "@/components/media/picture";
import { Tilt } from "@/components/motion/tilt";
import { cn } from "@/lib/cn";
import { badgeTier, RANK_LABEL, RANK_LABEL_AR } from "@/lib/members";
import type { MemberCard as Member } from "@/lib/types";

const TIER: Record<ReturnType<typeof badgeTier>, { ring: string; text: string; label: string }> = {
  founder: { ring: "from-[#ffe2a8] via-gold to-[#8a5d17]", text: "text-gold", label: "FOUNDER" },
  leader: { ring: "from-white via-[#9fb0c9] to-[#4a5a74]", text: "text-frost", label: "LEADER" },
  lead: { ring: "from-volt-hi via-volt to-volt-lo", text: "text-volt-hi", label: "LEAD" },
  member: { ring: "from-steel via-rim to-deep", text: "text-mist", label: "MEMBER" },
  trainee: { ring: "from-cyan/70 via-steel to-deep", text: "text-cyan", label: "TRAINEE" },
};

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Monogram portrait for members without a published photo. */
export function Monogram({ name, accent = "#2b6dff", className }: { name: string; accent?: string; className?: string }) {
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden bg-deep", className)} aria-hidden>
      <div className="grid-lines absolute inset-0 opacity-50" />
      <div className="absolute inset-0" style={{ background: `radial-gradient(80% 60% at 50% 30%, color-mix(in oklab, ${accent} 35%, transparent), transparent 70%)` }} />
      <span className="t-display relative text-[clamp(3rem,9vw,5.5rem)] text-chrome">{initials(name)}</span>
    </div>
  );
}

/**
 * Member card styled like a BuildX HUE ID: portrait with a holographic sheen that follows the pointer,
 * rank badge, track/team, serial. The whole card links to the public profile.
 */
export function MemberCard({ m, href, locale = "en", serial, priority }: { m: Member; href: string; locale?: string; serial?: number; priority?: boolean }) {
  const tier = badgeTier(m.rank);
  const t = TIER[tier];
  const accent = m.team?.accent ?? (tier === "founder" ? "#e8b45c" : "#2b6dff");
  const rank = (locale === "ar" ? RANK_LABEL_AR : RANK_LABEL)[m.rank];
  return (
    <Tilt max={6} className="h-full">
      <Link href={href} className="frame group/card relative flex h-full flex-col overflow-hidden !rounded-[18px]" aria-label={`${m.fullName} — ${m.title ?? rank}`}>
        <div className="relative aspect-[4/5] overflow-hidden">
          {m.photo ? (
            <Picture image={m.photo} sizes="(min-width:1280px) 22vw, (min-width:640px) 40vw, 80vw" alt={m.fullName} priority={priority} className="absolute inset-0 h-full w-full transition-transform duration-[1200ms] ease-[var(--ease-out-expo)] group-hover/card:scale-[1.04]" />
          ) : (
            <Monogram name={m.fullName} accent={accent} className="absolute inset-0" />
          )}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-void via-void/10 to-transparent" />
          {/* holographic sheen */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-0 mix-blend-color-dodge transition-opacity duration-500 group-hover/card:opacity-60"
            style={{ background: "linear-gradient(115deg, transparent 20%, rgb(56 220 255 / .35) 40%, rgb(155 107 255 / .3) 50%, rgb(232 180 92 / .3) 60%, transparent 80%)", backgroundSize: "250% 250%", backgroundPosition: "var(--mx, 50%) var(--my, 50%)" }}
          />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
            <span className={cn("rounded-sm bg-gradient-to-br p-px", t.ring)}>
              <span className={cn("block rounded-[1px] bg-void/80 px-2 py-1 font-mono text-[0.55rem] font-semibold tracking-[0.22em] backdrop-blur", t.text)}>{t.label}</span>
            </span>
            <Mark tone="white" className="h-4 w-auto opacity-60" />
          </div>
          {m.team && <span aria-hidden className="absolute inset-y-0 start-0 w-[3px]" style={{ background: m.team.accent }} />}
        </div>
        <div className="relative flex flex-1 flex-col gap-1 px-5 pb-5 pt-1">
          <p className="t-headline text-xl leading-tight text-chalk">{m.fullName}</p>
          <p className="text-sm text-mist">{m.title ?? rank}</p>
          <div className="mt-auto flex items-center justify-between gap-3 pt-4">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {m.track && <span className="rounded-full border border-[var(--line-2)] px-2 py-0.5 font-mono text-[0.6rem] tracking-wider text-fog">{m.track.code}</span>}
              {m.team && (
                <span className="truncate rounded-full border px-2 py-0.5 font-mono text-[0.6rem] tracking-wider" style={{ borderColor: `color-mix(in oklab, ${m.team.accent} 45%, transparent)`, color: m.team.accent }}>
                  {m.team.name}
                </span>
              )}
            </div>
            <span className="flex items-center gap-2 font-mono text-[0.6rem] text-fog">
              {serial !== undefined && <span dir="ltr">RH-{String(serial).padStart(4, "0")}</span>}
              <Icon name="arrow" size={15} className="text-mist transition-transform duration-500 group-hover/card:translate-x-1 rtl:-scale-x-100 rtl:group-hover/card:-translate-x-1" />
            </span>
          </div>
        </div>
      </Link>
    </Tilt>
  );
}
