import type { Metadata } from "next";
import { Icon } from "@/components/brand/icons";
import { ClosedNotice, JoinForm } from "@/components/forms/public-forms";
import { ApplyForm } from "@/components/forms/apply-form";
import { STATIC_SITE } from "@/lib/deploy";
import { mailtoLink, whatsappLink } from "@/lib/contact";
import type { ContactConfig } from "@/lib/site-config";
import { Picture } from "@/components/media/picture";
import { Reveal } from "@/components/motion/reveal";
import { MaskText } from "@/components/motion/reveal";
import { art } from "@/lib/media-library";
import { loc, resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { pick } from "@/lib/site-config";
import { getSiteConfig, getTracks } from "@/server/queries/public";

export const revalidate = 3600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, t } = await resolvePage(params);
  return pageMeta({ locale, path: "/join", title: t.join.title, description: t.join.body, image: art("recruit", "hero")?.og });
}

const YEARS = { en: ["1st year", "2nd year", "3rd year", "4th year", "5th year", "Postgraduate", "Graduate"], ar: ["الفرقة الأولى", "الفرقة الثانية", "الفرقة الثالثة", "الفرقة الرابعة", "الفرقة الخامسة", "دراسات عليا", "خريج"] };

export default async function Join({ params }: Params) {
  const { locale, t, p, href } = await resolvePage(params);
  const [config, tracks] = await Promise.all([getSiteConfig(), getTracks()]);
  const rec = config["site.recruitment"];
  const img = art("recruit", "recruit_tall", "hero");
  const realTracks = tracks.filter((tr) => !tr.id.startsWith("core-"));

  return (
    <div className="relative">
      <div className="mx-auto grid max-w-[1680px] gap-10 px-5 pb-20 pt-24 sm:px-8 lg:grid-cols-12 lg:gap-14 lg:pt-32">
        <aside className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <div className="frame relative aspect-[4/3] overflow-hidden !rounded-[22px] lg:aspect-[4/5]">
              {img && <Picture image={img} sizes="(min-width:1024px) 40vw, 100vw" priority className="absolute inset-0 h-full w-full" focal={[68, 45]} />}
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-void via-void/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                <p className="t-eyebrow text-cyan">{t.join.eyebrow}</p>
                <h1 className="t-display mt-3 text-[clamp(2.2rem,5vw,3.8rem)] text-chalk">
                  <MaskText text={locale === "ar" ? "يلا نبني الجيل الجاي من المبتكرين" : "Let's build the next generation of innovators"} />
                </h1>
              </div>
            </div>
            <ol className="mt-8 grid gap-3">
              {p.join.steps.map((s, i) => (
                <Reveal as="li" key={s.t} delay={i * 70} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-volt/40 bg-volt/10 font-mono text-sm text-cyan">{i + 1}</span>
                  <span>
                    <span className="block font-display font-semibold text-chalk">{s.t}</span>
                    <span className="block text-sm text-mist">{s.d}</span>
                  </span>
                </Reveal>
              ))}
            </ol>
          </div>
        </aside>
        <section className="lg:col-span-7" aria-labelledby="apply">
          <p className="t-eyebrow flex items-center gap-3 text-mist">
            <Icon name="rocket" size={15} className="text-cyan" />
            {pick(rec.headline, locale)}
          </p>
          <h2 id="apply" className="t-headline mt-4 text-[clamp(1.8rem,3.4vw,2.8rem)] text-chalk">
            {t.join.title}
          </h2>
          <p className="mt-3 max-w-xl text-mist">{t.join.body}</p>
          <div className="mt-10">
            {STATIC_SITE ? (
              <>
                <ApplyForm
                  locale={locale}
                  whatsapp={config["site.contact"].whatsapp || config["site.contact"].phone}
                  tracks={tracks.map((tr) => ({ slug: tr.slug, name: loc(locale, tr.name, tr.nameAr), tagline: loc(locale, tr.tagline, tr.taglineAr) }))}
                />
                <ApplyDirect locale={locale} contact={config["site.contact"]} />
              </>
            ) : rec.open ? (
              <JoinForm
                tracks={realTracks.map((tr) => ({ id: tr.id, name: loc(locale, tr.name, tr.nameAr) }))}
                labels={{
                  sections: t.join.sections,
                  fields: t.join.fields,
                  submit: t.join.submit,
                  submitting: t.join.submitting,
                  successTitle: t.join.successTitle,
                  successBody: t.join.successBody,
                  optional: t.join.optional,
                  next: p.join.next,
                  back: p.join.back,
                  of: p.join.of,
                  privacy: p.join.privacy,
                  unavailable: locale === "ar" ? "التقديم عبر الموقع غير متاح مؤقتًا. راسلنا عبر صفحة التواصل." : "Online applications are temporarily unavailable. Please reach us through the contact page.",
                  years: YEARS[locale],
                  noTrack: locale === "ar" ? "لم أقرر بعد" : "Not sure yet",
                }}
              />
            ) : (
              <ClosedNotice title={t.join.closed} body={pick(rec.closedMessage, locale)} href={href("/events")} cta={t.nav.events} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Static site: a quieter second route for anyone who'd rather just message the team. */
function ApplyDirect({ locale, contact }: { locale: string; contact: ContactConfig }) {
  const ar = locale === "ar";
  const wa = whatsappLink(contact.whatsapp || contact.phone, ar ? "أهلاً BuildX HUE! عندي سؤال عن التقديم." : "Hi BuildX HUE! I have a question about applying.");
  if (!wa && !contact.email) return null;
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[var(--line)] bg-void/40 px-5 py-4 text-[0.95rem] text-mist">
      <span>{ar ? "عندك سؤال قبل ما تقدّم؟" : "Have a question before you apply?"}</span>
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className="font-semibold text-cyan hover:underline">
          {ar ? "كلّمنا على واتساب" : "Message us on WhatsApp"}
        </a>
      )}
      {contact.email && (
        <a href={mailtoLink(contact.email, ar ? "سؤال عن التقديم — BuildX HUE" : "Question about applying — BuildX HUE")} className="font-semibold text-cyan hover:underline">
          {ar ? "أو ابعت إيميل" : "or send an email"}
        </a>
      )}
    </div>
  );
}
