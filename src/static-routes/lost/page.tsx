import type { Metadata } from "next";
import { StatusScreen } from "@/components/site/status-screen";
import { ButtonLink } from "@/components/ui/button";
import { getDictionary } from "@/i18n";
import { BASE_PATH } from "@/lib/deploy";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";

export const metadata: Metadata = { title: { absolute: "404 — BuildX HUE" }, robots: { index: false, follow: true } };

/**
 * GitHub Pages serves this as 404.html for every missing URL. A member, post, project or event
 * published after the last build has no page yet, so its clean URL is forwarded to the live page.
 * Old "/en/…" links go to the English page at the root (English has no /en prefix), and a page
 * built in the app (/p/<slug>) to the page that draws it (/p/?s=<slug>).
 */
const forward = `(function(){var b=${JSON.stringify(BASE_PATH)};var p=location.pathname;if(b&&p.indexOf(b)===0)p=p.slice(b.length);if(/^\\/en(\\/|$)/.test(p)){location.replace(b+(p.slice(3)||"/")+location.search+location.hash);return;}var q=p.match(/^(\\/ar)?\\/p\\/([a-z0-9][a-z0-9-]{1,48})\\/?$/);if(q){location.replace(b+(q[1]||"")+"/p/?s="+q[2]+location.hash);return;}var m=p.match(/^(\\/ar)?\\/(team|news|projects|events)\\/([a-z0-9]+(?:-[a-z0-9]+)*)\\/?$/);if(!m)return;var t={team:["/team/member/","u"],news:["/news/post/","s"],projects:["/projects/item/","s"],events:["/events/item/","s"]}[m[2]];location.replace(b+(m[1]||"")+t[0]+"?"+t[1]+"="+m[3]);})();`;

export default async function Lost({ params }: Params) {
  const { locale, t, href } = await resolvePage(params);
  const ar = getDictionary("ar");
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: forward }} />
      <StatusScreen bg={art("hero")} code="404" title={t.errors.notFound.title} body={t.errors.notFound.body}>
        <ButtonLink href={href("/")} variant="primary" arrow>
          {t.errors.home}
        </ButtonLink>
        <ButtonLink href={`${href("/join")}/`}>{t.nav.join}</ButtonLink>
        {locale === "en" && (
          <a href={`${BASE_PATH}/ar/`} lang="ar" dir="rtl" className="btn">
            <span>
              {ar.errors.notFound.title} · {ar.errors.home}
            </span>
          </a>
        )}
      </StatusScreen>
    </>
  );
}
