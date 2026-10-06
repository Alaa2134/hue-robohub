import type { Metadata } from "next";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { Studio, type StudioArt, type StudioPreset } from "@/components/command/studio";
import { PageHeader } from "@/components/command/ui";
import { ACHIEVEMENT_KINDS } from "@/components/command/showcase-fields";
import { art as libraryArt } from "@/lib/media-library";
import manifest from "@/content/media-library.json";
import { SITE_URL } from "@/lib/seo";
import { formatZoned } from "@/lib/zoned";
import { requirePage } from "@/server/auth/guard";
import { db, schema as s } from "@/server/db";

export const metadata: Metadata = { title: "Media Studio" };

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "ST" : n % 10 === 2 && n % 100 !== 12 ? "ND" : n % 10 === 3 && n % 100 !== 13 ? "RD" : "TH"}`;

export default async function StudioPage() {
  await requirePage("media.generate");
  const [events, achievements] = await Promise.all([
    db.select().from(s.events).where(and(eq(s.events.public, true), gte(s.events.startsAt, new Date()))).orderBy(asc(s.events.startsAt)).limit(10),
    db.select().from(s.achievements).where(eq(s.achievements.public, true)).orderBy(desc(s.achievements.achievedOn)).limit(10),
  ]);
  const art: StudioArt[] = Object.keys(manifest)
    .map((n) => libraryArt(n))
    .filter((e) => !!e)
    .map((e) => ({ name: e!.name, url: e!.sources.webp.find((x) => x.w >= 1920)?.url ?? e!.sources.webp.at(-1)!.url, thumb: e!.sources.webp[0]!.url }));
  const presets: StudioPreset[] = [
    ...events.map((e) => ({ label: `Event · ${e.title}`, template: "event" as const, kicker: e.type.replace(/_/g, " "), title: e.title, details: `${formatZoned(e.startsAt, { time: !e.allDay })}${e.location ? ` · ${e.location}` : ""}`, cta: e.ctaLabel ?? (e.registrationUrl ? "Register" : "Details"), qr: e.registrationUrl ?? `${SITE_URL}/events/${e.slug}` })),
    ...achievements.map((a) => ({ label: `Achievement · ${a.title}`, template: "achievement" as const, kicker: ACHIEVEMENT_KINDS.find((k) => k.value === a.kind)?.label ?? "Achievement", title: a.title, details: a.description.slice(0, 160), cta: "", qr: "", big: a.rank ? ordinal(a.rank) : "WIN" })),
  ];
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader kicker="Media" title="Media Studio" description="On-brand posters for Instagram, Facebook and WhatsApp in seconds — square, portrait or landscape PNG, with a real scannable QR code." />
      <Studio art={art} presets={presets} joinUrl={`${SITE_URL}/join`} />
    </div>
  );
}
