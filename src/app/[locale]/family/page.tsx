import type { Metadata } from "next";
import { Icon } from "@/components/brand/icons";
import { FamilyForm } from "@/components/forms/family-form";
import { Picture } from "@/components/media/picture";
import { MaskText, Reveal } from "@/components/motion/reveal";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { getSiteConfig } from "@/server/queries/public";

export const revalidate = 3600;

const COPY = {
  en: {
    eyebrow: "BuildX family",
    title: "Join the BuildX family",
    lead: "The BuildX student family at Horus University. Register once a year, and we add you to the family list we send to the Student Welfare Department.",
    hero: "One family, building together",
    perks: [
      {
        t: "Official family member",
        d: "Your name goes on the family list the university's Student Welfare Department keeps.",
      },
      {
        t: "Trips, events and workshops",
        d: "Family members are first to hear about trips, competitions and sessions.",
      },
      {
        t: "Takes two minutes",
        d: "Name, national ID, address, phone and level: exactly what the university's list asks for.",
      },
    ],
    privacyT: "Why we ask for your national ID",
    privacy:
      "The Student Welfare Department's list needs it. It's kept privately, only the family organisers can see it, and it's never shown on the website.",
    form: "Your registration",
  },
  ar: {
    eyebrow: "أسرة BuildX",
    title: "سجّل في أسرة BuildX",
    lead: "أسرة BuildX الطلابية في جامعة حورس. بتسجّل مرة كل سنة، وبنضيفك في كشف الأسرة اللي بيتبعت للإدارة العامة لرعاية الطلاب.",
    hero: "أسرة واحدة، بنبني مع بعض",
    perks: [
      {
        t: "عضو رسمي في الأسرة",
        d: "اسمك بيتكتب في كشف الأسرة اللي عند الإدارة العامة لرعاية الطلاب في الجامعة.",
      },
      { t: "رحلات وفعاليات وورش", d: "أعضاء الأسرة أول ناس بتعرف عن الرحلات والمسابقات والسيشنز." },
      {
        t: "دقيقتين بس",
        d: "الاسم، الرقم القومي، العنوان، التليفون والمستوى: نفس اللي كشف الجامعة بيطلبه بالظبط.",
      },
    ],
    privacyT: "ليه بنطلب الرقم القومي؟",
    privacy:
      "كشف رعاية الطلاب محتاجه. بيتحفظ عندنا بشكل خاص، ومحدش بيشوفه غير منظمين الأسرة، ومش بيظهر على الموقع أبدًا.",
    form: "بيانات التسجيل",
  },
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  const c = COPY[locale];
  return pageMeta({
    locale,
    path: "/family",
    title: c.title,
    description: c.lead,
    image: art("bootcamp_3", "hero")?.og,
  });
}

export default async function Family({ params }: Params) {
  const { locale } = await resolvePage(params);
  const c = COPY[locale];
  const config = await getSiteConfig();
  const img = art("bootcamp_3", "bootcamp_1", "hero");
  const channel = config["site.socials"].whatsapp || undefined;

  return (
    <div className="relative">
      <div className="mx-auto grid max-w-[1680px] gap-10 px-5 pb-20 pt-24 sm:px-8 lg:grid-cols-12 lg:gap-14 lg:pt-32">
        <aside className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <div className="frame relative aspect-[4/3] overflow-hidden !rounded-[22px] lg:aspect-[4/5]">
              {img && (
                <Picture
                  image={img}
                  sizes="(min-width:1024px) 40vw, 100vw"
                  priority
                  className="absolute inset-0 h-full w-full"
                />
              )}
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-void via-void/30 to-transparent"
              />
              <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                <p className="t-eyebrow text-cyan">{c.eyebrow}</p>
                <p className="t-display mt-3 text-[clamp(2.1rem,4.6vw,3.5rem)] text-chalk">
                  <MaskText text={c.hero} />
                </p>
              </div>
            </div>
            <ul className="mt-8 grid gap-3">
              {c.perks.map((s, i) => (
                <Reveal as="li" key={s.t} delay={i * 70} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-volt/40 bg-volt/10 text-cyan">
                    <Icon name={(["award", "calendar", "clock"] as const)[i]!} size={18} />
                  </span>
                  <span>
                    <span className="block font-display font-semibold text-chalk">{s.t}</span>
                    <span className="block text-sm text-mist">{s.d}</span>
                  </span>
                </Reveal>
              ))}
            </ul>
            <div className="mt-6 flex gap-3 rounded-2xl border border-[var(--line)] bg-void/40 p-4">
              <Icon name="shield" size={20} className="mt-0.5 shrink-0 text-ok" />
              <p className="text-sm text-mist">
                <span className="block font-semibold text-chalk">{c.privacyT}</span>
                {c.privacy}
              </p>
            </div>
          </div>
        </aside>
        <section className="lg:col-span-7" aria-labelledby="family-title">
          <p className="t-eyebrow flex items-center gap-3 text-mist">
            <Icon name="users" size={15} className="text-cyan" />
            {c.eyebrow}
          </p>
          <h1 id="family-title" className="t-headline mt-4 text-[clamp(1.9rem,3.6vw,3rem)] text-chalk">
            {c.title}
          </h1>
          <p className="mt-3 max-w-xl text-mist">{c.lead}</p>
          <div className="mt-10">
            <FamilyForm locale={locale} whatsapp={channel} />
          </div>
        </section>
      </div>
    </div>
  );
}
