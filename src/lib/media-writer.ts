/**
 * The media desk's writer: a news post and social captions for an event, written from its real
 * numbers with fixed rules (no AI, so no cost and nothing invented). What kind of event it was comes
 * from its title; the wording varies between events (picked from the event's key, so the same event
 * always reads the same) so the posts don't all sound alike. Numbers only appear when they're worth
 * saying: a rating needs a few raters, "out of N registered" only when most came.
 */

export const SITE = "https://buildxhue.com";

export type DeskEvent = {
  key: string;
  slug?: string | null;
  title: string;
  title_en?: string | null;
  at: string;
  place?: string | null;
  registered: number;
  accepted: number;
  attended: number;
  sessions: number;
  rating: number | null;
  ratings: number;
  photos: number;
  /** They went by bus (boarding was scanned). */
  bus?: boolean;
  /** A form behind it (registration link). */
  form?: boolean;
};

/** `ours`: something BuildX runs itself (it "organised" it); otherwise the team took part in it. */
type Kind = { ar: string; en: string; the: string; tag: string; ours?: boolean };
const KINDS: [RegExp, Kind][] = [
  [/(ورشة|ورش|workshop)/i, { ar: "ورشة", en: "workshop", the: "الورشة", tag: "Workshop", ours: true }],
  [/(قمة|summit)/i, { ar: "قمة", en: "summit", the: "القمة", tag: "Summit" }],
  [/(مؤتمر|conference)/i, { ar: "مؤتمر", en: "conference", the: "المؤتمر", tag: "Conference" }],
  [/(هاكاثون|hackathon)/i, { ar: "هاكاثون", en: "hackathon", the: "الهاكاثون", tag: "Hackathon" }],
  [/(مسابقة|competition|challenge|تحدي)/i, { ar: "مسابقة", en: "competition", the: "المسابقة", tag: "Competition" }],
  [/(زيارة|رحلة|معرض|expo|visit|trip)/i, { ar: "زيارة", en: "visit", the: "الزيارة", tag: "Visit" }],
  [/(كورس|دورة|bootcamp|course|camp)/i, { ar: "كورس", en: "course", the: "الكورس", tag: "Bootcamp", ours: true }],
  [/(محاضرة|lecture|talk|session)/i, { ar: "محاضرة", en: "talk", the: "المحاضرة", tag: "Talk", ours: true }],
];
const EVENT: Kind = { ar: "فعالية", en: "event", the: "الفعالية", tag: "Event", ours: true };
export const kindOf = (title: string) => KINDS.find(([re]) => re.test(title))?.[1] ?? EVENT;

/** Topics worth a hashtag, from the title. */
const TOPICS: [RegExp, string][] = [
  [/embedded/i, "EmbeddedSystems"],
  [/arduino|أردوينو/i, "Arduino"],
  [/robot|روبوت/i, "Robotics"],
  [/\bai\b|ذكاء|machine learning|ml\b/i, "AI"],
  [/iot|إنترنت الأشياء/i, "IoT"],
  [/drone|درون/i, "Drones"],
  [/pcb/i, "PCB"],
  [/3d|طباعة/i, "3DPrinting"],
  [/line.?follower/i, "LineFollower"],
  [/sumo|سومو/i, "Sumo"],
];

/** A stable pick: the same event always gets the same wording. */
function pick<T>(key: string, salt: string, options: T[]): T {
  let h = 2166136261;
  for (const c of key + salt) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return options[(h >>> 0) % options.length];
}

