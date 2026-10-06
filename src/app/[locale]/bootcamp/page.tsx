import type { Metadata } from "next";
import { Icon, WEEK_ICON } from "@/components/brand/icons";
import { Assembly, type AssemblyWeek } from "@/components/home/assembly";
import { Reveal } from "@/components/motion/reveal";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { BUILD_STAGES } from "@/content/bootcamp-build";
import { dateParts, formatTime } from "@/lib/format";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { getBootcamp, getSiteConfig } from "@/server/queries/public";

export const revalidate = 3600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, p } = await resolvePage(params);
  return pageMeta({ locale, path: "/bootcamp", title: p.bootcamp.heroTitle, description: p.bootcamp.heroBody, image: art("bootcamp_7", "bootcamp_6", "hero")?.og });
}

export default async function Bootcamp({ params }: Params) {
  const { locale, t, p, href } = await resolvePage(params);
  const [bc, config] = await Promise.all([getBootcamp(), getSiteConfig()]);
  const open = config["site.recruitment"].open;
  const weeks: AssemblyWeek[] = bc.modules.map((m, i) => {
    const st = BUILD_STAGES[Math.min(i, BUILD_STAGES.length - 1)]!;
    return {
      week: m.week,
      title: m.title,
      summary: m.summary,
      outcomes: m.outcomes,
      stage: locale === "ar" ? st.ar.stage : st.stage,
      parts: [...(locale === "ar" ? st.ar.parts : st.parts)],
      image: art(`bootcamp_${i + 1}`, "bootcamp_7", "hero"),
      final: i === bc.modules.length - 1 && /challenge/i.test(m.title),
    };
  });

  return (
    <>
      <PageHero
        eyebrow={t.bootcamp.eyebrow}
        title={p.bootcamp.heroTitle}
        body={p.bootcamp.heroBody}
        image={art("bootcamp_7", "bootcamp_6", "hero")}
        crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.bootcamp }]}
        actions={
          open ? (
            <ButtonLink href={href("/join")} variant="primary" size="lg" arrow>
              {p.bootcamp.apply}
            </ButtonLink>
          ) : undefined
        }
      >
        <dl className="enter mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] lg:grid-cols-4" style={{ ["--d" as string]: "800ms" }}>
          {p.bootcamp.facts.map((f, i) => (
            <div key={i} className={`bg-void/70 px-5 py-4 backdrop-blur ${i === 2 ? "lg:bg-[rgb(48_34_10/0.55)]" : ""}`}>
              <dt className="t-eyebrow text-[0.58rem] text-fog">{f.d}</dt>
              <dd className={`t-headline mt-1.5 text-xl ${i === 2 ? "text-gold" : "text-chalk"}`}>
                {f.k} <span className="text-base font-normal text-mist">{f.t}</span>
              </dd>
            </div>
          ))}
        </dl>
      </PageHero>

      <section className="relative bg-abyss">
        <div className="mx-auto max-w-[1680px] px-5 pt-20 sm:px-8 lg:pt-28">
          <SectionHead index="01" eyebrow={p.bootcamp.buildTitle} title={locale === "ar" ? "من الأساسيات إلى المنافسة" : "From basics to competition"} body={p.bootcamp.buildBody} size="md" />
        </div>
        <Assembly weeks={weeks} labels={{ week: t.bootcamp.week, final: t.bootcamp.final, stage: locale === "ar" ? "مرحلة" : "Stage", built: locale === "ar" ? "مكتمل" : "Built" }} />
      </section>

      <Band>
        <SectionHead index="02" eyebrow={p.bootcamp.curriculum} title={t.bootcamp.title} size="md" />
        <ol className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {bc.modules.map((m, i) => {
            const final = weeks[i]?.final;
            return (
              <Reveal as="li" key={m.id} delay={(i % 3) * 70}>
                <div className={`frame h-full p-7 ${final ? "!bg-[linear-gradient(180deg,rgb(48_34_10/0.6),rgb(10_8_4/0.8))]" : ""}`} style={{ ["--edge" as string]: final ? 0.8 : 0 }}>
                  <div className="flex items-center justify-between">
                    <span className={`flex size-11 items-center justify-center rounded-lg border ${final ? "border-gold/60 text-gold" : "border-volt/40 text-cyan"}`}>
                      <Icon name={WEEK_ICON[i] ?? "robot"} size={20} />
                    </span>
                    <span className={`t-eyebrow text-[0.6rem] ${final ? "text-gold" : "text-fog"}`}>{final ? t.bootcamp.final : `${t.bootcamp.week} ${String(m.week).padStart(2, "0")}`}</span>
                  </div>
                  <h3 className="t-headline mt-6 text-xl text-chalk">{m.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-mist">{m.summary}</p>
                  {m.outcomes.length > 0 && (
                    <>
                      <p className="t-eyebrow mt-6 text-[0.58rem] text-fog">{p.bootcamp.outcomes}</p>
                      <ul className="mt-3 space-y-1.5">
                        {m.outcomes.map((o) => (
                          <li key={o} className="flex items-start gap-2 text-sm text-frost">
                            <Icon name="check" size={14} className={`mt-1 shrink-0 ${final ? "text-gold" : "text-cyan"}`} />
                            {o}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {m.lessons.length > 0 && (
                    <>
                      <p className="t-eyebrow mt-6 text-[0.58rem] text-fog">{p.bootcamp.lessons}</p>
                      <ol className="mt-3 divide-y divide-[var(--line)] border-y border-[var(--line)]">
                        {m.lessons.map((l, li) => (
                          <li key={l.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                            <span className="text-mist">
                              <span className="me-2 font-mono text-[0.65rem] text-fog">{String(li + 1).padStart(2, "0")}</span>
                              {l.title}
                            </span>
                            {l.durationMinutes && <span className="font-mono text-[0.65rem] text-fog">{l.durationMinutes}′</span>}
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </div>
              </Reveal>
            );
          })}
        </ol>
      </Band>

      <Band alt>
        <SectionHead index="03" eyebrow={p.bootcamp.sessions} title={t.home.eventsTitle} size="md" />
        <div className="mt-12">
          {bc.sessions.length ? (
            <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {bc.sessions.map((s) => {
                const d = dateParts(s.startsAt, locale);
                return (
                  <li key={s.id} className="grid grid-cols-[4.5rem_1fr] items-center gap-5 py-5 sm:grid-cols-[6rem_1fr_auto]">
                    <span className="t-data">
                      <span className="block text-3xl leading-none text-chalk">{d.day}</span>
                      <span className="text-[0.65rem] uppercase text-fog">
                        {d.month} · {d.weekday}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="t-title block truncate text-lg text-chalk">{s.title}</span>
                      <span className="block truncate text-sm text-fog">{[formatTime(s.startsAt, locale), s.location].filter(Boolean).join(" · ")}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon="calendar" title={p.bootcamp.sessions} body={p.bootcamp.sessionsEmpty} action={open ? <ButtonLink href={href("/join")} size="sm" variant="primary" arrow>{p.bootcamp.apply}</ButtonLink> : undefined} />
          )}
        </div>
      </Band>
    </>
  );
}
