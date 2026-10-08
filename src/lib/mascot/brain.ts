/**
 * Baqloz's own brain (runs in the browser, no network): understands a question in Egyptian or
 * standard Arabic or English, remembers what you were talking about ("and its tools?" after a
 * track), recommends a track from your interests, compares tracks, and answers from the site's own
 * knowledge (knowledge.ts) in varied Egyptian Arabic. Questions it can't place go to the
 * navigation answers in guide.ts, then to an honest "I don't know".
 *
 * The AI brain on the server (when enabled) writes the text instead; this one still supplies the
 * links and follow-up suggestions.
 */
import { KB, type KTeam, type KTrack } from "./knowledge";
import { matchIntent, normalize, type GuideAction } from "./guide";
import { eventLine, type Live } from "./live";

export type Topic = { kind: "track"; slug: string } | { kind: "team"; slug: string } | { kind: "bootcamp" } | { kind: "events" } | { kind: "join" } | { kind: "about" };
export type Memory = { topic?: Topic; name?: string; turns: number };
export type BrainReply = { text: string; href?: string; section?: string; label?: string; action?: GuideAction; followups: string[]; topic?: Topic };

const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
const has = (q: string, keys: string[]) => keys.some((k) => {
  const key = normalize(k);
  return key.length <= 3 ? q.includes(` ${key} `) : q.includes(key);
});

// ── Recognising things ──
const TRACK_ALIASES: Record<string, string[]> = {
  "robotics-embedded": ["robot", "robotics", "embedded", "arduino", "esp32", "microcontroller", "روبوت", "روبوتكس", "روبوتات", "اردوينو", "امبيدد", "مدمجه", "ميكروكنترولر", "الكترونيات"],
  "ai-ml": ["ai", "machine learning", "deep learning", "ml", "computer vision", "data science", "ذكاء", "ذكاء اصطناعي", "تعلم الاله", "رؤيه حاسوبيه", "داتا"],
  software: ["software", "web", "frontend", "backend", "mobile app", "flutter", "react", "سوفتوير", "برمجيات", "ويب", "فرونت", "باك اند", "تطبيقات"],
  iot: ["iot", "internet of things", "smart home", "انترنت الاشياء", "اي او تي", "سمارت"],
  "3d-design": ["3d", "cad", "solidworks", "fusion", "3d print", "طباعه ثلاثيه", "ثري دي", "كاد", "تصميم ميكانيكي", "تصنيع"],
  "media-design": ["media", "graphic", "video editing", "photography", "montage", "ميديا", "جرافيك", "مونتاج", "تصوير", "ديزاين", "تصميم جرافيك"],
  business: ["business", "startup", "entrepreneur", "marketing", "بيزنس", "ستارت اب", "ريادة", "ريادة اعمال", "ماركتنج", "تسويق"],
};
const TEAM_ALIASES: Record<string, string[]> = {
  "line-follower": ["line follower", "linefollower", "sprint", "لاين فولور", "تتبع الخط", "متتبع الخط", "سبرنت"],
  sumo: ["sumo", "سومو"],
  "iot-challenges": ["iot challenge", "تحدي iot", "تحديات iot", "تحديات اي او تي"],
  "ai-hackathons": ["hackathon", "هاكاثون", "هاكثون"],
  programming: ["programming contest", "icpc", "competitive programming", "مسابقات البرمجه", "برمجه تنافسيه"],
  "green-innovation": ["green", "environment", "sustainab", "بيئه", "اخضر", "استدامه"],
};

