"use client";
/** "مواقع هتفيدك": search and category chips over the recommended websites, each with a screenshot. */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/brand/icons";
import { DIR_CATEGORIES, fromRow, type DirRow, type DirSite, type Price } from "@/content/directory";
import { cn } from "@/lib/cn";
import { BASE_PATH } from "@/lib/deploy";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";
import { timeoutSignal } from "@/lib/timeout";

const L = {
  ar: { all: "الكل", search: "دوّر على موقع أو فكرة…", tip: "جرّب", open: "افتح الموقع", none: "مفيش مواقع بالكلام ده.", count: (n: number) => `${n} موقع`, price: { free: "مجاني", freemium: "فيه نسخة مجانية", student: "مجاني للطلبة" } as Record<Price, string> },
  en: { all: "All", search: "Search a site or an idea…", tip: "Try", open: "Open the site", none: "No sites match that.", count: (n: number) => `${n} sites`, price: { free: "Free", freemium: "Free plan", student: "Free for students" } as Record<Price, string> },
};
const norm = (s: string) => s.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");

/** Screenshot when the workflow has taken one, else a drawn cover in the category's colours. */
function Cover({ site, shot }: { site: DirSite; shot: boolean }) {
  const cat = DIR_CATEGORIES.find((c) => c.key === site.cat);
  if (shot)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`${BASE_PATH}/media/directory/${site.id}.webp`} alt="" width={640} height={400} loading="lazy" decoding="async" className="aspect-[16/10] w-full object-cover object-top" />
    );
  return (
    <div className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden bg-[radial-gradient(120%_90%_at_20%_10%,rgba(47,123,255,0.35),transparent_60%),radial-gradient(90%_80%_at_90%_100%,rgba(56,182,255,0.25),transparent_60%)]" aria-hidden="true">
      <Icon name={cat?.icon ?? "globe"} size={64} className="text-cyan/40" />
      <span className="absolute bottom-3 start-4 font-display text-2xl font-bold text-chalk/80" dir="ltr">
        {site.name}
      </span>
    </div>
  );
}

/** The list as the team keeps it now (a few minutes in this visit), else the one built into the page. */
function useLiveSites(initial: DirSite[]) {
  const [sites, setSites] = useState(initial);
  useEffect(() => {
    const key = "bx-directory";
    try {
      const c = JSON.parse(sessionStorage.getItem(key) ?? "null") as { at: number; rows: DirRow[] } | null;
      if (c && Date.now() - c.at < 300_000 && c.rows.length) return setSites(c.rows.map(fromRow));
    } catch {}
    fetch(`${SUPABASE_URL}/rest/v1/directory_sites?select=slug,name,url,cat,price,idea_ar,tip_ar,idea_en,tip_en&published=eq.true&order=sort_order.asc,name.asc&limit=500`, {
      headers: { apikey: SUPABASE_KEY },
      signal: timeoutSignal(6000),
    })
      .then((r) => (r.ok ? (r.json() as Promise<DirRow[]>) : null))
      .then((rows) => {
        if (!rows?.length) return;
        setSites(rows.map(fromRow));
        try {
          sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), rows }));
        } catch {}
      })
      .catch(() => {});
  }, []);
  return sites;
}

const S = {
  ar: { title: "تعرف موقع مفيد؟", body: "اقترحه علينا، والفريق بيراجعه ويضيفه هنا لو مناسب.", url: "لينك الموقع", why: "بيفيد في إيه؟", name: "اسمك (اختياري)", send: "ابعت الاقتراح", sent: "وصلنا اقتراحك، شكرًا! 🙏", invalid: "اكتب لينك صح وسبب قصير.", limited: "استنى شوية وجرب تاني." },
  en: { title: "Know a useful site?", body: "Suggest it and the team will review it and add it here if it fits.", url: "Site link", why: "What is it good for?", name: "Your name (optional)", send: "Send suggestion", sent: "Got it, thank you! 🙏", invalid: "Add a valid link and a short reason.", limited: "Please wait a little and try again." },
};

