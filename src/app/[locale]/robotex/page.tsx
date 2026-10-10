import type { Metadata } from "next";
import { Icon } from "@/components/brand/icons";
import { DelegationCounter, ExpoApplyBar, ExpoCountdown } from "@/components/forms/expo-live";
import { FormFiller, FormStatus } from "@/components/forms/site-forms";
import { LiveGallery } from "@/components/live/live-content";
import { Picture } from "@/components/media/picture";
import { MediaWallGrid, type WallImage } from "@/components/pages/lightbox";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { SectionHead } from "@/components/ui/section-head";
import { EXPO_BROCHURE, EXPO_OG, PAST_PHOTOS, expoPhoto } from "@/content/expo-photos";
import { EXPO_FORM, EXPO_SITE, expoVisit } from "@/content/expo-visit";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export const revalidate = 3600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  const c = expoVisit(locale);
  return pageMeta({ locale, path: "/robotex", title: c.meta.title, description: c.meta.description, image: EXPO_OG });
}

/**
 * The team's visit to Robotex & NDTX Expo 2026, short enough for a phone: a countdown, a quick menu,
 * the two expos, the areas (swiped sideways on phones), how it works, then the form with the live
 * delegation count and the status check (with the delegation pass), the day's plan, real photos from
 * past editions (open full screen), the visit's own album (gallery photos tagged "robotex") and the
 * FAQ. On phones a bar with the days left and "apply" follows once you scroll past the top.
 */