/** Interests → the track that fits (for "I like X, what should I pick?"). */
const INTERESTS: [string[], string][] = [
  [["hardware", "electronics", "circuits", "build things", "الكترونيات", "دوائر", "هاردوير", "بحب اصلح", "بفك"], "robotics-embedded"],
  [["math", "data", "python", "statistics", "رياضه", "رياضيات", "داتا", "بايثون", "احصاء"], "ai-ml"],
  [["coding", "programming", "apps", "websites", "games", "برمجه", "بكود", "مواقع", "العاب"], "software"],
  [["sensors", "smart", "network", "حساسات", "شبكات", "بيت ذكي"], "iot"],
  [["drawing", "modeling", "mechanical", "رسم", "ميكانيكا", "تصميم ميكانيكي", "نمذجه"], "3d-design"],
  [["art", "design", "photo", "video", "social media", "فن", "ديزاين", "تصوير", "فيديو", "سوشيال", "مونتاج"], "media-design"],
  [["money", "marketing", "sales", "management", "فلوس", "تسويق", "مبيعات", "اداره", "مشروع خاص"], "business"],
];

const ASPECT = {
  tools: ["tools", "software", "programs", "use", "ادوات", "اداوات", "برامج", "بيستخدموا", "هستخدم", "عدة"],
  learn: ["learn", "roadmap", "curriculum", "study", "syllabus", "هتعلم", "هتعلمه", "اتعلم", "منهج", "بيدرسوا", "مراحل", "رود ماب", "ماده", "محتوي"],
  compete: ["competition", "compete", "contest", "مسابق", "منافس", "تنافس"],
  what: ["what is", "explain", "about", "يعني ايه", "ايه هو", "ايه هي", "اشرح", "احكيلي", "عرفني", "قولي عن", "ايه ده"],
  join: ["join", "apply", "register", "انضم", "اقدم", "اشترك", "اسجل", "ادخل"],
  compare: ["difference", "vs", "versus", "better", "الفرق", "احسن", "افضل", "ولا"],
  recommend: ["recommend", "which", "should i", "suggest", "اختار", "انهي", "انسب", "تنصحني", "رشحلي", "محتار", "مناسب"],
  how_long: ["how long", "duration", "weeks", "مدته", "مده", "كام اسبوع", "كام شهر", "بياخد قد ايه"],
  when: ["when", "date", "امتي", "ميعاد", "مواعيد", "تاريخ", "الجاي"],
};

function findTrack(q: string): KTrack | undefined {
  for (const t of KB.tracks) if (has(q, [...(TRACK_ALIASES[t.slug] ?? []), t.name, t.nameEn])) return t;
}
function findTracks(q: string): KTrack[] {
  return KB.tracks.filter((t) => has(q, [...(TRACK_ALIASES[t.slug] ?? []), t.name, t.nameEn]));
}
function findTeam(q: string): KTeam | undefined {
  for (const t of KB.teams) if (has(q, [...(TEAM_ALIASES[t.slug] ?? []), t.name, t.nameEn])) return t;
}

// ── Saying things ──
const OPEN = ["بص يا سيدي،", "حلو السؤال ده 👌", "بص،", "تمام،", "أكيد!", "ماشي،"];
const open = () => pick(OPEN);

function trackAnswer(t: KTrack, aspect: string | null): Pick<BrainReply, "text" | "followups"> {
  const f = [`أدوات ${t.name} إيه؟`, `هتعلم إيه في ${t.name}؟`, "إزاي أنضم؟"];
  if (aspect === "tools") return { text: `${open()} في ${t.name} هتشتغل بـ ${t.tools.join("، ")}. وهتتعامل كمان مع ${t.tech.slice(0, 3).join("، ")}.`, followups: [`هتعلم إيه في ${t.name}؟`, "فيه مسابقات ليه؟", "إزاي أنضم؟"] };
  if (aspect === "learn") return { text: `${open()} الطريق في ${t.name} ماشي كده: ${t.roadmap.map((r) => r.split(" (")[0]).join(" ← ")}. يعني من الأساسيات لحد مشاريع حقيقية 💪`, followups: [`أدوات ${t.name} إيه؟`, "فيه مسابقات ليه؟", "إزاي أنضم؟"] };
  if (aspect === "compete") return { text: t.competitions.length ? `أيوه! ${t.name} بيجهّزك لـ ${t.competitions.join(" و")} 🏁` : `${t.name} مش مرتبط بمسابقة معينة، بس مشاريعه بتدخل في الهاكاثونات ومعرض المشاريع.`, followups: f };
  return { text: `${t.name}: ${t.tagline} ${t.description}`, followups: f };
}

