/**
 * The college's post after an event, in the faculty's official style: the patronage and supervision
 * lines (saved once by the team), the headline, what the event was, the tracks, who represented the
 * college, who supervised, and the closing. Fixed rules, no AI: nothing is said that wasn't typed or
 * recorded (names come from who was scanned in, a result only when someone types it).
 */
import { kindOf, type DeskEvent } from "./media-writer";

/** Saved once (site_settings "college_post"): who the college is and who it is under. */
export type CollegeSetup = {
  /** «تحت رعاية … وبريادة … وتحت إشراف …», as the college writes it. */
  header: string;
  /** «طلاب برنامجي الروبوتات والأنظمة الذكية». */
  students: string;
  /** «كلية الذكاء الاصطناعي والمعلومات». */
  college: string;
  /** «جامعة حورس». */
  university: string;
  /** «الروبوتات والأنظمة الذكية»: the field the closing line speaks of. */
  field: string;
  /** The last supervisor typed (suggested next time). */
  supervisor?: string;
};

export type Track = { name: string; emoji: string; desc: string };

/** Tracks the team often competes in, with a line each (pick, or type a new one). */
export const TRACKS: Track[] = [
  { name: "Robo Sprint", emoji: "🏎️", desc: "تحدٍ لبناء روبوت سريع وثابت ينهي مسار السباق في أقل زمن ممكن." },
  { name: "Robot Sumo", emoji: "🥊", desc: "مواجهة بين روبوتين، والهدف دفع روبوت المنافس خارج الحلبة باستخدام التصميم الذكي والقوة والحساسات والبرمجة." },
  { name: "Line Follower", emoji: "〰️", desc: "روبوت يتتبع مسارًا مرسومًا على الأرض بأعلى دقة وسرعة باستخدام الحساسات وخوارزميات التحكم." },
  { name: "Maze Solver", emoji: "🧩", desc: "روبوت ذاتي الحركة يستكشف المتاهة ويجد أقصر طريق للخروج منها." },
  { name: "Robot Soccer", emoji: "⚽", desc: "مباريات كرة قدم بين روبوتات يتحكم فيها الطلاب، تجمع بين سرعة الحركة ودقة التحكم وروح الفريق." },
  { name: "Autonomous Car", emoji: "🚗", desc: "سيارة ذاتية القيادة تكمل المسار وتتعامل مع العوائق دون تدخل بشري." },
  { name: "Drone Challenge", emoji: "🚁", desc: "تحدٍ لتصميم وبرمجة طائرة بدون طيار تنفذ مهمة محددة بدقة وأمان." },
  { name: "Innovation Project", emoji: "💡", desc: "عرض مشروع مبتكر يقدّم حلًا تقنيًا لمشكلة حقيقية أمام لجنة تحكيم متخصصة." },
  { name: "AI Challenge", emoji: "🧠", desc: "تحدٍ لبناء نموذج ذكاء اصطناعي يحل مشكلة واقعية بأعلى دقة ممكنة." },
];

export type CollegeInput = {
  event: Pick<DeskEvent, "key" | "title" | "attended">;
  /** «إحدى المسابقات المتخصصة في مجال …» — optional, what the event is. */
  blurb?: string;
  tracks: Track[];
  /** Who represented the college (listed when there are a few). */
  names: string[];
  supervisor?: string;
  /** Only when typed: «وحصل الفريق على المركز الثاني في …». */
  result?: string;
  /** What it was (a key of STYLES), when the title alone doesn't say. */
  kind?: string;
  /** The team organised it (otherwise it took part in it). */
  ours?: boolean;
};

/** «مجال واحد / مجالين / 3 مجالات / 11 مجالًا». */
export const tracksCount = (n: number) => (n === 1 ? "مجال" : n === 2 ? "مجالين" : n <= 10 ? `${n} مجالات` : `${n} مجالًا`);

/** Names listed by name up to this many; more than that, the post gives the number. */
export const MAX_NAMES = 12;

type Style = { emoji: string; word: string; the: string; why: string };
export const STYLES: Record<string, Style & { label: string; ours?: boolean }> = {
  competition: { label: "مسابقة", emoji: "🤖🏆", word: "مسابقة", the: "المسابقة", why: "وإتاحة الفرصة للطلاب لاختبار مهاراتهم الهندسية والبرمجية في المنافسات المتخصصة" },
  hackathon: { label: "هاكاثون", emoji: "💡🏆", word: "هاكاثون", the: "الهاكاثون", why: "وإتاحة الفرصة للطلاب لاختبار مهاراتهم في حل المشكلات الحقيقية تحت ضغط الوقت" },
  summit: { label: "قمة", emoji: "🤖🌍", word: "قمة", the: "القمة", why: "وإتاحة الفرصة للطلاب للتعرّف على أحدث التوجهات والتواصل مع الخبراء والمتخصصين" },
  conference: { label: "مؤتمر", emoji: "🎤🌍", word: "مؤتمر", the: "المؤتمر", why: "وإتاحة الفرصة للطلاب للتعرّف على أحدث التوجهات والتواصل مع الخبراء والمتخصصين" },
  visit: { label: "زيارة", emoji: "🏭✨", word: "زيارة", the: "الزيارة", why: "وإتاحة الفرصة للطلاب للاطلاع على التطبيقات العملية عن قرب" },
  workshop: { label: "ورشة", ours: true, emoji: "🛠️", word: "ورشة", the: "الورشة", why: "وإكساب الطلاب مهارات عملية يحتاجها سوق العمل" },
  course: { label: "دورة / كورس", ours: true, emoji: "📚", word: "دورة", the: "الدورة", why: "وإكساب الطلاب مهارات عملية يحتاجها سوق العمل" },
  talk: { label: "محاضرة", ours: true, emoji: "🎤", word: "محاضرة", the: "المحاضرة", why: "وإثراء معرفة الطلاب بأحدث ما وصل إليه المجال" },
  event: { label: "فعالية", ours: true, emoji: "✨", word: "فعالية", the: "الفعالية", why: "وإتاحة الفرصة للطلاب لتطبيق ما يتعلمونه عمليًا" },
};

