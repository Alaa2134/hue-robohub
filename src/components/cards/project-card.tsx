import Link from "next/link";
import { Picture } from "@/components/media/picture";
import { Tilt } from "@/components/motion/tilt";
import { PROJECT_STATUS_LABEL } from "@/lib/format";
import { art } from "@/lib/media-library";
import { trackWorld } from "@/lib/worlds";
import type { ProjectCard as Project } from "@/server/queries/public";

/** Editorial project card: hero image (or the track's render), status, progress telemetry. */
export function ProjectCard({ p, href, size = "md" }: { p: Project; href: string; size?: "md" | "lg" }) {
  const fallback = p.track ? art(...trackWorld(p.track.slug).art) : art("showcase", "hero");
  const img = p.hero ?? fallback;
  const accent = p.team?.accent ?? (p.track ? trackWorld(p.track.slug).accent : "#38dcff");
  return (
    <Tilt max={3} className="h-full">
      <Link href={href} className={`frame group relative flex h-full flex-col justify-end overflow-hidden !rounded-[18px] ${size === "lg" ? "min-h-[30rem] p-8 lg:min-h-[36rem]" : "min-h-[22rem] p-6"}`}>
        {img && <Picture image={img} sizes={size === "lg" ? "(min-width:1024px) 60vw, 100vw" : "(min-width:1024px) 33vw, 100vw"} decorative={!p.hero} alt={p.title} className="absolute inset-0 h-full w-full transition-transform duration-[1400ms] ease-[var(--ease-out-expo)] group-hover:scale-105" />}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-void via-void/55 to-void/5" />
        <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            {p.track && <span className="t-eyebrow rounded-full border border-[var(--line-2)] bg-void/60 px-2.5 py-1 text-[0.56rem] text-mist">{p.track.code}</span>}
            {p.team && (
              <span className="t-eyebrow rounded-full px-2.5 py-1 text-[0.56rem] text-void" style={{ background: p.team.accent }}>
                {p.team.name}
              </span>
            )}
            <span className="t-eyebrow text-[0.56rem]" style={{ color: accent }}>
              {PROJECT_STATUS_LABEL[p.status] ?? p.status}
            </span>
          </div>
          <h3 className={`t-headline mt-3 text-chalk ${size === "lg" ? "text-[clamp(1.8rem,3vw,2.8rem)]" : "text-[1.4rem]"}`}>{p.title}</h3>
          <p className="mt-2 line-clamp-2 max-w-xl text-sm text-mist">{p.summary}</p>
          {p.technologies.length > 0 && <p className="mt-3 line-clamp-1 font-mono text-[0.65rem] text-fog">{p.technologies.slice(0, 5).join(" · ")}</p>}
          <div className="mt-5 flex items-center gap-3">
            <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full" style={{ width: `${p.progress}%`, background: `linear-gradient(90deg, #2b6dff, ${accent})` }} />
            </div>
            <span className="t-data text-xs text-mist">{p.progress}%</span>
          </div>
        </div>
      </Link>
    </Tilt>
  );
}