function teamAnswer(t: KTeam): Pick<BrainReply, "text" | "followups"> {
  return { text: `${t.name} (${t.discipline}): ${t.summary} ${t.description}`, followups: ["إزاي أدخل فريق مسابقات؟", "فيه فرق تانية؟", "المسابقات دي إمتى؟"] };
}

const LIST_TRACKS = () => KB.tracks.map((t) => t.name).join("، ");

/** Small talk first (with a name he remembers), then knowledge, then navigation, then honesty. */
export function think(question: string, mem: Memory, path: string, live?: Live | null): BrainReply {
  const q = ` ${normalize(question)} `;
  const name = mem.name ? ` يا ${mem.name}` : "";

  // ── Small talk ──
  const named = question.match(/(?:اسمي|انا اسمي|my name is|i'm|i am)\s+([\p{L}]{2,20})/iu);
  if (named && !/بقلظ/.test(named[1])) {
    mem.name = named[1];
    return { text: pick([`أهلاً يا ${named[1]}! 👋 تشرفنا. تحب أحكيلك عن إيه؟`, `يا أهلاً يا ${named[1]} 😄 أنا بقلظ. اسألني أي حاجة.`]), followups: ["إيه التراكات؟", "إزاي أنضم؟", "تيجي نعمل جولة؟"] };
  }
  if (has(q, ["who are you", "your name", "انت مين", "اسمك", "مين انت", "بقلظ مين"])) return { text: pick(["أنا بقلظ 👋 مرشدك في BuildX HUE. بلف معاك الموقع، وأجاوبك، وأساعدك تختار تراكك.", "أنا بقلظ! أكتر واحد فاهم في BuildX 😎 اسألني أي حاجة."]), followups: ["إيه هي BuildX؟", "إيه التراكات؟", "تيجي نعمل جولة؟"] };
  if (has(q, ["how are you", "ازيك", "عامل ايه", "اخبارك", "عامل اي", "ايه الاخبار"])) return { text: pick([`الحمد لله تمام${name} 😄 وإنت عامل إيه؟`, `فُل الفل${name}! جاهز أساعدك 💪`]), followups: ["إيه التراكات؟", "الإيفنت الجاي إمتى؟"] };
  if (has(q, ["thanks", "thank you", "شكرا", "متشكر", "تسلم", "ميرسي", "حبيبي"])) return { text: pick([`العفو${name} 🙏 أنا هنا في أي وقت.`, "تحت أمرك يا باشا 😄", "ولا يهمك! لو احتجت أي حاجة تاني دوس عليّا."]), followups: [] };
  if (has(q, ["bye", "سلام", "باي", "مع السلامه", "يلا سلام"])) return { text: pick(["مع السلامة 👋 ومتنساش تبص على التراكات!", "سلام! ولو رجعت هتلاقيني هنا 😄"]), followups: [] };
  if (has(q, ["joke", "funny", "نكته", "ضحكني", "هزار", "قول حاجه حلوه"]))
    return { text: pick(["مرة روبوت دخل امتحان… جاب صفر عشان جاوب بـ 0 و1 بس 😂", "ليه الروبوت مبيزعلش؟ عشان عنده Ctrl+Z لأي موقف 😄", "مهندس سأل الأردوينو: إنت كويس؟ قاله: HIGH 😂"]), followups: ["قول نكتة تانية", "إيه التراكات؟"] };
  if (has(q, ["love you", "بحبك", "انت جامد", "انت حلو", "شاطر", "عسل"])) return { text: pick(["يا عم ده إنت اللي جامد 😍", "كده هتكسفني 🙈 يلا اسألني حاجة أفيدك بيها."]), followups: [] };
  if (has(q, ["tour", "جوله", "لفه", "فرجني", "وريني الموقع", "خدني لفه"])) return { text: "يلا بينا! دوس على «يلا بينا» وأنا هاخدك لفّة في الموقع كله 🚶", action: "tour" as GuideAction, label: "يلا بينا", followups: [] };

  // ── Comparing and recommending ──
  const tracks = findTracks(q);
  if (tracks.length >= 2 && has(q, ASPECT.compare)) {
    const [a, b] = tracks;
    return { text: `الفرق ببساطة: ${a.name} = ${a.tagline} أما ${b.name} = ${b.tagline} لو بتحب الحاجة اللي بتتلمس اختار الأولى، ولو الكود والأفكار أكتر اختار التانية… وتقدر تجرب الاتنين 😉`, href: "/tracks", label: "قارن التراكات", followups: [`أدوات ${a.name} إيه؟`, `أدوات ${b.name} إيه؟`] };
  }
  const interest = INTERESTS.find(([keys]) => has(q, keys));
  if (interest && (has(q, ASPECT.recommend) || has(q, ["بحب", "like", "love", "مهتم", "interested", "شاطر في"]))) {
    const t = KB.tracks.find((x) => x.slug === interest[1])!;
    return { text: `من كلامك شكلك هتحب ${t.name} 🎯 ${t.tagline} ${t.description}`, href: `/tracks/${t.slug}`, label: "شوف التراك", topic: { kind: "track", slug: t.slug }, followups: [`أدوات ${t.name} إيه؟`, `هتعلم إيه في ${t.name}؟`, "إزاي أنضم؟"] };
  }
  if (has(q, ASPECT.recommend) && has(q, ["track", "تراك", "مسار"]))
    return { text: `قولّي بتحب إيه وأنا أختارلك 😄 مثلاً: «بحب الإلكترونيات» أو «بحب البرمجة» أو «بحب التصميم». التراكات عندنا: ${LIST_TRACKS()}.`, href: "/tracks", label: "التراكات", followups: ["بحب الإلكترونيات", "بحب البرمجة", "بحب الرسم والتصميم"] };

  // ── A specific track or team (or the one we were talking about) ──
  const aspect = (["tools", "learn", "compete"] as const).find((a) => has(q, ASPECT[a])) ?? null;
  const team = findTeam(q);
  if (team && !tracks.length) return { ...teamAnswer(team), href: `/competitions/${team.slug}`, label: "شوف الفريق", topic: { kind: "team", slug: team.slug } };
  const track = tracks[0] ?? (aspect && mem.topic?.kind === "track" ? KB.tracks.find((t) => t.slug === (mem.topic as { slug: string }).slug) : undefined);
  if (track) return { ...trackAnswer(track, aspect), href: `/tracks/${track.slug}`, label: "شوف التراك", topic: { kind: "track", slug: track.slug } };
  if (mem.topic?.kind === "team" && (aspect || has(q, ASPECT.what))) {
    const t = KB.teams.find((x) => x.slug === (mem.topic as { slug: string }).slug);
    if (t) return { ...teamAnswer(t), href: `/competitions/${t.slug}`, label: "شوف الفريق", topic: mem.topic };
  }

  // ── Live: what's on right now ──
  if (live) {
    const ev = live.events;
    if (has(q, ["seat", "seats", "places", "اماكن", "مكان", "فاضل", "كامل العدد"]) && ev.length) {
      const e = ev.find((x) => x.rsvp_open) ?? ev[0];
      return { text: `${eventLine(e)}. سجّل بسرعة من صفحته 👇`, href: e.slug ? `/events/${e.slug}` : "/events", label: "سجّل مكانك", topic: { kind: "events" }, followups: ["فيه إيفنتات تانية؟", "أحجز إزاي؟"] };
    }
    if (has(q, ["event", "events", "workshop", "hackathon", "ايفنت", "ايفنتات", "فعاليه", "فعاليات", "ورشه", "ورش", "هاكاثون", "الجاي"]) && ev.length) {
      const [first, ...rest] = ev;
      return {
        text: `أقرب إيفنت: ${eventLine(first)} 📅${rest.length ? ` وبعده: ${rest.slice(0, 2).map((e) => `«${e.title}»`).join(" و")}.` : ""}`,
        href: first.slug ? `/events/${first.slug}` : "/events",
        label: first.rsvp_open ? "سجّل مكانك" : "التفاصيل",
        topic: { kind: "events" },
        followups: ["فاضل كام مكان؟", "أحجز إزاي؟", "إيه الجديد؟"],
      };
    }
    if (has(q, ["news", "new", "latest", "اخبار", "الاخبار", "الجديد", "جديد", "اخر حاجه"]) && live.news.length)
      return { text: `آخر الأخبار: ${live.news.map((n) => `«${n.title}»`).join("، ")} 📰`, href: live.news[0].slug ? `/news/${live.news[0].slug}` : "/news", label: "اقرا الخبر", followups: ["الإيفنت الجاي إمتى؟", "إزاي أنضم؟"] };
    if (has(q, ["form", "forms", "tryout", "volunteer", "فورم", "فورمات", "استماره", "اختبارات", "تجديد", "تطوع", "متطوع", "اقدم علي فريق", "ادخل فريق"])) {
      if (live.forms.length)
        return { text: `فيه ${live.forms.length === 1 ? "فورم مفتوح" : `${live.forms.length} فورمات مفتوحة`} دلوقتي: ${live.forms.map((f) => `«${f.title}»`).join("، ")}. املاه قبل ما يقفل 👇`, href: `/form/?f=${live.forms[0].slug}`, label: "املأ الفورم", followups: ["فيه إيفنتات؟", "إزاي أنضم؟"] };
      return { text: "مفيش فورمات مفتوحة دلوقتي. أول ما يفتح فورم جديد (اختبارات فرق، تطوع…) هيظهر في صفحة الفورمات 👀", href: "/forms", label: "صفحة الفورمات", followups: ["إزاي أنضم؟", "الإيفنت الجاي إمتى؟"] };
    }
    if (has(q, ASPECT.join) && !live.applications_open)
      return { text: `التقديم مقفول دلوقتي${name} 😕 بس سيب رقمك في صفحة الانضمام وأول ما يفتح هنبلّغك على طول.`, href: "/join", label: "بلّغني لما يفتح", topic: { kind: "join" }, followups: ["الإيفنت الجاي إمتى؟", "فيه فورمات مفتوحة؟"] };
  }

  // ── The season: tracks list, teams, events, bootcamp, plan, goals ──
  if (has(q, ["tracks", "التراكات", "تراكات", "المسارات", "مسارات", "كام تراك"])) return { text: `عندنا ${KB.tracks.length} تراكات: ${LIST_TRACKS()}. قولّي بتحب إيه وأنا أرشحلك 😉`, href: "/tracks", section: "#tracks", label: "ورّيني التراكات", followups: ["أبدأ بأنهي تراك؟", "يعني إيه إمبيدد؟", "إيه الفرق بين الـ AI والسوفتوير؟"] };
  if (has(q, ["teams", "الفرق", "فرق المسابقات", "المسابقات", "competitions"])) return { text: `فرق المسابقات عندنا: ${KB.teams.map((t) => t.name).join("، ")}. كل فريق بيتمرن طول السنة 🏁`, href: "/competitions", section: "#compete", label: "فرق المسابقات", followups: ["يعني إيه سومو؟", "إيه هو اللاين فولور؟", "إزاي أدخل فريق مسابقات؟"] };
  if (has(q, ["bootcamp", "بوتكامب"]) || mem.topic?.kind === "bootcamp") {
    const week = q.match(/(?:اسبوع|week)\s*(\d)/)?.[1];
    const w = week ? KB.bootcamp.find((x) => x.week === Number(week)) : null;
    if (w) return { text: `الأسبوع ${w.week} في البوتكامب: «${w.title}». ${w.summary}`, href: "/bootcamp", label: "البوتكامب", topic: { kind: "bootcamp" }, followups: [`والأسبوع ${Math.min(7, w.week + 1)}؟`, "البوتكامب لمين؟"] };
    if (has(q, ["bootcamp", "بوتكامب"]) || has(q, ASPECT.how_long))
      return { text: `البوتكامب ${KB.bootcamp.length} أسابيع بياخدك من الصفر: ${KB.bootcamp.slice(0, 4).map((x) => x.title).join("، ")}… وآخره «${KB.bootcamp[KB.bootcamp.length - 1].title}» 🏆`, href: "/bootcamp", label: "البوتكامب", topic: { kind: "bootcamp" }, followups: ["الأسبوع 1 فيه إيه؟", "لازم يكون عندي خبرة؟"] };
  }
  if (has(q, ["event", "events", "workshop", "hackathon", "ايفنت", "ايفنتات", "فعاليه", "فعاليات", "ورشه", "ورش", "هاكاثون"]) || (has(q, ASPECT.when) && !has(q, ["رد", "reply"]))) {
    const dated = KB.events.filter((e) => e.when);
    return { text: `ده اللي في خطة الموسم: ${dated.slice(0, 4).map((e) => `${e.title} (${e.when})`).join("، ")}. والمواعيد الدقيقة والحجز بتنزل في صفحة الإيفنتات أول بأول 📅`, href: "/events", label: "الإيفنتات الجاية", topic: { kind: "events" }, followups: ["أحجز في إيفنت إزاي؟", "إيه هو تحدي BuildX الداخلي؟"] };
  }
  if (has(q, ["plan", "roadmap", "الخطه", "خطه السنه", "خطتكم", "هتعملوا ايه"])) return { text: KB.roadmap.map((r) => `${r.q} (${r.when}): ${r.title}`).join(" ← "), href: "/events", label: "الخطة كاملة", followups: ["أهدافكم إيه؟", "الإيفنت الجاي إمتى؟"] };
  if (has(q, ["goal", "goals", "target", "هدف", "اهداف", "اهدافكم"])) return { text: `أهدافنا للموسم: ${KB.goals.map((g) => `${g.value} ${g.label}`).join("، ")}. ومع بعض هنحققها 💪`, followups: ["خطة السنة إيه؟", "إزاي أنضم؟"] };
  if (has(q, ["activities", "activity", "بتعملوا ايه", "انشطه", "نشاطات", "بتعملوا"])) return { text: `بنعمل: ${KB.activities.map((a) => a.title).join("، ")}. يعني مش مجرد محاضرات 😄`, followups: ["إيه التراكات؟", "الإيفنت الجاي إمتى؟"] };

  // ── The FAQ (closest question wins) ──
  const words = new Set(q.trim().split(" ").filter((w) => w.length > 2));
  let best: { a: string; score: number } | null = null;
  for (const f of KB.faq) {
    const fw = normalize(f.q).split(" ").filter((w) => w.length > 2);
    const score = fw.filter((w) => words.has(w)).length / Math.max(3, fw.length);
    if (score > (best?.score ?? 0.34)) best = { a: f.a, score };
  }
  if (best) return { text: best.a, href: "/faq", label: "الأسئلة الشائعة", followups: ["إزاي أنضم؟", "إيه التراكات؟"] };

  // ── Navigation answers, then honesty ──
  const nav = matchIntent(question);
  if (nav.href || nav.action) return { text: nav.text.ar, href: nav.href, section: nav.section, label: nav.label?.ar, action: nav.action, followups: [] };
  return {
    text: pick([`دي مش عارفها بصراحة${name} 😅 بس ممكن أساعدك في التراكات أو المسابقات أو الإيفنتات أو الانضمام.`, "سؤال حلو بس معنديش إجابته 🙈 جرّب البحث أو اسأل الفريق من صفحة التواصل."]),
    action: "search",
    label: "افتح البحث",
    followups: ["إيه التراكات؟", "إزاي أنضم؟", "كلّم الفريق"],
  };
}
