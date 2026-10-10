/**
 * Pages built from blocks in the BuildX App (public.site_pages): the shapes the app edits and the
 * site draws (src/components/pages/site-page.tsx), new blocks and page templates, and the Robotex
 * visit page as blocks (what /robotex shows until the team saves its own version).
 *
 * Every text is Arabic with an optional English version ({ ar, en }); the English site falls back to
 * the Arabic. Images are a built-in expo photo ("expo:<name>"), a photo uploaded in the app
 * ("site:<path in the site bucket>"), or a full https:// address.
 */
import { EXPO_BROCHURE, PAST_PHOTOS, expoPhoto } from "@/content/expo-photos";
import { EXPO_FORM, EXPO_SITE, expoVisit } from "@/content/expo-visit";
import { SUPABASE_URL } from "@/lib/supabase-public";
import type { PublicImage } from "@/lib/types";

export type T = { ar: string; en?: string };
export type Img = { src: string; alt?: T };
export type Btn = { label: T; href: string; primary?: boolean };
export type Countdown = { start: string; end: string; title: T; live: T; over: T };

type Head = { id: string; hidden?: boolean; anchor?: string; nav?: T; eyebrow: T; title: T; body?: T };
export type HeroBlock = Head & { type: "hero"; image?: Img | null; countdown?: Countdown | null; buttons: Btn[]; facts: { k: T; t: T; d: T }[] };
export type CardsBlock = Head & { type: "cards"; layout: "two" | "three" | "swipe"; items: { tag?: T; title: T; body: T; icon?: string; image?: Img | null; href?: string }[]; links: Btn[] };
export type Block =
  | HeroBlock
  | (Head & { type: "text" })
  | CardsBlock
  | (Head & { type: "steps"; items: { title: T; body: T }[] })
  | (Head & { type: "form"; form: string; counter: boolean })
  | (Head & { type: "status" })
  | (Head & { type: "timeline"; items: { title: T; body: T; icon?: string }[]; asideTitle: T; aside: T[] })
  | (Head & { type: "photos"; items: Img[]; album?: string; albumTitle?: T; albumEmpty?: T })
  | (Head & { type: "faq"; items: { q: T; a: T }[] })
  | (Head & { type: "buttons"; buttons: Btn[] })
  | (Head & { type: "video"; url: string });
export type BlockType = Block["type"];

export type PageSettings = { nav?: boolean; applyBar?: boolean };
export type SitePage = { slug: string; title: T; description: T; accent: string; blocks: Block[]; settings: PageSettings; updated_at?: string };

/** The page built into the site at its own address (not /p/<slug>). */
export const BUILT_IN: Record<string, string> = { robotex: "/robotex" };
export const pagePath = (slug: string) => BUILT_IN[slug] ?? `/p/${slug}`;

export const tx = (t: T | undefined | null, locale: string) => (t ? (locale === "en" && t.en?.trim()) || t.ar : "");
export const uidOf = () => Math.random().toString(36).slice(2, 9);
const t = (ar: string, en?: string): T => ({ ar, ...(en ? { en } : {}) });
const e: T = { ar: "" };

const siteUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/site/${path.split("/").map(encodeURIComponent).join("/")}`;

/** A block's picture as the site's image type (built-in expo photo, an uploaded one, or a link). */
export function imageOf(img: Img | null | undefined, locale: string): PublicImage | null {
  if (!img?.src) return null;
  const alt = tx(img.alt, locale);
  if (img.src.startsWith("expo:")) {
    const p = expoPhoto(img.src.slice(5), locale);
    return p ? { ...p, alt: alt || p.alt } : null;
  }
  const main = img.src.startsWith("site:") ? siteUrl(img.src.slice(5)) : /^https:\/\//.test(img.src) ? img.src : null;
  if (!main) return null;
  const thumb = img.src.startsWith("site:") ? main.replace(/\.w\.(webp|jpg)$/, ".t.$1") : main;
  return { src: main, avif: "", webp: thumb === main ? "" : `${thumb} 480w, ${main} 1600w`, width: 1600, height: 1000, placeholder: null, color: null, alt };
}

/** What the app's "add a part" menu offers, with a new block of each kind. */
export const BLOCK_KINDS: { type: BlockType; ar: string; hint: string; icon: string }[] = [
  { type: "hero", ar: "الواجهة", hint: "صورة كبيرة وعنوان وزراير وعدّاد", icon: "image" },
  { type: "text", ar: "نص", hint: "عنوان وفقرة", icon: "file" },
  { type: "cards", ar: "كروت", hint: "كروت بصور أو أيقونات (بتتسحب بالعرض على الموبايل)", icon: "layers" },
  { type: "steps", ar: "خطوات", hint: "خطوة 01، 02، 03…", icon: "list" },
  { type: "form", ar: "فورم التقديم", hint: "فورم من الفورمات + عدد الوفد", icon: "edit" },
  { type: "status", ar: "تابع طلبك", hint: "الطالب يعرف حالة طلبه بالكود", icon: "search" },
  { type: "timeline", ar: "جدول اليوم", hint: "اليوم ماشي إزاي + «خد معاك»", icon: "calendar" },
  { type: "photos", ar: "صور", hint: "صور بتتفتح على الشاشة كلها + ألبوم من الجاليري", icon: "image" },
  { type: "faq", ar: "أسئلة وأجوبة", hint: "أسئلة بتتفتح وتتقفل", icon: "quiz" },
  { type: "buttons", ar: "زراير", hint: "لينكات مهمة", icon: "link" },
  { type: "video", ar: "فيديو", hint: "فيديو من يوتيوب", icon: "play" },
];

export function newBlock(type: BlockType): Block {
  const id = uidOf();
  const head = { id, anchor: "", eyebrow: t(""), title: t("عنوان الجزء ده") };
  switch (type) {
    case "hero":
      return { ...head, type, eyebrow: t("BuildX HUE"), title: t("عنوان الصفحة"), body: t("سطرين عن الصفحة."), image: null, countdown: null, buttons: [{ label: t("قدّم دلوقتي", "Apply now"), href: "#apply", primary: true }], facts: [] };
    case "text":
      return { ...head, type, body: t("اكتب هنا.") };
    case "cards":
      return { ...head, type, layout: "three", items: [{ title: t("كارت 1"), body: t("وصف قصير"), icon: "robot" }, { title: t("كارت 2"), body: t("وصف قصير"), icon: "ai" }, { title: t("كارت 3"), body: t("وصف قصير"), icon: "cpu" }], links: [] };
    case "steps":
      return { ...head, type, title: t("ماشية إزاي"), items: [{ title: t("قدّم"), body: t("املأ الفورم.") }, { title: t("الفريق بيراجع"), body: t("بنرد عليك على واتساب.") }, { title: t("يوم الفعالية"), body: t("نتقابل هناك.") }] };
    case "form":
      return { ...head, type, anchor: "apply", nav: t("قدّم", "Apply"), title: t("قدّم", "Apply"), form: "", counter: false };
    case "status":
      return { ...head, type, anchor: "status", nav: t("تابع طلبك", "Your status"), title: t("اعرف حالة طلبك", "Your application status"), body: t("اكتب كود الطلب ورقم الموبايل اللي قدّمت بيه.", "Enter your reference code and the mobile number you applied with.") };
    case "timeline":
      return { ...head, type, anchor: "day", title: t("اليوم هيمشي إزاي"), items: [{ title: t("التجمع"), body: t("نتقابل في مكان التجمع."), icon: "users" }, { title: t("الفعالية"), body: t("…"), icon: "rocket" }], asideTitle: t("خد معاك"), aside: [t("البطاقة")] };
    case "photos":
      return { ...head, type, anchor: "photos", title: t("صور"), items: [], album: "" };
    case "faq":
      return { ...head, type, anchor: "faq", nav: t("أسئلة", "FAQ"), title: t("أسئلة"), items: [{ q: t("سؤال؟"), a: t("الإجابة.") }] };
    case "buttons":
      return { ...head, type, title: t("لينكات"), buttons: [{ label: t("اللينك"), href: "https://", primary: true }] };
    case "video":
      return { ...head, type, title: t("فيديو"), url: "" };
  }
}

/** The Robotex visit page as blocks (both languages from the built-in content). */
export function robotexPage(): SitePage {
  const a = expoVisit("ar");
  const n = expoVisit("en");
  const both = (x: string, y: string) => t(x, y);
  return {
    slug: "robotex",
    title: both(a.meta.title, n.meta.title),
    description: both(a.meta.description, n.meta.description),
    accent: "#ff7a45",
    settings: { nav: true, applyBar: true },
    blocks: [
      {
        id: "hero",
        type: "hero",
        eyebrow: both(a.eyebrow, n.eyebrow),
        title: both(a.title, n.title),
        body: both(a.body, n.body),
        image: { src: "expo:hero" },
        countdown: { start: "2026-11-14T08:00:00Z", end: "2026-11-16T16:00:00Z", title: both(a.countdown.title, n.countdown.title), live: both(a.countdown.live, n.countdown.live), over: both(a.countdown.over, n.countdown.over) },
        buttons: [
          { label: both(a.apply, n.apply), href: "#apply", primary: true },
          { label: both(a.track, n.track), href: "#status" },
        ],
        facts: a.facts.map((f, i) => ({ k: both(f.k, n.facts[i]!.k), t: both(f.t, n.facts[i]!.t), d: both(f.d, n.facts[i]!.d) })),
      },
      {
        id: "about",
        type: "cards",
        anchor: "about",
        nav: both(a.nav[0]![1], n.nav[0]![1]),
        eyebrow: both(a.aboutEyebrow, n.aboutEyebrow),
        title: both(a.aboutTitle, n.aboutTitle),
        layout: "two",
        items: a.about.map((x, i) => ({ tag: both(x.tag, n.about[i]!.tag), title: both(x.name, n.about[i]!.name), body: both(x.body, n.about[i]!.body) })),
        links: [
          { label: both(a.brochure, n.brochure), href: EXPO_BROCHURE },
          { label: both(a.official, n.official), href: EXPO_SITE },
        ],
      },
      {
        id: "areas",
        type: "cards",
        anchor: "areas",
        nav: both(a.nav[1]![1], n.nav[1]![1]),
        eyebrow: both(a.seeEyebrow, n.seeEyebrow),
        title: both(a.seeTitle, n.seeTitle),
        layout: "swipe",
        items: a.see.map((x, i) => ({ icon: x.icon, title: both(x.t, n.see[i]!.t), body: both(x.b, n.see[i]!.b), image: a.seeImages[i] ? { src: `expo:${a.seeImages[i]}` } : null })),
        links: [],
      },
      {
        id: "steps",
        type: "steps",
        eyebrow: both(a.stepsEyebrow, n.stepsEyebrow),
        title: both(a.stepsTitle, n.stepsTitle),
        items: a.steps.map((x, i) => ({ title: both(x.t, n.steps[i]!.t), body: both(x.b, n.steps[i]!.b) })),
      },
      { id: "apply", type: "form", anchor: "apply", nav: both(a.nav[2]![1], n.nav[2]![1]), eyebrow: both(a.applyEyebrow, n.applyEyebrow), title: both(a.applyTitle, n.applyTitle), form: EXPO_FORM, counter: true },
      { id: "status", type: "status", anchor: "status", nav: both(a.nav[3]![1], n.nav[3]![1]), eyebrow: both(a.statusEyebrow, n.statusEyebrow), title: both(a.statusTitle, n.statusTitle), body: both(a.statusBody, n.statusBody) },
      {
        id: "day",
        type: "timeline",
        anchor: "day",
        nav: both(a.nav[4]![1], n.nav[4]![1]),
        eyebrow: both(a.planEyebrow, n.planEyebrow),
        title: both(a.planTitle, n.planTitle),
        body: both(a.planNote, n.planNote),
        items: a.plan.map((x, i) => ({ icon: x.icon, title: both(x.t, n.plan[i]!.t), body: both(x.b, n.plan[i]!.b) })),
        asideTitle: both(a.bringTitle, n.bringTitle),
        aside: a.bring.map((x, i) => both(x, n.bring[i]!)),
      },
      {
        id: "photos",
        type: "photos",
        anchor: "photos",
        nav: both(a.nav[5]![1], n.nav[5]![1]),
        eyebrow: both(a.pastEyebrow, n.pastEyebrow),
        title: both(a.pastTitle, n.pastTitle),
        body: both(a.pastBody, n.pastBody),
        items: PAST_PHOTOS.map((k) => ({ src: `expo:${k}` })),
        album: "robotex",
        albumTitle: both(a.albumTitle, n.albumTitle),
        albumEmpty: both(a.albumEmpty, n.albumEmpty),
      },
      {
        id: "faq",
        type: "faq",
        anchor: "faq",
        nav: both(a.nav[6]![1], n.nav[6]![1]),
        eyebrow: both(a.faqEyebrow, n.faqEyebrow),
        title: both(a.faqTitle, n.faqTitle),
        items: a.faq.map((x, i) => ({ q: both(x.q, n.faq[i]!.q), a: both(x.a, n.faq[i]!.a) })),
      },
    ],
  };
}

/** Templates for a new page in the app. */
export const TEMPLATES: { k: string; ar: string; hint: string; make: () => Pick<SitePage, "blocks" | "settings" | "accent"> }[] = [
  { k: "blank", ar: "صفحة فاضية", hint: "واجهة ونص، وضيف اللي انت عايزه", make: () => ({ accent: "#2b6dff", settings: { nav: false, applyBar: false }, blocks: [newBlock("hero"), newBlock("text")] }) },
  {
    k: "visit",
    ar: "زيارة معرض (زي Robotex)",
    hint: "نفس أجزاء صفحة المعرض: عدّاد، كروت، خطوات، فورم، تابع طلبك، اليوم، صور وأسئلة",
    make: () => {
      const p = robotexPage();
      const fresh = p.blocks.map((b) => ({ ...b, id: uidOf() })) as Block[];
      return { accent: p.accent, settings: p.settings, blocks: fresh.map((b) => (b.type === "form" ? { ...b, form: "", counter: false } : b.type === "photos" ? { ...b, album: "" } : b)) };
    },
  },
  {
    k: "event",
    ar: "فعالية / ورشة",
    hint: "واجهة، عن الفعالية، الجدول، فورم التسجيل وأسئلة",
    make: () => ({ accent: "#2b6dff", settings: { nav: true, applyBar: true }, blocks: [newBlock("hero"), { ...newBlock("text"), anchor: "about", nav: t("عن الفعالية", "About") }, { ...newBlock("timeline"), nav: t("الجدول", "Schedule") }, newBlock("form"), newBlock("status"), newBlock("faq")] }),
  },
];

/** A page someone saved can carry anything: keep only blocks the site knows how to draw. */
export function cleanPage(raw: unknown): SitePage | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<SitePage>;
  if (typeof p.slug !== "string" || !Array.isArray(p.blocks)) return null;
  const kinds = new Set(BLOCK_KINDS.map((k) => k.type));
  return {
    slug: p.slug,
    title: p.title && typeof p.title.ar === "string" ? p.title : e,
    description: p.description && typeof p.description.ar === "string" ? p.description : e,
    accent: typeof p.accent === "string" && /^#[0-9a-f]{6}$/i.test(p.accent) ? p.accent : "#2b6dff",
    settings: p.settings && typeof p.settings === "object" ? p.settings : {},
    blocks: p.blocks.filter((b): b is Block => !!b && typeof b === "object" && kinds.has((b as Block).type) && typeof (b as Block).id === "string"),
    updated_at: p.updated_at,
  };
}