export default async function RobotexVisit({ params }: Params) {
  const { locale, t, href } = await resolvePage(params);
  const c = expoVisit(locale);
  const past: WallImage[] = PAST_PHOTOS.map((k) => {
    const img = expoPhoto(k, locale)!;
    const thumb = img.webp.split(", ")[0]!.split(" ")[0]!;
    return { id: k, src: img.src, srcSet: img.webp, thumb, alt: img.alt, caption: img.alt, tag: "NDTX", w: img.width, h: img.height, placeholder: img.placeholder };
  });
  const head = "mt-8 sm:mt-12";
  return (
    <>
      <PageHero
        eyebrow={c.eyebrow}
        title={c.title}
        body={c.body}
        image={expoPhoto("hero", locale)}
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
        <ExpoCountdown labels={c.countdown} />
        <dl className="enter mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] lg:grid-cols-4" style={{ ["--d" as string]: "800ms" }}>
          {c.facts.map((f) => (
            <div key={f.d} className="bg-void/70 px-4 py-3 backdrop-blur sm:px-5 sm:py-4">
              <dt className="t-eyebrow text-[0.58rem] text-fog">{f.d}</dt>
              <dd className="t-headline mt-1.5 text-lg text-chalk sm:text-xl">
                {f.k} <span className="text-sm font-normal text-mist sm:text-base">{f.t}</span>
              </dd>
            </div>
          ))}
        </dl>
      </PageHero>

      <nav aria-label={c.title} className="border-y border-[var(--line)] bg-[rgb(5_14_38/0.88)]" data-testid="expo-nav">
        <ul className="mx-auto flex max-w-[1680px] gap-2 overflow-x-auto px-5 py-2.5 [scrollbar-width:none] sm:px-8">
          {c.nav.map(([to, label]) => (
            <li key={to} className="shrink-0">
              <a href={to} className="block rounded-full border border-[var(--line-2)] px-3.5 py-1.5 text-sm text-mist transition-colors hover:border-cyan/50 hover:text-chalk">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Band tight id="about" className="scroll-mt-28">
        <SectionHead index="01" eyebrow={c.aboutEyebrow} title={c.aboutTitle} size="md" />
        <div className={`${head} grid gap-3 sm:gap-4 md:grid-cols-2`}>
          {c.about.map((x) => (
            <article key={x.name} className="frame flex flex-col gap-2 p-5 sm:gap-3 sm:p-8">
              <p className="t-eyebrow text-[0.62rem] text-cyan">{x.tag}</p>
              <h3 dir="ltr" className="t-headline text-2xl text-chalk sm:text-3xl rtl:text-right">
                {x.name}
              </h3>
              <p className="text-sm leading-relaxed text-mist sm:text-base">{x.body}</p>
            </article>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
          <a href={EXPO_BROCHURE} target="_blank" rel="noopener" className="inline-flex items-center gap-2 text-sm font-semibold text-[#ff9b70] hover:underline">
            <Icon name="book" size={16} />
            {c.brochure}
          </a>
          <a href={EXPO_SITE} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-cyan hover:underline">
            <Icon name="external" size={16} />
            {c.official}
          </a>
        </div>
      </Band>

      <Band tight alt id="areas" className="scroll-mt-28">
        <SectionHead index="02" eyebrow={c.seeEyebrow} title={c.seeTitle} size="md" />
        {/* Phones: one row to swipe sideways; wider screens: a grid. */}
        <ul className={`${head} -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-3 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-3`} data-testid="expo-areas">
          {c.see.map((x, i) => {
            const img = expoPhoto(c.seeImages[i] ?? "", locale);
            return (
              <li key={x.t} className="frame group w-[80%] shrink-0 snap-start overflow-hidden sm:w-auto">
                {img && (
                  <div className="relative aspect-[16/9] overflow-hidden">
                    <Picture image={img} sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 80vw" decorative className="size-full" imgClassName="transition-transform duration-700 group-hover:scale-105" />
                    <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-void via-void/20 to-transparent" />
                  </div>
                )}
                <div className="relative -mt-8 flex gap-3 p-4 sm:gap-4 sm:p-6">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--line-2)] bg-void/80 text-cyan backdrop-blur sm:size-12">
                    <Icon name={x.icon} size={22} />
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

      <Band tight>
        <SectionHead index="03" eyebrow={c.stepsEyebrow} title={c.stepsTitle} size="md" />
        <ol className={`${head} grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4`}>
          {c.steps.map((s, i) => (
            <li key={s.t} className="frame flex flex-col gap-1.5 p-4 sm:gap-3 sm:p-6">
              <span className="t-headline text-2xl text-cyan sm:text-4xl">{String(i + 1).padStart(2, "0")}</span>
              <span className="font-semibold text-chalk">{s.t}</span>
              <span className="text-xs leading-relaxed text-mist sm:text-sm">{s.b}</span>
            </li>
          ))}
        </ol>
      </Band>

      <Band tight alt id="apply" className="scroll-mt-28">
        <SectionHead index="04" eyebrow={c.applyEyebrow} title={c.applyTitle} size="md" />
        <div className={`${head} mx-auto grid max-w-3xl gap-6`}>
          <DelegationCounter slug={EXPO_FORM} going={c.crewGoing} left={c.crewLeft} full={c.crewFull} closed={c.crewClosed} />
          <FormFiller locale={locale} listHref={href("/forms")} slug={EXPO_FORM} statusHref={href("/robotex")} />
        </div>
      </Band>

      <Band tight id="status" className="scroll-mt-28">
        <SectionHead index="05" eyebrow={c.statusEyebrow} title={c.statusTitle} body={c.statusBody} size="md" />
        <div className={`${head} mx-auto max-w-4xl`}>
          <FormStatus locale={locale} />
        </div>
      </Band>

      <Band tight alt id="day" className="scroll-mt-28">
        <SectionHead index="06" eyebrow={c.planEyebrow} title={c.planTitle} body={c.planNote} size="md" />
        <div className={`${head} grid gap-6 lg:grid-cols-[1.6fr_1fr]`}>
          <ol className="relative grid gap-3 border-s border-[var(--line-2)] ps-6 sm:gap-4">
            {c.plan.map((x, i) => (
              <li key={x.t} className="relative">
                <span aria-hidden className="absolute -start-[2.15rem] top-4 flex size-5 items-center justify-center rounded-full border-2 border-[#ff7a45] bg-void text-[0.6rem] font-bold text-[#ff7a45]">
                  {i + 1}
                </span>
                <div className="frame flex gap-3 p-4 sm:gap-4 sm:p-5">
                  <Icon name={x.icon} size={22} className="mt-0.5 shrink-0 text-cyan" />
                  <span>
                    <span className="block font-semibold text-chalk">{x.t}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-mist">{x.b}</span>
                  </span>
                </div>
              </li>
            ))}
          </ol>
          <aside className="frame h-fit p-5 sm:p-6">
            <p className="t-eyebrow text-[0.62rem] text-[#ff9b70]">{c.bringTitle}</p>
            <ul className="mt-4 grid gap-3">
              {c.bring.map((b) => (
                <li key={b} className="flex items-center gap-3 text-sm text-mist sm:text-base">
                  <Icon name="check" size={18} className="shrink-0 text-ok" />
                  {b}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </Band>

      <Band tight id="photos" className="scroll-mt-28">
        <SectionHead index="07" eyebrow={c.pastEyebrow} title={c.pastTitle} body={c.pastBody} size="md" />
        <div className={head} data-testid="expo-past">
          <MediaWallGrid items={past} labels={c.lightbox} />
        </div>
        <div className="mt-12">
          <p className="t-eyebrow text-[0.62rem] text-[#ff9b70]">{c.albumTitle}</p>
          <div className="mt-4" id="album">
            <LiveGallery locale={locale} tag="robotex" empty={c.albumEmpty} />
          </div>
        </div>
      </Band>

      <Band tight alt id="faq" className="scroll-mt-28">
        <SectionHead index="08" eyebrow={c.faqEyebrow} title={c.faqTitle} size="md" />
        <div className={`${head} grid gap-3 md:grid-cols-2`}>
          {c.faq.map((x) => (
            <details key={x.q} className="frame group p-5 sm:p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-chalk">
                {x.q}
                <Icon name="chevronDown" size={18} className="shrink-0 text-fog transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 leading-relaxed text-mist">{x.a}</p>
            </details>
          ))}
        </div>
      </Band>

      <ExpoApplyBar label={c.apply} days={c.barDays} />
    </>
  );
}
