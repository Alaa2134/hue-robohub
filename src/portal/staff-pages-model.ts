/** Page builder: the page row as the app keeps it, and helpers shared by its screens. */
import { BLOCK_KINDS, BUILT_IN, type Block, type BlockType, type PageSettings, type SitePage } from "@/lib/site-pages";
import { SITE_ORIGIN } from "./core";

export type PageRow = {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  accent: string;
  blocks: Block[];
  settings: PageSettings;
  published: boolean;
  archived: boolean;
  updated_at: string;
  /** Goes up / comes down by itself (Cairo time in the editor). */
  publish_at?: string | null;
  unpublish_at?: string | null;
};
export type Version = { id: number; title_ar: string; title_en: string | null; description_ar: string | null; description_en: string | null; accent: string; blocks: Block[]; settings: PageSettings; saved_by: string | null; saved_at: string };
export const COLS = "id, slug, title_ar, title_en, description_ar, description_en, accent, blocks, settings, published, archived, updated_at, publish_at, unpublish_at";
export type FormLite = { id: string; slug: string; title_ar: string; open: boolean; archived: boolean; opens_at: string | null; closes_at: string | null };

export const formsOf = (blocks: Block[]) => [...new Set(blocks.flatMap((b) => (b.type === "form" && b.form ? [b.form] : [])))];
export const siteLink = (slug: string) => `${SITE_ORIGIN}/ar${BUILT_IN[slug] ?? `/p/${slug}`}/`;
export const kindOf = (t: BlockType) => BLOCK_KINDS.find((k) => k.type === t)!;
export const asPage = (r: Pick<PageRow, "slug" | "title_ar" | "title_en" | "description_ar" | "description_en" | "accent" | "blocks" | "settings">): SitePage => ({
  slug: r.slug,
  title: { ar: r.title_ar, en: r.title_en ?? undefined },
  description: { ar: r.description_ar ?? "", en: r.description_en ?? undefined },
  accent: r.accent,
  blocks: r.blocks,
  settings: r.settings,
});
export const fromPage = (p: SitePage): Omit<PageRow, "id" | "published" | "archived" | "updated_at" | "publish_at" | "unpublish_at"> => ({
  slug: p.slug,
  title_ar: p.title.ar,
  title_en: p.title.en || null,
  description_ar: p.description.ar || null,
  description_en: p.description.en || null,
  accent: p.accent,
  blocks: p.blocks,
  settings: p.settings,
});
export type Ctx = { en: boolean; forms: FormLite[] };