/** Arabic counting: 1 طالب، 2 طالبين، 3–10 طلاب، 11+ طالب. */
export function arCount(n: number, one = "طالب", two = "طالبين", few = "طلاب") {
  if (n === 1) return `${one} واحد`;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${one}`;
}

const dayFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Cairo" });
const timeFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Cairo" });
const enDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Cairo" });
export const arDay = (iso: string) => dayFmt.format(new Date(iso));

/** «Workshop 01 – Introduction to Embedded Systems» → «Introduction to Embedded Systems». */
const topicOf = (title: string) => {
  const parts = title.split(/\s+[–—-]\s+/);
  return (parts.length > 1 ? parts.slice(1).join(" – ") : title).trim();
};

export const hashtags = (e: DeskEvent) =>
  ["#BuildX_HUE", "#HorusUniversity", `#${kindOf(`${e.title} ${e.title_en ?? ""}`).tag}`, ...TOPICS.filter(([re]) => re.test(`${e.title} ${e.title_en ?? ""}`)).map(([, t]) => `#${t}`)]
    .filter((t, i, all) => all.indexOf(t) === i)
    .slice(0, 6);

const horus = (e: DeskEvent) => /حورس|horus/i.test(e.place ?? "");
export const isPast = (e: DeskEvent, now = Date.now()) => new Date(e.at).getTime() + 3 * 3600_000 < now;
const link = (e: DeskEvent) => (e.form && e.slug ? `${SITE}/ar/form/?f=${encodeURIComponent(e.slug)}` : `${SITE}/ar/events/`);

/** What the numbers can honestly say. */
function facts(e: DeskEvent) {
  const came = e.attended > 0 ? e.attended : 0;
  const most = came > 0 && e.registered > 0 && came / e.registered >= 0.5;
  const rated = e.ratings >= 5 && e.rating != null && e.rating >= 3.5;
  return { came, most, rated };
}

export type News = { title: string; summary: string; body: string };

/** The news post after the event (for the website), from what actually happened. */
export function newsAfter(e: DeskEvent): News {
  const k = kindOf(`${e.title} ${e.title_en ?? ""}`);
  const f = facts(e);
  const name = e.title.trim();
  const day = arDay(e.at);
  const where = e.place ? ` في ${e.place}` : "";
  const people = f.came ? arCount(f.came) : e.registered ? arCount(e.registered) : "";

  const title = f.came
    ? pick(e.key, "t", [`${people} في ${name}`, `${name}: ${people} حضروا مع BuildX HUE`, `${k.the} خلصت: ${name} بحضور ${people}`])
    : pick(e.key, "t", [`BuildX HUE نظّم ${name}`, `${name} مع BuildX HUE`]);

  // What the team did: ran it, or took part in someone else's (a summit, a visit, a competition).
  const lead = !k.ours
    ? f.came
      ? `شارك ${people} من BuildX HUE يوم ${day} في «${name}»${where}${e.bus ? "، وسافروا مع بعض بأتوبيسات الفريق" : ""}${f.most ? ` (من ${e.registered} سجّلوا)` : ""}.`
      : `شارك فريق BuildX HUE يوم ${day} في «${name}»${where}.`
    : f.came
      ? pick(e.key, "l", [
          `نظّم فريق BuildX HUE يوم ${day} ${k.ar} «${name}»${where}، وحضرها ${people}${f.most ? ` من أصل ${e.registered} سجّلوا` : ""}.`,
          `يوم ${day}${where} كان ميعادنا مع «${name}»: ${k.ar} من تنظيم فريق BuildX HUE حضرها ${people}${f.most ? ` (من ${e.registered} سجّلوا)` : ""}.`,
        ])
      : `نظّم فريق BuildX HUE يوم ${day} ${k.ar} «${name}»${where}${e.registered ? `، وسجّل فيها ${people}` : ""}.`;

  const lines = [lead];
  if (e.sessions > 1) lines.push(`${k.the} كانت على ${arCount(e.sessions, "جلسة", "جلستين", "جلسات")}، وكل جلسة اتسجّل حضورها بالـ QR.`);
  const topic = topicOf(e.title_en || e.title);
  if (topic && topic !== name) lines.push(`وكان الموضوع: ${topic}.`);
  if (f.rated) lines.push(`وقيّم الحضور ${k.the} بمتوسط ${e.rating} من 5 (${arCount(e.ratings, "تقييم", "تقييمين", "تقييمات")}).`);
  if (e.photos) lines.push(`صور ${k.the} (${e.photos}) موجودة في معرض الصور على الموقع.`);
  lines.push(pick(e.key, "c", ["شكرًا لكل اللي حضر وشارك، ومستنيينكم في الجاية 💙", "تابعوا الموقع عشان تعرفوا الفعاليات الجاية أول بأول.", "لو فاتتك المرة دي، الجاية قريب — تابعونا."]));

  const body = lines.join("\n\n");
  return { title, summary: lead, body };
}

export type Captions = { facebook: string; instagram: string; linkedin: string; whatsapp: string };

/** Posts for social media: after the event (a recap) or before it (the invitation). */
export function captions(e: DeskEvent, now = Date.now()): Captions {
  const k = kindOf(`${e.title} ${e.title_en ?? ""}`);
  const tags = hashtags(e).join(" ");
  const name = e.title.trim();
  const en = (e.title_en || e.title).trim();
  const f = facts(e);
  if (isPast(e, now)) {
    const people = f.came ? arCount(f.came) : "";
    const facebook = [
      pick(e.key, "fb", [`🙌 خلصنا ${name}!`, `✨ ${name} — كانت يوم حلو`, `🔥 ${k.the} خلصت وكانت جامدة`]),
      f.came ? `👥 ${k.ours ? "حضر معانا" : "شارك من الفريق"} ${people}${f.most ? ` من ${e.registered} سجّلوا` : ""}` : "",
      e.bus ? "🚌 رحنا ورجعنا مع بعض بأتوبيسات الفريق" : "",
      e.sessions > 1 ? `🗓 على ${arCount(e.sessions, "جلسة", "جلستين", "جلسات")}` : "",
      f.rated ? `⭐ تقييم الحضور: ${e.rating}/5` : "",
      e.photos ? `📸 الصور كلها على الموقع: ${SITE}/ar/gallery/` : "",
      "",
      "شكرًا لكل اللي كان معانا، ومستنيينكم في الجاية 💙",
      tags,
    ];
    const instagram = [
      pick(e.key, "ig", [`${name} ✔️`, `${k.the} خلصت 🔥`]),
      f.came ? `${people} حضروا معانا 💙` : "",
      f.rated ? `⭐ ${e.rating}/5` : "",
      "الصور على الموقع — اللينك في البايو",
      "",
      tags,
    ];
    const linkedin = [
      k.ours
        ? `Wrapped up ${en}${horus(e) ? " at Horus University" : ""}${f.came ? `, with ${f.came} students attending` : ""}.`
        : `${f.came ? `${f.came} BuildX HUE students` : "The BuildX HUE team"} took part in ${en}.`,
      e.sessions > 1 ? `${e.sessions} sessions, attendance checked in by QR.` : "",
      f.rated ? `Attendees rated it ${e.rating}/5 (${e.ratings} ratings).` : "",
      "Thanks to everyone who joined — more to come from BuildX HUE.",
      "",
      tags,
    ];
    const whatsapp = [`✅ ${name}`, f.came ? `${people} حضروا معانا، شكرًا ليكم 💙` : "شكرًا لكل اللي كان معانا 💙", e.photos ? `📸 الصور: ${SITE}/ar/gallery/` : ""];
    const join = (l: string[]) => l.filter((x, i, a) => x !== "" || (i > 0 && a[i - 1] !== "")).join("\n").trim();
    return { facebook: join(facebook), instagram: join(instagram), linkedin: join(linkedin), whatsapp: join(whatsapp) };
  }
  // Before: the invitation, with how long is left.
  const days = Math.max(0, Math.ceil((new Date(e.at).getTime() - now) / 86_400_000));
  const when = `🗓 ${arDay(e.at)} · ⏰ ${timeFmt.format(new Date(e.at))}`;
  const left = days === 0 ? "النهارده! ⏳" : days === 1 ? "بكرة! ⏳" : days <= 7 ? `فاضل ${arCount(days, "يوم", "يومين", "أيام")} ⏳` : "";
  const where = e.place ? `📍 ${e.place}` : "";
  const reg = `✍️ سجّل من هنا: ${link(e)}`;
  const facebook = [`📣 ${k.ar} جديدة من BuildX HUE: ${name}`, when, where, left, "", reg, "الأماكن محدودة — سجّل بدري.", tags];
  const instagram = [`📣 ${name}`, when, where, left, "التسجيل من اللينك في البايو ✍️", "", tags];
  const linkedin = [`Join us for ${en} — ${enDay.format(new Date(e.at))}${e.place ? ` at ${e.place}` : ""}.`, `Register: ${link(e)}`, "", tags];
  const whatsapp = [`📣 ${name}`, when, where, left, reg];
  const join = (l: string[]) => l.filter(Boolean).join("\n");
  return { facebook: join(facebook), instagram: join(instagram), linkedin: join(linkedin), whatsapp: join(whatsapp) };
}

/**
 * The website event and the form behind it can show up as two events (made separately, different
 * titles). Same Cairo day and one of them a website event with no form: one event, the form's
 * numbers and registration link with the website event's name, place and photos.
 */
export function mergeSameDay<T extends DeskEvent & { cover?: string | null; post?: unknown }>(list: T[]): (T & { keys: string[] })[] {
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  const out: (T & { keys: string[] })[] = [];
  for (const e of list) {
    const twin = out.find((o) => day(o.at) === day(e.at) && o.key.split(":")[0] !== e.key.split(":")[0] && (o.key.startsWith("event:") || e.key.startsWith("event:")));
    if (!twin) {
      out.push({ ...e, keys: [e.key] });
      continue;
    }
    const [form, site] = twin.key.startsWith("form:") ? [twin, e] : [e, twin];
    Object.assign(twin, {
      ...form,
      key: form.key,
      keys: [...twin.keys, e.key],
      // The website's name for it (the one people saw), the form's link and numbers.
      title: site.title || form.title,
      form: true,
      place: form.place || site.place,
      photos: Math.max(form.photos, site.photos),
      cover: form.cover || site.cover,
      post: form.post || site.post,
      title_en: form.title_en || site.title_en,
    });
  }
  return out;
}
