import type { Metadata } from "next";
import { Icon } from "@/components/brand/icons";
import { FormFiller, FormStatus } from "@/components/forms/site-forms";
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

/** The team's visit to Robotex & NDTX Expo 2026: what it is, how it works, the application form and the status check. */
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
          {c.see.map((x) => (
            <li key={x.t} className="frame flex gap-4 p-6">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--line-2)] text-cyan">
                <Icon name={x.icon} size={24} />
              </span>
              <span>
                <span className="block font-semibold text-chalk">{x.t}</span>
                <span className="mt-1 block text-sm leading-relaxed text-mist">{x.b}</span>
              </span>
            </li>
          ))}
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

      <Band alt id="apply">
        <SectionHead index="04" eyebrow={c.applyEyebrow} title={c.applyTitle} size="md" />
        <div className="mx-auto mt-12 max-w-3xl">
          <FormFiller locale={locale} listHref={href("/forms")} slug={EXPO_FORM} statusHref={href("/robotex")} />
        </div>
      </Band>

      <Band id="status">
        <SectionHead index="05" eyebrow={c.statusEyebrow} title={c.statusTitle} body={c.statusBody} size="md" />
        <div className="mx-auto mt-12 max-w-4xl">
          <FormStatus locale={locale} />
        </div>
      </Band>

      <Band alt>
        <SectionHead index="06" eyebrow={c.faqEyebrow} title={c.faqTitle} size="md" />
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