/** What the event was, from its title: the media desk's kinds, plus names competitions go by. */
export function guessKind(title: string): { kind: string; ours: boolean } {
  const k = kindOf(title);
  if (k.en === "event" && /(olymp|iad[ae]?\b|\bcup\b|championship|robotex|league|\bfll\b|\bwro\b|بطولة|أولمبياد|اوليمبياد)/i.test(title)) return { kind: "competition", ours: false };
  return { kind: STYLES[k.en] ? k.en : "event", ours: !!k.ours };
}

const clean = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

/** The whole post, ready to copy. */
export function collegePost(setup: CollegeSetup, input: CollegeInput): string {
  const guess = guessKind(input.event.title);
  const st = STYLES[input.kind ?? guess.kind] ?? STYLES.event;
  const ours = input.ours ?? guess.ours;
  const title = clean(input.event.title);
  // «مسابقة Robotiada Egypt 2026», unless the title already says what it is.
  const named = new RegExp(st.word.slice(0, 3)).test(title) || /\b(competition|summit|conference|hackathon|workshop|course|visit)\b/i.test(title) ? title : `${st.word} ${title}`;
  const students = clean(setup.students) || "طلاب الكلية";
  const college = clean(setup.college) || "الكلية";
  const at = clean(setup.university) ? `${college} ب${clean(setup.university)}` : college;
  const field = clean(setup.field) || "التكنولوجيا";
  const blurb = clean(input.blurb).replace(/[،,.]+$/, "");
  const tracks = input.tracks.filter((t) => clean(t.name));
  const names = input.names.map(clean).filter(Boolean);

  const out: string[] = [];
  if (clean(setup.header)) out.push(setup.header.trim());

  out.push(ours ? `${students} ب${college} ينظمون ${named} ${st.emoji}` : `${students} ب${college} يشاركون في ${named} ${st.emoji}`);

  const lead = `في إطار حرص ${at} على دعم الابتكار وتنمية المهارات التطبيقية لدى الطلاب، ${ours ? "نظّم" : "شارك"} ${students} ${ours ? named : `في ${named}`}`;
  const came = ours && input.event.attended >= 3 ? `، بمشاركة ${input.event.attended} من الطلاب` : "";
  out.push(`${lead}${blurb ? `، ${blurb}` : ""}${came}${tracks.length ? `، وذلك من خلال ${tracksCount(tracks.length)}:` : "."}`);

  if (tracks.length) out.push(tracks.map((t) => `${t.emoji ? `${t.emoji} ` : ""}${clean(t.name)}${clean(t.desc) ? `: ${clean(t.desc)}` : ""}`).join("\n\n"));

  if (!ours) {
    if (names.length && names.length <= MAX_NAMES) out.push(`ومثّل الكلية في ${st.the} كل من:\n${names.map((n) => ` • ${n}`).join("")}`);
    else if (names.length > MAX_NAMES) out.push(`ومثّل الكلية في ${st.the} ${names.length} من الطلاب.`);
    else if (input.event.attended >= 3) out.push(`ومثّل الكلية في ${st.the} ${input.event.attended} من الطلاب.`);
  }

  if (clean(input.result)) out.push(`${clean(input.result).replace(/[.。]+$/, "")}. 🏆`);
  if (clean(input.supervisor)) out.push(`${ours ? `وجاءت ${st.the}` : "وجاءت مشاركة الطلاب"} تحت إشراف ${clean(input.supervisor)}`);

  out.push(
    `وتأتي هذه ${ours ? st.the : "المشاركة"} تأكيدًا على اهتمام القسم والكلية بربط الدراسة الأكاديمية بالتطبيق العملي، ${st.why}، بما يسهم في إعداد كوادر قادرة على الابتكار والمنافسة في مجالات ${field}.`,
  );
  out.push("مع خالص تمنياتنا لطلابنا بدوام التوفيق والتميز، ومزيد من النجاحات والإنجازات. 🌟");
  return out.join("\n\n");
}
