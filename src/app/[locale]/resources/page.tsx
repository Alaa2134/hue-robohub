import type { Metadata } from "next";
import { Icon, type IconName } from "@/components/brand/icons";
import { safeHref } from "@/components/brand/social-icons";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { EmptyState } from "@/components/ui/empty-state";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { getResources } from "@/server/queries/public";

export const revalidate = 3600;
const KIND_ICON: Record<string, IconName> = { guide: "book", datasheet: "cpu", video: "film", repository: "github", course: "rocket", tool: "wrench" };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, t } = await resolvePage(params);
  return pageMeta({ locale, path: "/resources", title: t.resources.title, description: t.resources.body, image: art("macro", "track_embedded", "hero")?.og });
}

export default async function Resources({ params }: Params) {
  const { t, href } = await resolvePage(params);
  const items = await getResources();
  const groups = [...new Set(items.map((r) => r.trackName ?? "General"))];
  return (
    <>
      <PageHero eyebrow={t.resources.eyebrow} title={t.resources.title} body={t.resources.body} image={art("macro", "track_embedded", "hero")} crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.resources }]} size="md" />
      <Band tight>
        {items.length ? (
          <div className="flex flex-col gap-14">
            {groups.map((g) => (
              <section key={g}>
                <p className="t-eyebrow text-mist">{g}</p>
                <ul className="mt-5 grid gap-3 md:grid-cols-2">
                  {items
                    .filter((r) => (r.trackName ?? "General") === g)
                    .map((r) => {
                      const url = safeHref(r.url) ?? (r.url.startsWith("/") ? r.url : null);
                      return (
                        <li key={r.id}>
                          <a href={url ?? "#"} target="_blank" rel="noopener noreferrer" className="frame flex items-start gap-4 p-5 transition-colors hover:bg-panel/60">
                            <Icon name={KIND_ICON[r.kind] ?? "book"} size={20} className="mt-0.5 shrink-0 text-cyan" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-chalk">{r.title}</span>
                              {r.description && <span className="mt-1 block text-sm text-mist">{r.description}</span>}
                            </span>
                            <span className="t-eyebrow shrink-0 text-[0.52rem] text-fog">{r.kind}</span>
                          </a>
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState icon="book" title={t.resources.title} body={t.resources.empty} />
        )}
      </Band>
    </>
  );
}
