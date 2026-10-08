"use client";
/**
 * The "Play" tab of Baqloz's menu: the games (throw him into the hoop, hide-and-seek on the page, a
 * quick quiz right here), your best scores, and the badges you've collected. Everything is saved on
 * this device only.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { BADGES, play, quizRound, type Progress, type QuizQuestion } from "@/lib/mascot/games";

const COPY = {
  ar: {
    games: "العب مع بقلظ",
    hoop: "ارميه في السلة",
    hoopHow: "شدّه وارميه جوه السلة… ٤٥ ثانية 🏀",
    seek: "استغماية",
    seekHow: "هيستخبى في الصفحة وإنت تدوّر عليه 🙈",
    quiz: "اختبر نفسك",
    quizHow: "٨ أسئلة تكنولوجيا وروبوتكس 🧠",
    best: "أحسن نتيجة",
    sec: "ث",
    badges: "أوسمتك",
    of: (a: number, b: number) => `${a} من ${b}`,
    question: (i: number, n: number) => `سؤال ${i} من ${n}`,
    next: "اللي بعده",
    finish: "النتيجة",
    score: (s: number, n: number) => `جبت ${s} من ${n}`,
    again: "العب تاني",
    back: "رجوع",
    right: "صح ✅",
    wrong: "غلط ❌",
    locked: "لسه مقفول",
  },
  en: {
    games: "Play with Baqloz",
    hoop: "Hoop shot",
    hoopHow: "Grab him and throw him into the hoop. 45 seconds 🏀",
    seek: "Hide and seek",
    seekHow: "He hides on the page; you find him 🙈",
    quiz: "Quick quiz",
    quizHow: "8 tech and robotics questions 🧠",
    best: "Best",
    sec: "s",
    badges: "Your badges",
    of: (a: number, b: number) => `${a} of ${b}`,
    question: (i: number, n: number) => `Question ${i} of ${n}`,
    next: "Next",
    finish: "Results",
    score: (s: number, n: number) => `You got ${s} of ${n}`,
    again: "Play again",
    back: "Back",
    right: "Right ✅",
    wrong: "Wrong ❌",
    locked: "Locked",
  },
};

function useProgress(): Progress {
  const [p, setP] = useState<Progress>(play.get);
  useEffect(() => play.onChange(() => setP(play.get())), []);
  return p;
}

export function MascotPlay({ locale, onGame, onQuiz }: { locale: "en" | "ar"; onGame: (g: "hoop" | "seek") => void; onQuiz: (r: "right" | "wrong" | "done", score?: number) => void }) {
  const t = COPY[locale];
  const p = useProgress();
  const [quiz, setQuiz] = useState<{ qs: QuizQuestion[]; i: number; picked: number | null; score: number } | null>(null);

  if (quiz) {
    const n = quiz.qs.length;
    if (quiz.i >= n) {
      return (
        <div className="grid gap-3 px-3 py-2 text-center">
          <p className="text-4xl" aria-hidden>
            {quiz.score >= 7 ? "🏆" : quiz.score >= 5 ? "👏" : "💪"}
          </p>
          <p className="text-lg font-bold text-chalk" role="status">
            {t.score(quiz.score, n)}
          </p>
          <p className="text-xs text-fog">
            {t.best}: {Math.max(p.quizBest, quiz.score)} / {n}
          </p>
          <div className="flex justify-center gap-2">
            <button type="button" data-item onClick={() => setQuiz({ qs: quizRound(), i: 0, picked: null, score: 0 })} className="rounded-xl bg-volt px-4 py-2 text-sm font-semibold text-white transition hover:bg-volt-hi">
              {t.again}
            </button>
            <button type="button" data-item onClick={() => setQuiz(null)} className="rounded-xl border border-[var(--line-2)] px-4 py-2 text-sm text-mist transition hover:text-chalk">
              {t.back}
            </button>
          </div>
        </div>
      );
    }
    const q = quiz.qs[quiz.i];
    const answered = quiz.picked !== null;
    const choose = (k: number) => {
      if (answered) return;
      const ok = k === q.answer;
      setQuiz({ ...quiz, picked: k, score: quiz.score + (ok ? 1 : 0) });
      onQuiz(ok ? "right" : "wrong");
    };
    const next = () => {
      const i = quiz.i + 1;
      if (i >= n) {
        play.update((pr) => ({ quizBest: Math.max(pr.quizBest, quiz.score) }));
        if (quiz.score >= 7) play.award("brain");
        onQuiz("done", quiz.score);
      }
      setQuiz({ ...quiz, i, picked: null });
    };
    return (
      <div className="grid gap-2.5 px-3 py-2">
        <div className="flex items-center justify-between text-xs text-fog">
          <span>{t.question(quiz.i + 1, n)}</span>
          <span>
            {quiz.score} ✓
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-volt to-cyan transition-[width] duration-500 rtl:bg-gradient-to-l" style={{ width: `${((quiz.i + (answered ? 1 : 0)) / n) * 100}%` }} />
        </div>
        <p className="text-[0.95rem] font-semibold leading-relaxed text-chalk">{q.q[locale]}</p>
        <div className="grid gap-1.5" role="group" aria-label={q.q[locale]}>
          {q.options.map((o, k) => (
            <button
              key={k}
              type="button"
              data-item
              disabled={answered}
              onClick={() => choose(k)}
              className={cn(
                "rounded-xl border px-3 py-2 text-start text-sm transition",
                !answered && "border-[var(--line-2)] text-mist hover:border-cyan/50 hover:text-chalk",
                answered && k === q.answer && "border-ok/70 bg-ok/15 text-chalk",
                answered && k === quiz.picked && k !== q.answer && "border-red-400/70 bg-red-400/10 text-chalk",
                answered && k !== q.answer && k !== quiz.picked && "border-[var(--line)] text-fog opacity-60",
              )}
            >
              <span dir="auto">{o[locale]}</span>
            </button>
          ))}
        </div>
        {answered && (
          <div className="grid gap-2" role="status">
            <p className="text-sm text-frost">
              <b>{quiz.picked === q.answer ? t.right : t.wrong}</b> {q.why[locale]}
            </p>
            <button type="button" data-item autoFocus onClick={next} className="justify-self-end rounded-xl bg-volt px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-volt-hi">
              {quiz.i + 1 >= n ? t.finish : t.next}
            </button>
          </div>
        )}
      </div>
    );
  }

  const games: { id: "hoop" | "seek" | "quiz"; icon: string; name: string; how: string; best: string | null }[] = [
    { id: "hoop", icon: "🏀", name: t.hoop, how: t.hoopHow, best: p.hoopBest ? String(p.hoopBest) : null },
    { id: "seek", icon: "🙈", name: t.seek, how: t.seekHow, best: p.seekBest ? `${p.seekBest}${t.sec}` : null },
    { id: "quiz", icon: "🧠", name: t.quiz, how: t.quizHow, best: p.quizBest ? `${p.quizBest}/8` : null },
  ];
  return (
    <div className="grid gap-3 px-3 py-1">
      <p className="text-xs font-semibold uppercase tracking-wider text-fog">{t.games}</p>
      <div className="grid gap-1.5">
        {games.map((g, i) => (
          <button
            key={g.id}
            type="button"
            data-item
            autoFocus={i === 0}
            onClick={() => (g.id === "quiz" ? setQuiz({ qs: quizRound(), i: 0, picked: null, score: 0 }) : onGame(g.id))}
            className="flex items-center gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5 text-start transition hover:border-cyan/50 hover:bg-white/[0.03]"
          >
            <span className="text-2xl" aria-hidden>
              {g.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-chalk">{g.name}</span>
              <span className="block text-xs text-fog">{g.how}</span>
            </span>
            {g.best && (
              <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[0.7rem] text-mist">
                {t.best}: {g.best}
              </span>
            )}
          </button>
        ))}
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-fog">{t.badges}</p>
          <span className="text-xs text-mist">{t.of(p.badges.length, BADGES.length)}</span>
        </div>
        <ul className="grid grid-cols-3 gap-1.5">
          {BADGES.map((b) => {
            const got = p.badges.includes(b.id);
            return (
              <li key={b.id} title={b.how[locale]} className={cn("rounded-xl border px-1.5 py-2 text-center", got ? "border-cyan/40 bg-cyan/[0.07]" : "border-[var(--line)] opacity-45 grayscale")}>
                <span className="block text-xl" aria-hidden>
                  {b.icon}
                </span>
                <span className="block truncate text-[0.7rem] font-semibold text-chalk">{b.name[locale]}</span>
                <span className="sr-only">
                  {got ? "" : `${t.locked}: `}
                  {b.how[locale]}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
