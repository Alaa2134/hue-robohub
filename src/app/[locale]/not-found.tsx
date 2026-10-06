import { locale as rootLocale } from "next/root-params";
import { StatusScreen } from "@/components/site/status-screen";
import { ButtonLink } from "@/components/ui/button";
import { getDictionary, isLocale, localePath, type Locale } from "@/i18n";
import { art } from "@/lib/media-library";

export default async function NotFound() {
  const raw = await rootLocale();
  const locale: Locale = isLocale(raw) ? raw : "en";
  const t = getDictionary(locale);
  return (
    <StatusScreen bg={art("hero")} code="404" title={t.errors.notFound.title} body={t.errors.notFound.body}>
      <ButtonLink href={localePath(locale, "/")} variant="primary" arrow>
        {t.errors.home}
      </ButtonLink>
      <ButtonLink href={localePath(locale, "/projects")}>{t.nav.projects}</ButtonLink>
    </StatusScreen>
  );
}
