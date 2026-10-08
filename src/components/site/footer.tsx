import Link from "next/link";
import { APP_HREF } from "@/lib/deploy";
import { Icon } from "@/components/brand/icons";
import { Lockup, Wordmark } from "@/components/brand/logo";
import { SOCIAL_LABEL, SocialIcon, safeHref } from "@/components/brand/social-icons";
import { Picture } from "@/components/media/picture";
import { ButtonLink } from "@/components/ui/button";
import { localePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n";
import { art } from "@/lib/media-library";
import { pick, type SiteConfig, type SocialConfig } from "@/lib/site-config";
import { HideOn } from "./hide-on";
import { MENU_GROUPS } from "./nav";

export function Footer({ locale, t, config, cta = true }: { locale: Locale; t: Dictionary; config: SiteConfig; cta?: boolean }) {
  const href = (p: string) => localePath(locale, p);
  const contact = config["site.contact"];
  const socials = (Object.entries(config["site.socials"]) as [keyof SocialConfig, string][]).filter(([, v]) => safeHref(v));
  const recruit = config["site.recruitment"];
  const poster = art("recruit", "team_sprint", "hero");
  const year = new Date().getFullYear();

  return (
    <footer className="relative overflow-hidden bg-abyss">
      {cta && (
        <HideOn paths={["/join"]}>
        <section aria-labelledby="footer-cta" className="relative isolate overflow-hidden border-y border-[var(--line)]">
          {poster && (
            <div aria-hidden className="absolute inset-0 -z-10">
              <Picture image={poster} sizes="100vw" decorative className="h-full w-full opacity-60" />
              <div className="absolute inset-0 bg-gradient-to-r from-void via-void/80 to-void/10 rtl:bg-gradient-to-l" />
              <div className="absolute inset-0 bg-gradient-to-t from-abyss via-transparent to-void/40" />
            </div>
          )}
          <div className="mx-auto grid max-w-[1680px] gap-10 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <p className="t-eyebrow mb-5 flex items-center gap-3 text-cyan">
                <span className="h-px w-8 bg-cyan" />
                {recruit.open ? t.join.eyebrow : t.join.closed}
              </p>
              <h2 id="footer-cta" className="t-display text-[clamp(2.6rem,7.4vw,6.8rem)] text-chalk">
                <span className="block">{locale === "ar" ? "يلا نبني" : "Let's build"}</span>
                <span className="block text-chrome">{locale === "ar" ? "الجيل الجاي" : "the next generation"}</span>
                <span className="block text-volt">{locale === "ar" ? "من المبتكرين" : "of innovators"}</span>
              </h2>
            </div>
            <div className="flex flex-col gap-6 lg:col-span-4 lg:items-end lg:text-end">
              <p className="max-w-sm text-pretty text-mist">{recruit.open ? t.home.joinBody : pick(recruit.closedMessage, locale)}</p>
              <div className="flex flex-wrap gap-3 lg:justify-end">
                {recruit.open && (
                  <ButtonLink href={href("/join")} variant="primary" size="lg" arrow>
                    {t.nav.join}
                  </ButtonLink>
                )}
                <ButtonLink href={href("/bootcamp")} size="lg">
                  {t.nav.bootcamp}
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>
        </HideOn>
      )}

      <div className="relative mx-auto grid max-w-[1680px] gap-12 px-5 pb-10 pt-16 sm:px-8 lg:grid-cols-12 lg:pt-20">
        <div className="lg:col-span-4">
          <Link href={href("/")} aria-label="BuildX HUE — home" className="inline-block">
            <Lockup size="lg" />
          </Link>
          <p className="mt-6 max-w-sm text-pretty text-mist">{t.footer.tagline}</p>
          <div className="mt-6 inline-flex items-center gap-2.5 rounded-full border border-[var(--line)] px-3 py-1.5">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-ok/60" />
              <span className="relative size-2 rounded-full bg-ok" />
            </span>
            <span className="t-eyebrow text-[0.6rem] text-mist">{pick(contact.hours, locale)}</span>
          </div>
        </div>

        <nav aria-label={t.footer.navigation} className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-5">
          {MENU_GROUPS.map((g) => (
            <div key={g.key}>
              <p className="t-eyebrow mb-4 text-fog">{t.nav[g.key]}</p>
              <ul className="space-y-2.5">
                {g.items.map((n) => (
                  <li key={n.href}>
                    <Link href={href(n.href)} className="link-sweep text-[0.92rem] text-mist hover:text-chalk">
                      {t.nav[n.key]}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="lg:col-span-3">
          <p className="t-eyebrow mb-4 text-fog">{t.footer.contact}</p>
          <ul className="space-y-3 text-[0.92rem] text-mist">
            {contact.email && (
              <li>
                <a href={`mailto:${contact.email}`} className="link-sweep inline-flex items-center gap-2.5 hover:text-chalk">
                  <Icon name="mail" size={16} className="text-fog" />
                  {contact.email}
                </a>
              </li>
            )}
            {contact.phone && (
              <li>
                <a href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`} className="link-sweep inline-flex items-center gap-2.5 hover:text-chalk" dir="ltr">
                  <Icon name="signal" size={16} className="text-fog" />
                  {contact.phone}
                </a>
              </li>
            )}
            <li className="flex items-start gap-2.5">
              <Icon name="pin" size={16} className="mt-0.5 shrink-0 text-fog" />
              {pick(contact.address, locale)}
            </li>
          </ul>
          {socials.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-1.5">
              {socials.map(([k, v]) => (
                <a key={k} href={safeHref(v)!} target="_blank" rel="noopener noreferrer" aria-label={SOCIAL_LABEL[k]} className="btn btn-icon">
                  <SocialIcon name={k} className="size-[17px]" />
                </a>
              ))}
            </div>
          )}
          <Link href={href("/contact")} className="mt-7 inline-flex items-center gap-2 font-display text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-cyan [font-stretch:112%]">
            {t.nav.contact}
            <Icon name="arrow" size={15} className="rtl:-scale-x-100" />
          </Link>
        </div>
      </div>

      <div aria-hidden className="pointer-events-none relative mx-auto -mb-[3.2vw] max-w-[1680px] select-none px-5 sm:px-8" dir="ltr">
        <Wordmark tone="ghost" className="h-auto w-full" />
      </div>

      <div className="relative border-t border-[var(--line)]">
        <div className="mx-auto flex max-w-[1680px] flex-col gap-3 px-5 py-6 text-xs text-fog sm:px-8 md:flex-row md:items-center md:justify-between">
          <p>
            © {year} BuildX HUE. {t.footer.disclaimer}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a href={APP_HREF} className="hover:text-chalk">
              {t.nav.signIn}
            </a>
            <Link href={href("/privacy")} className="hover:text-chalk">
              {t.footer.privacy}
            </Link>
            <Link href={href("/brand")} className="hover:text-chalk">
              {t.nav.brand}
            </Link>
            <Link href={href("/forms")} className="hover:text-chalk">
              {locale === "ar" ? "الفورمات المفتوحة" : "Open forms"}
            </Link>
            <Link href={href("/verify")} className="hover:text-chalk">
              {locale === "ar" ? "تحقّق من شهادة" : "Verify a certificate"}
            </Link>
            <Link href={localePath(locale === "en" ? "ar" : "en", "/")} hrefLang={locale === "en" ? "ar" : "en"} className="hover:text-chalk">
              {t.nav.language}
            </Link>
            <span className="font-mono tracking-wider">BUILD • INNOVATE • COMPETE</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
