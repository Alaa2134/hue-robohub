/**
 * What the attendees said, summed up without AI: the average and how the stars split, the words
 * that keep coming up in the happy comments and in the unhappy ones (common Arabic and English
 * filler words left out), the best comment (top rating, most said) and the comment that says the
 * most common complaint, plus one plain suggestion for next time from the commonest complaint word.
 */

export type Feedback = { rating: number; comment: string | null };

export type Summary = {
  count: number;
  avg: number;
  stars: [number, number, number, number, number];
  praise: string[];
  complaints: string[];
  best: string | null;
  worst: string | null;
  tip: string | null;
};

const STOP = new Set(
  (
    "في من على عن الى إلى الي اللي الذي التي هو هي هم انا أنا انت إنت احنا إحنا كان كانت كانوا يكون ده دي دا ديه دول دى بس و او أو ثم لكن لان لأن عشان علشان مع كل كله كلها جدا جداً اوي أوي خالص شوية شويه حاجة حاجه حاجات اكتر أكتر اقل أقل مش مو ما لا لم لن قد لقد هذا هذه ذلك تلك هنا هناك فيه فيها فيهم بيه بيها ليه ليا لينا عندي عندنا كمان برضه برده يعني طب طيب يا الحمد لله شكرا شكراً ممكن اني إني انه إنه انها إنها بقى بقا لما زي " +
    "the a an and or but is are was were be been to of in on for with at it this that very so too i we you they my our was really just also"
  ).split(/\s+/),
);

/** Words of a comment, normalised (alef forms, taa marbuta, tatweel, case), without filler. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => w.replace(/^(وال|بال|فال|كال|لل|ال)(?=\p{L}{3,})/u, ""))
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
}

function top(list: string[][], n: number): string[] {
  // How many people said it, then how many times it was said.
  const count = new Map<string, number>();
  const times = new Map<string, number>();
  for (const ws of list) {
    for (const w of new Set(ws)) count.set(w, (count.get(w) ?? 0) + 1);
    for (const w of ws) times.set(w, (times.get(w) ?? 0) + 1);
  }
  return [...count.entries()]
    .filter(([, c]) => c >= 2 || list.length <= 3)
    .sort((a, b) => b[1] - a[1] || (times.get(b[0]) ?? 0) - (times.get(a[0]) ?? 0) || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([w]) => w);
}

/** Suggestions for the commonest complaints (by the word people use). */
const TIPS: [RegExp, string][] = [
  [/(صوت|سماع|مايك|ميك|سامع|sound|mic)/, "الصوت كان مشكلة: جرّبوا المايك والسماعات قبل ما تبدأوا."],
  [/(وقت|تأخير|اتأخر|متأخر|طويل|late|long)/, "المواعيد: ابدأوا في المعاد وخلّوا المدة أقصر أو فيها بريك."],
  [/(زحم|زحمه|مكان|قاعه|قاعة|كراسي|crowd|room)/, "المكان كان ضيق: قاعة أكبر أو عدد أقل في الجلسة."],
  [/(سريع|بسرعه|مفهمتش|صعب|fast|hard)/, "الشرح كان سريع: خطوات أبطأ وأمثلة عملية أكتر."],
  [/(عملي|تطبيق|ايدي|hands)/, "عايزين عملي أكتر: خلّوا نص الوقت تطبيق بإيديهم."],
  [/(تكييف|حر|حرارة|برد|hot|cold)/, "الجو في القاعة كان مزعج: اتأكدوا من التكييف."],
  [/(اكل|أكل|بريك|break|food)/, "البريك/الأكل: خلّوا فيه بريك واضح."],
];

export function summarize(list: Feedback[]): Summary | null {
  if (!list.length) return null;
  const stars: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const f of list) stars[Math.min(5, Math.max(1, Math.round(f.rating))) - 1]++;
  const avg = Math.round((list.reduce((a, f) => a + f.rating, 0) / list.length) * 10) / 10;
  const said = list.filter((f) => (f.comment ?? "").trim().length >= 3).map((f) => ({ ...f, comment: f.comment!.trim(), ws: words(f.comment!) }));
  const happy = said.filter((f) => f.rating >= 4);
  const unhappy = said.filter((f) => f.rating <= 3);
  const praise = top(happy.map((f) => f.ws), 5);
  const complaints = top(unhappy.map((f) => f.ws), 5);
  const best = [...happy].sort((a, b) => b.rating - a.rating || b.ws.length - a.ws.length)[0]?.comment ?? null;
  // The unhappy comment that says the most of what the others complain about.
  const worst =
    [...unhappy].sort((a, b) => a.ws.filter((w) => complaints.includes(w)).length - b.ws.filter((w) => complaints.includes(w)).length || b.ws.length - a.ws.length).at(-1)
      ?.comment ?? null;
  const unhappyText = unhappy.map((f) => f.ws.join(" ")).join(" ");
  const tip = unhappy.length ? (TIPS.find(([re]) => re.test(unhappyText))?.[1] ?? null) : null;
  return { count: list.length, avg, stars, praise, complaints, best, worst, tip };
}
