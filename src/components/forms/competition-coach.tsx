"use client";
/**
 * /coach: the Competition Coach. Pick a competition's rule book, ask in your own words, and get the
 * rule sections that match — numbered as in the official rules, so you can quote them. Where the team
 * turned it on, "Ask the coach" adds a short AI answer built only from those sections and citing them;
 * any citation that isn't one of them is removed, and an answer without one isn't shown.
 * Data: rulebooks_public, coach_search, coach_section; the coach-ask Edge Function.
 */
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";
import { timeoutSignal } from "@/lib/timeout";

type Book = { slug: string; title: string; title_en: string | null; competition: string; edition: string; source_url: string | null; sections: number; ai: boolean };
type Section = { ref: string; heading: string; body: string; snippet: string };
type Answer = { answer: string | null; cited?: string[]; reason?: string; error?: string; disabled?: boolean };

const T = {
  en: {
    book: "Competition rules",
    none: "No rule books yet. The team adds them before each season.",
    ask: "Your question",
    ph: "e.g. What's the maximum robot size?",
    search: "Find the rules",
    results: "Matching rules",
    noResults: "No rule matches these words. Try other words, or ask the organisers.",
    coach: "Ask the coach (AI)",
    coachNote: "A short answer built only from the rule sections above, citing them. The official rules always decide.",
    noCite: "The coach couldn't answer from these sections — read them above, or ask the organisers.",
    busy: "The coach is busy right now. The rules above are the answer to read.",
    source: "Official document",
    more: "Show the whole rule",
    less: "Show less",
    limited: "Too many searches, try again in a few minutes.",
    network: "Couldn't search right now. Try again.",
  },
  ar: {
    book: "قواعد المسابقة",
    none: "لسه مفيش قواعد متضافة. الفريق بيضيفها قبل كل موسم.",
    ask: "سؤالك",
    ph: "مثلًا: أقصى مقاس للروبوت كام؟",
    search: "دوّر في القواعد",
    results: "القواعد اللي ليها علاقة",
    noResults: "مفيش قاعدة فيها الكلام ده. جرّب كلمات تانية، أو اسأل المنظمين.",
    coach: "اسأل المدرب (AI)",
    coachNote: "إجابة قصيرة من القواعد اللي فوق بس، وبتذكر رقم كل مادة. القواعد الرسمية هي الحَكَم دايمًا.",
    noCite: "المدرب معرفش يجاوب من المواد دي — اقرأها فوق، أو اسأل المنظمين.",
    busy: "المدرب مشغول دلوقتي. القواعد اللي فوق هي الإجابة.",
    source: "الملف الرسمي",
    more: "اعرض المادة كلها",
    less: "أقل",
    limited: "بحث كتير، جرّب كمان كام دقيقة.",
    network: "مقدرناش ندوّر دلوقتي. جرّب تاني.",
  },
};

const rpc = async <R,>(fn: string, body: object): Promise<R | null> => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: timeoutSignal(10_000) });
  return r.ok ? ((await r.json().catch(() => null)) as R | null) : null;
};

