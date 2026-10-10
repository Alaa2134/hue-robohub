import type { Metadata } from "next";
import { Icon } from "@/components/brand/icons";
import { DelegationCounter } from "@/components/forms/expo-live";
import { FormFiller, FormStatus } from "@/components/forms/site-forms";
import { LiveGallery } from "@/components/live/live-content";
import { Picture } from "@/components/media/picture";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { SectionHead } from "@/components/ui/section-head";
import { EXPO_FORM, EXPO_SITE, expoVisit } from "@/content/expo-visit";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export const revalidate = 3600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  const c = expoVisit(locale);
  return pageMeta({ locale, path: "/robotex", title: c.meta.title, description: c.meta.description, image: art("arena", "showcase", "hero")?.og });
}

/**
 * The team's visit to Robotex & NDTX Expo 2026: what it is, what you'll see, how it works, who's in the
 * delegation (live), the day's plan, the application form, the status check with the delegation pass,
 * and the visit's photo album (gallery photos tagged "robotex", added from the BuildX App).
 */
export default async function RobotexVisit({ params }: Params) {
  const { locale, t, href } = await resolvePage(params);
  const c = expoVisit(locale);
  return (
    <>
      <PageHero
        eyebrow={c.eyebrow}
        title={c.title}
        body={c.body}
        image={art("arena", "showcase", "hero")}
        accent="#ff7a45"
        crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.events, href: href("/events") }, { label: t.nav.expo }]}
        actions={
          <div className="flex flex-wrap gap-3">
            <a href="#apply" className="btn btn-primary btn-lg">
              <span aria-hidden className="btn-sheen" />
              <span>{c.apply}</span>
            </a>
            <a href="#status" className="btn btn-lg">
              {c.track}
            </a>
          </div>
        }
      >
        <dl className="enter mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] lg:grid-cols-4" style={{ ["--d" as string]: "800ms" }}>
          {c.facts.map((f) => (
            <div key={f.d} className="bg-void/70 px-5 py-4 backdrop-blur">
              <dt className="t-eyebrow text-[0.58rem] text-fog">{f.d}</dt>
              <dd className="t-headline mt-1.5 text-xl text-chalk">
                {f.k} <span className="text-base font-normal text-mist">{f.t}</span>
              </dd>
            </div>
          ))}
        </dl>
      </PageHero>

      <Band>
        <SectionHead index="01" eyebrow={c.aboutEyebrow} title={c.aboutTitle} size="md" />
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {c.about.map((x) => (
            <article key={x.name} className="frame flex flex-col gap-3 p-6 sm:p-8">
              <p className="t-eyebrow text-[0.62rem] text-cyan">{x.tag}</p>
              <h3 dir="ltr" className="t-headline text-3xl text-chalk rtl:text-right">
                {x.name}
              </h3>
              <p className="leading-relaxed text-mist">{x.body}</p>
            </article>
          ))}
        </div>
        <a href={EXPO_SITE} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm text-cyan hover:underline">
          <Icon name="external" size={16} />
          {c.official}
        </a>
      </Band>

      <Band alt>
        <SectionHead index="02" eyebrow={c.seeEyebrow} title={c.seeTitle} size="md" />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {c.see.map((x, i) => {
            const img = art(c.seeImages[i] ?? "");
            return (
              <li key={x.t} className="frame group overflow-hidden">
                {img && (
                  <div className="relative aspect-[16/9] overflow-hidden">
                    <Picture image={img} sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw" decorative className="size-full" imgClassName="transition-transform duration-700 group-hover:scale-105" />
                    <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-void via-void/20 to-transparent" />
                  </div>
                )}
                <div className="relative -mt-8 flex gap-4 p-6">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--line-2)] bg-void/80 text-cyan backdrop-blur">
                    <Icon name={x.icon} size={24} />
                  </span>
                  <span>
                    <span className="block font-semibold text-chalk">{x.t}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-mist">{x.b}</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </Band>

      <Band>
        <SectionHead index="03" eyebrow={c.stepsEyebrow} title={c.stepsTitle} size="md" />
        <ol className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {c.steps.map((s, i) => (
            <li key={s.t} className="frame flex flex-col gap-3 p-6">
              <span className="t-headline text-4xl text-cyan">{String(i + 1).padStart(2, "0")}</span>
              <span className="font-semibold text-chalk">{s.t}</span>
              <span className="text-sm leading-relaxed text-mist">{s.b}</span>
            </li>
          ))}
        </ol>
      </Band>

      <Band alt id="delegation">
        <SectionHead index="04" eyebrow={c.crewEyebrow} title={c.crewTitle} body={c.crewBody} size="md" />
        <div className="mt-12">
          <DelegationCounter slug={EXPO_FORM} going={c.crewGoing} left={c.crewLeft} full={c.crewFull} closed={c.crewClosed} />
        </div>
      </Band>

      <Band>
        <SectionHead index="05" eyebrow={c.planEyebrow} title={c.planTitle} body={c.planNote} size="md" />
        <div className="mt-12 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <ol className="relative grid gap-4 border-s border-[var(--line-2)] ps-6">
            {c.plan.map((x, i) => (
              <li key={x.t} className="relative">
                <span aria-hidden className="absolute -start-[2.15rem] top-5 flex size-5 items-center justify-center rounded-full border-2 border-[#ff7a45] bg-void text-[0.6rem] font-bold text-[#ff7a45]">
                  {i + 1}
                </span>
                <div className="frame flex gap-4 p-5">
                  <Icon name={x.icon} size={22} className="mt-0.5 shrink-0 text-cyan" />
                  <span>
                    <span className="block font-semibold text-chalk">{x.t}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-mist">{x.b}</span>
                  </span>
                </div>
              </li>
            ))}
          </ol>
          <aside className="frame h-fit p-6">
            <p className="t-eyebrow text-[0.62rem] text-[#ff9b70]">{c.bringTitle}</p>
            <ul className="mt-4 grid gap-3">
              {c.bring.map((b) => (
                <li key={b} className="flex items-center gap-3 text-mist">
                  <Icon name="check" size={18} className="shrink-0 text-ok" />
                  {b}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </Band>

      <Band alt id="apply">
        <SectionHead index="06" eyebrow={c.applyEyebrow} title={c.applyTitle} size="md" />
        <div className="mx-auto mt-12 max-w-3xl">
          <FormFiller locale={locale} listHref={href("/forms")} slug={EXPO_FORM} statusHref={href("/robotex")} />
        </div>
      </Band>

      <Band id="status">
        <SectionHead index="07" eyebrow={c.statusEyebrow} title={c.statusTitle} body={c.statusBody} size="md" />
        <div className="mx-auto mt-12 max-w-4xl">
          <FormStatus locale={locale} />
        </div>
      </Band>

      <Band alt id="album">
        <SectionHead index="08" eyebrow={c.albumEyebrow} title={c.albumTitle} size="md" />
        <div className="mt-12">
          <LiveGallery locale={locale} tag="robotex" empty={c.albumEmpty} />
        </div>
      </Band>

      <Band>
        <SectionHead index="09" eyebrow={c.faqEyebrow} title={c.faqTitle} size="md" />
        <dl className="mt-12 grid gap-4 md:grid-cols-2">
          {c.faq.map((x) => (
            <div key={x.q} className="frame p-6">
              <dt className="font-semibold text-chalk">{x.q}</dt>
              <dd className="mt-2 leading-relaxed text-mist">{x.a}</dd>
            </div>
          ))}
        </dl>
      </Band>
    </>
  );
}
