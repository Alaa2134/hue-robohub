/**
 * What Baqloz knows: the site's own reference content (tracks, competition teams, the bootcamp,
 * activities, the season's plan and goals, the FAQ). Both of his brains use it: the one in the
 * browser (brain.ts) and the AI one on the server (supabase/functions/bakloz-chat, which gets
 * `knowledgeText()` written into it by scripts/build-guide-knowledge.ts).
 *
 * Only what the site itself says: nothing here invents dates, prices or results.
 */
import { ACTIVITIES, GOALS, PLANNED_EVENTS, ROADMAP, SEASON } from "@/content/buildx";
import { coreBootcamp, coreTeams, coreTracks } from "@/content/core-content";
import { FAQ_DEFAULTS } from "@/content/faq";

export type KTrack = { slug: string; name: string; nameEn: string; tagline: string; description: string; tech: string[]; tools: string[]; competitions: string[]; roadmap: string[] };
export type KTeam = { slug: string; name: string; nameEn: string; discipline: string; summary: string; description: string; specs: string[] };

export const KB = {
  season: SEASON.ar,
  tracks: coreTracks.map(
    (t): KTrack => ({
      slug: t.slug,
      name: t.nameAr,
      nameEn: t.name,
      tagline: t.taglineAr,
      description: t.descriptionAr,
      tech: [...t.technologiesAr],
      tools: [...t.tools],
      competitions: [...t.competitions],
      roadmap: t.roadmap.map(([stage, title, body]) => `${stage}: ${title} (${body})`),
    }),
  ),
  teams: coreTeams.map(
    (t): KTeam => ({
      slug: t.slug,
      name: t.nameAr,
      nameEn: t.name,
      discipline: t.disciplineAr,
      summary: t.summaryAr,
      description: t.descriptionAr,
      specs: t.specsAr.map(([k, v]) => `${k}: ${v}`),
    }),
  ),
  bootcamp: coreBootcamp.map((w) => ({ week: w.week, title: w.title, summary: w.summary })),
  activities: ACTIVITIES.map((a) => ({ title: a.title.ar, body: a.body.ar })),
  events: PLANNED_EVENTS.map((e) => ({ when: e.when?.ar ?? null, title: e.title.ar, body: e.body.ar })),
  roadmap: ROADMAP.map((r) => ({ q: r.q, when: r.when.ar, title: r.title.ar, items: r.items.map((i) => i.ar) })),
  goals: GOALS.map((g) => ({ value: g.value, label: g.label.ar })),
  faq: FAQ_DEFAULTS.ar,
};

/** The same knowledge as compact text, for the AI guide's instructions. */
export function knowledgeText(): string {
  const lines: string[] = [];
  lines.push(`BuildX HUE: مجتمع طلابي في جامعة حورس – مصر للروبوتكس والابتكار. الموسم: ${KB.season}. الموقع: buildxhue.com. الشعار: Build • Innovate • Compete.`);
  lines.push("\n## التراكات (المسارات)");
  for (const t of KB.tracks)
    lines.push(`- ${t.name} (${t.nameEn}) [/tracks/${t.slug}]: ${t.tagline} ${t.description} التقنيات: ${t.tech.join("، ")}. الأدوات: ${t.tools.join(", ")}. المسابقات: ${t.competitions.join(", ") || "—"}. المراحل: ${t.roadmap.join(" | ")}`);
  lines.push("\n## فرق المسابقات");
  for (const t of KB.teams) lines.push(`- ${t.name} (${t.nameEn}) [/competitions/${t.slug}]: ${t.discipline}. ${t.summary} ${t.description} ${t.specs.join("، ")}`);
  lines.push("\n## البوتكامب (/bootcamp)");
  for (const w of KB.bootcamp) lines.push(`- الأسبوع ${w.week}: ${w.title} — ${w.summary}`);
  lines.push("\n## الأنشطة");
  for (const a of KB.activities) lines.push(`- ${a.title}: ${a.body}`);
  lines.push("\n## الإيفنتات المخططة للموسم (التفاصيل الحية في /events)");
  for (const e of KB.events) lines.push(`- ${e.title}${e.when ? ` (${e.when})` : ""}: ${e.body}`);
  lines.push("\n## خطة السنة");
  for (const r of KB.roadmap) lines.push(`- ${r.q} ${r.when}: ${r.title} — ${r.items.join("، ")}`);
  lines.push("\n## أهداف الموسم (أهداف مش نتائج)");
  lines.push(KB.goals.map((g) => `${g.value} ${g.label}`).join("، "));
  lines.push("\n## الأسئلة الشائعة");
  for (const f of KB.faq) lines.push(`- س: ${f.q}\n  ج: ${f.a}`);
  lines.push(
    "\n## الصفحات",
    "/ الرئيسية، /about عن BuildX، /tracks التراكات، /competitions المسابقات، /bootcamp البوتكامب، /events الإيفنتات، /projects المشاريع، /team الفريق، /achievements الإنجازات، /news الأخبار، /gallery الصور، /films الفيديوهات، /resources المصادر، /sponsors الشركاء، /faq الأسئلة الشائعة، /contact التواصل، /join التقديم، /join/status متابعة الطلب، /verify التحقق من شهادة، /forms الفورمات المفتوحة (اختبارات الفرق والتطوع والتجديد)، /privacy الخصوصية، /brand الهوية. التطبيق: /app (للطلبة والفريق: حضور وتاسكات ونقط وشهادات).",
  );
  return lines.join("\n");
}