/** «…» marks the matched words in a snippet. */
function Snippet({ text }: { text: string }) {
  return (
    <>
      {text.split(/(«[^»]*»)/g).map((p, i) =>
        p.startsWith("«") ? (
          <mark key={i} className="rounded bg-cyan/20 px-0.5 text-chalk">
            {p.slice(1, -1)}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

export function CompetitionCoach({ locale }: { locale: string }) {
  const l = locale === "ar" ? "ar" : "en";
  const t = T[l];
  const [books, setBooks] = useState<Book[] | null>(null);
  const [slug, setSlug] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sections, setSections] = useState<Section[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const book = books?.find((b) => b.slug === slug);

  useEffect(() => {
    void rpc<Book[]>("rulebooks_public", {}).then((b) => {
      setBooks(b ?? []);
      if (b?.length) setSlug(b[0].slug);
    });
  }, []);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (!slug || q.trim().length < 2) return;
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      const out = await rpc<{ ok: boolean; sections?: Section[] }>("coach_search", { p_book: slug, p_q: q.trim() });
      if (!out) throw new Error("network");
      if (!out.ok) return setError(t.limited);
      setSections(out.sections ?? []);
      setOpen({});
    } catch {
      setError(t.network);
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    setAsking(true);
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/coach-ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
        body: JSON.stringify({ book: slug, question: q.trim() }),
        signal: timeoutSignal(20_000),
      });
      setAnswer(((await r.json().catch(() => null)) as Answer | null) ?? { answer: null, error: "network" });
    } catch {
      setAnswer({ answer: null, error: "network" });
    } finally {
      setAsking(false);
    }
  };

  if (books === null) return <p className="frame p-6 text-center text-mist">…</p>;
  if (!books.length)
    return (
      <p className="frame p-6 text-center text-mist" data-testid="coach-empty">
        {t.none}
      </p>
    );
  return (
    <div className="grid gap-6" data-testid="coach">
      <form onSubmit={search} className="frame grid gap-4 p-6">
        <label className="grid gap-2">
          <span className="text-sm text-mist">{t.book}</span>
          <select value={slug} onChange={(e) => (setSlug(e.target.value), setSections(null), setAnswer(null))} className="h-12 rounded-xl border border-[var(--line-2)] bg-panel/60 px-4 text-chalk">
            {books.map((b) => (
              <option key={b.slug} value={b.slug}>
                {`${(l === "en" && b.title_en) || b.title}${b.edition ? ` — ${b.edition}` : ""}`}
              </option>
            ))}
          </select>
        </label>
        {book?.source_url && (
          <a href={book.source_url} target="_blank" rel="noopener noreferrer" className="text-sm text-cyan underline">
            {t.source}
          </a>
        )}
        <label className="grid gap-2">
          <span className="text-sm text-mist">{t.ask}</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.ph} maxLength={300} className="h-12 rounded-xl border border-[var(--line-2)] bg-panel/60 px-4 text-chalk placeholder:text-fog" />
        </label>
        <button type="submit" disabled={busy || q.trim().length < 2} className="btn btn-primary h-12 disabled:opacity-50">
          {t.search}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {sections && (
        <section className="grid gap-3" data-testid="coach-results">
          <h2 className="text-lg font-bold text-chalk">{t.results}</h2>
          {sections.length ? (
            sections.map((s) => (
              <article key={s.ref} id={`rule-${s.ref}`} className={cn("frame grid gap-2 p-5", answer?.cited?.includes(s.ref) && "!border-cyan/60")}>
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className="rounded-md bg-cyan/15 px-2 py-0.5 font-mono text-sm text-cyan" dir="ltr">
                    {s.ref}
                  </span>
                  {s.heading && <span className="font-semibold text-chalk">{s.heading}</span>}
                </p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-mist" dir="auto">
                  {open[s.ref] ? s.body : <Snippet text={s.snippet || s.body.slice(0, 240)} />}
                </p>
                {s.body.length > (s.snippet?.length ?? 0) && (
                  <button type="button" className="justify-self-start text-xs text-cyan underline" onClick={() => setOpen({ ...open, [s.ref]: !open[s.ref] })}>
                    {open[s.ref] ? t.less : t.more}
                  </button>
                )}
              </article>
            ))
          ) : (
            <p className="text-sm text-fog">{t.noResults}</p>
          )}
          {book?.ai && sections.length > 0 && (
            <div className="frame grid gap-3 p-5" data-testid="coach-ai">
              <p className="text-xs text-fog">{t.coachNote}</p>
              {!answer ? (
                <button type="button" onClick={() => void ask()} disabled={asking} className="btn justify-self-start disabled:opacity-50">
                  <Icon name="ai" size={16} /> {t.coach}
                </button>
              ) : answer.answer ? (
                <div className="grid gap-2">
                  <p className="leading-relaxed text-chalk" dir="auto" data-testid="coach-answer">
                    {answer.answer}
                  </p>
                  <p className="flex flex-wrap gap-2">
                    {answer.cited?.map((r) => (
                      <a key={r} href={`#rule-${r}`} className="rounded-md bg-cyan/15 px-2 py-0.5 font-mono text-xs text-cyan" dir="ltr">
                        {r}
                      </a>
                    ))}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-mist">{answer.error || answer.disabled ? t.busy : t.noCite}</p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