/** A visitor suggests a site (rate-limited; the hidden field and the timing catch bots). */
function Suggest({ lang }: { lang: "ar" | "en" }) {
  const t = S[lang];
  const started = useRef(Date.now());
  const [f, setF] = useState({ url: "", why: "", name: "", website: "" });
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const url = /^https?:\/\//i.test(f.url.trim()) ? f.url.trim() : `https://${f.url.trim()}`;
    setState("busy");
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/suggest_site`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p: { url, why: f.why, contact: f.name, locale: lang, website: f.website, elapsed: String(Date.now() - started.current) } }),
        signal: timeoutSignal(10_000),
      });
      const out = (await r.json()) as { ok: boolean; error?: string };
      if (out.ok) return setState("sent");
      setState("error");
      setMsg(out.error === "rate_limited" || out.error === "busy" ? t.limited : t.invalid);
    } catch {
      setState("error");
      setMsg(t.limited);
    }
  };
  if (state === "sent") return <p className="frame mt-10 p-6 text-center text-chalk" data-testid="suggest-sent">{t.sent}</p>;
  return (
    <form onSubmit={submit} className="frame relative mt-10 grid min-w-0 grid-cols-1 gap-3 p-6" data-testid="suggest-site">
      <p className="text-lg font-semibold text-chalk">{t.title}</p>
      <p className="text-sm text-mist">{t.body}</p>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <input required dir="ltr" inputMode="url" maxLength={300} placeholder="https://" aria-label={t.url} value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} className="h-11 w-full min-w-0 rounded-xl border border-[var(--line-2)] bg-panel/60 px-4 text-chalk placeholder:text-fog" />
        <input maxLength={60} placeholder={t.name} aria-label={t.name} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-11 w-full min-w-0 rounded-xl border border-[var(--line-2)] bg-panel/60 px-4 text-chalk placeholder:text-fog" />
      </div>
      <textarea required minLength={5} maxLength={500} rows={2} placeholder={t.why} aria-label={t.why} value={f.why} onChange={(e) => setF({ ...f, why: e.target.value })} className="w-full min-w-0 rounded-xl border border-[var(--line-2)] bg-panel/60 px-4 py-3 text-chalk placeholder:text-fog" />
      <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="pointer-events-none absolute start-0 top-0 h-px w-px opacity-0" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} name="website" />
      {state === "error" && <p className="text-sm text-danger">{msg}</p>}
      <button type="submit" disabled={state === "busy"} className="h-11 justify-self-start rounded-full bg-cyan/20 px-6 text-sm font-semibold text-chalk transition hover:bg-cyan/30 disabled:opacity-50">
        {t.send}
      </button>
    </form>
  );
}

export function Directory({ locale, shots, sites: initial }: { locale: string; shots: string[]; sites: DirSite[] }) {
  const lang = locale === "en" ? "en" : "ar";
  const t = L[lang];
  const sites = useLiveSites(initial);
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const have = useMemo(() => new Set(shots), [shots]);
  const shown = useMemo(() => {
    const words = norm(q.trim()).split(/\s+/).filter(Boolean);
    return sites.filter((s) => (cat === "all" || s.cat === cat) && words.every((w) => norm(`${s.name} ${s.ar.idea} ${s.en.idea} ${s.ar.tip} ${s.url}`).includes(w)));
  }, [cat, q, sites]);
  return (
    <div data-testid="directory">
      <div className="mb-6 flex flex-col gap-4">
        <label className="relative block">
          <Icon name="search" size={18} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-fog" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.search}
            aria-label={t.search}
            className="h-12 w-full rounded-full border border-[var(--line-2)] bg-panel/60 ps-11 pe-4 text-chalk placeholder:text-fog focus:border-cyan/60 focus:outline-none"
          />
        </label>
        <div role="toolbar" aria-label="Filter" className="rail -mx-5 gap-2 px-5 sm:mx-0 sm:flex-wrap sm:px-0">
          {[{ key: "all", label: t.all }, ...DIR_CATEGORIES.map((c) => ({ key: c.key, label: c[lang] }))].map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={cat === f.key}
              onClick={() => setCat(f.key)}
              className={cn("h-10 shrink-0 rounded-full border px-4 text-sm transition-colors", cat === f.key ? "border-cyan/60 bg-cyan/10 text-chalk" : "border-[var(--line-2)] text-mist hover:text-chalk")}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-fog" aria-live="polite">
          {t.count(shown.length)}
        </p>
      </div>
      {shown.length ? (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((s) => (
            <li key={s.id} className="frame flex flex-col overflow-hidden" data-testid="directory-card">
              <a href={s.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} className="block border-b border-[var(--line)] bg-void">
                <Cover site={s} shot={have.has(s.id)} />
              </a>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-chalk" dir="ltr">
                    {s.name}
                  </h3>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[0.7rem]", s.price === "free" ? "bg-emerald-400/10 text-emerald-300" : s.price === "student" ? "bg-cyan/10 text-cyan" : "bg-white/5 text-mist")}>{t.price[s.price]}</span>
                </div>
                <p className="text-sm leading-relaxed text-mist">{s[lang].idea}</p>
                <p className="rounded-xl bg-white/[0.03] p-3 text-sm text-fog">
                  <b className="text-chalk">{t.tip}:</b> {s[lang].tip}
                </p>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex items-center gap-1.5 self-start text-sm font-medium text-cyan hover:underline">
                  {t.open}
                  <Icon name="arrowUpRight" size={16} />
                </a>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="frame p-8 text-center text-mist">{t.none}</p>
      )}
      <Suggest lang={lang} />
    </div>
  );
}
