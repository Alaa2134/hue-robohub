import type { Metadata } from "next";
import { Icon } from "@/components/brand/icons";
import { SOCIAL_LABEL, SocialIcon, safeHref } from "@/components/brand/social-icons";
import { ClosedNotice, ContactForm } from "@/components/forms/public-forms";
import { STATIC_SITE } from "@/lib/deploy";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { pick, type SocialConfig } from "@/lib/site-config";
import { getSiteConfig } from "@/server/queries/public";

export const revalidate = 3600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, t } = await resolvePage(params);
  return pageMeta({ locale, path: "/contact", title: t.contact.title, description: t.contact.body, image: art("team_env", "hero")?.og });
}

export default async function Contact({ params }: Params) {
  const { locale, t, p, href } = await resolvePage(params);
  const config = await getSiteConfig();
  const c = config["site.contact"];
  const socials = (Object.entries(config["site.socials"]) as [keyof SocialConfig, string][]).map(([k, v]) => [k, safeHref(v)] as const).filter(([, v]) => !!v);
  const map = safeHref(c.mapUrl);
  return (
    <>
      <PageHero eyebrow={t.contact.eyebrow} title={t.contact.title} body={t.contact.body} image={art("team_env", "hero")} crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.contact }]} size="md" />
      <Band tight>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            {STATIC_SITE ? (
              <ClosedNotice
                title={locale === "ar" ? "نموذج الرسائل يفتح قريبًا" : "The message form opens soon"}
                body={locale === "ar" ? "لحد ما نربط النموذج، تواصل معنا عبر القنوات الموجودة في الصفحة." : "Until the form is connected, reach us through the channels on this page."}
                href={href("/about")}
                cta={t.nav.about}
              />
            ) : (
              <ContactForm
                labels={{
                  fields: t.contact.fields,
                  topics: t.contact.topics,
                  submit: t.contact.submit,
                  submitting: t.join.submitting,
                  successTitle: t.contact.successTitle,
                  successBody: t.contact.successBody,
                  optional: t.join.optional,
                  unavailable: locale === "ar" ? "الإرسال عبر الموقع غير متاح مؤقتًا. راسلنا على البريد مباشرة." : "The form is temporarily unavailable. Please email us directly.",
                }}
              />
            )}
          </div>
          <aside className="flex flex-col gap-4 lg:col-span-5">
            <p className="t-eyebrow text-fog">{p.contact.channels}</p>
            {c.email && (
              <a href={`mailto:${c.email}`} className="frame flex items-center gap-4 p-5 transition-colors hover:bg-panel/60">
                <Icon name="mail" size={20} className="text-cyan" />
                <span>
                  <span className="t-eyebrow block text-[0.56rem] text-fog">{p.contact.email}</span>
                  <span className="text-chalk">{c.email}</span>
                </span>
              </a>
            )}
            {c.phone && (
              <a href={`tel:${c.phone.replace(/[^+\d]/g, "")}`} className="frame flex items-center gap-4 p-5 transition-colors hover:bg-panel/60" dir="ltr">
                <Icon name="signal" size={20} className="text-cyan" />
                <span>
                  <span className="t-eyebrow block text-[0.56rem] text-fog">{p.contact.phone}</span>
                  <span className="text-chalk">{c.phone}</span>
                </span>
              </a>
            )}
            <div className="frame flex items-start gap-4 p-5">
              <Icon name="pin" size={20} className="mt-0.5 text-cyan" />
              <span>
                <span className="t-eyebrow block text-[0.56rem] text-fog">{p.contact.address}</span>
                <span className="text-chalk">{pick(c.address, locale)}</span>
                {map && (
                  <a href={map} target="_blank" rel="noopener noreferrer" className="mt-2 block text-sm text-cyan hover:underline">
                    {p.contact.map}
                  </a>
                )}
              </span>
            </div>
            <div className="frame flex items-start gap-4 p-5">
              <Icon name="clock" size={20} className="mt-0.5 text-cyan" />
              <span>
                <span className="t-eyebrow block text-[0.56rem] text-fog">{p.contact.hours}</span>
                <span className="text-chalk">{pick(c.hours, locale)}</span>
              </span>
            </div>
            {socials.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {socials.map(([k, v]) => (
                  <a key={k} href={v!} target="_blank" rel="noopener noreferrer" aria-label={SOCIAL_LABEL[k]} className="btn btn-icon">
                    <SocialIcon name={k} className="size-[17px]" />
                  </a>
                ))}
              </div>
            )}
          </aside>
        </div>
      </Band>
    </>
  );
}
