import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { Directory } from "@/components/pages/directory";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { DIRECTORY, fromRow, type DirRow } from "@/content/directory";
import { buildDirectory } from "@/lib/build-content";
import { STATIC_SITE } from "@/lib/deploy";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export const revalidate = 3600;

const COPY = {
  ar: { eyebrow: "مواقع هتفيدك", title: "مواقع هتفيدك", body: "مواقع وأدوات بنستخدمها ونرشحها: محاكاة دواير، تصميم 3D، ذكاء اصطناعي، روبوتكس وبرمجة. كل موقع معاه فكرته وأول حاجة تجربها." },
  en: { eyebrow: "Useful websites", title: "Websites worth knowing", body: "Sites and tools we use and recommend: circuit simulation, 3D design, AI, robotics and programming — each with what it's for and the first thing to try." },
};

/** Screenshots taken by the "Directory screenshots" workflow (copied in before the build). */
function shots(ids: Set<string>): string[] {
  const dir = path.join(process.cwd(), "public", "media", "directory");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".webp"))
    .map((f) => f.slice(0, -5))
    .filter((id) => ids.has(id));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  return pageMeta({ locale, path: "/directory", title: COPY[locale].title, description: COPY[locale].body, image: art("macro", "track_embedded", "hero")?.og });
}

export default async function DirectoryPage({ params }: Params) {
  const { locale, t, href } = await resolvePage(params);
  const c = COPY[locale];
  // The team's list (from the app) when the build can read it, else the one in the code.
  const rows = STATIC_SITE ? await buildDirectory<DirRow>() : [];
  const sites = rows.length ? rows.map(fromRow) : DIRECTORY;
  return (
    <>
      <PageHero eyebrow={c.eyebrow} title={c.title} body={c.body} image={art("macro", "track_embedded", "hero")} crumbs={[{ label: t.nav.home, href: href("/") }, { label: c.title }]} size="md" />
      <Band tight>
        <Directory locale={locale} sites={sites} shots={shots(new Set(sites.map((s) => s.id)))} />
      </Band>
    </>
  );
}
