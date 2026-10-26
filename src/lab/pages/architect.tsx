"use client";
/**
 * Project Architect: what a project needs, what it costs and where to get it — from real, dated
 * sources only — and a wiring review before anything runs.
 *  - Start from a Lab design (its parts come from the circuit itself), or, where the team turned it
 *    on, from your idea: the AI picks parts from the Lab's catalog and lists the connections.
 *  - Each part: how many are free in the BuildX store now, and every price the team entered, with the
 *    shop, the link and the day it was checked (older than 30 days says so). No price is guessed.
 *  - The wiring: a Lab design is checked by the circuit check now; an AI plan becomes a Lab project
 *    with the parts placed and the connections as a checklist, checked when you wire and run it.
 */
import { useEffect, useMemo, useState } from "react";
import { architect, type ArchitectPlan, type PartAvail } from "../api";
import { bom, type BomLine } from "../circuit/bom";
import { createAndOpen } from "../circuit/editor";
import { emptyDoc, uid, type CircuitDoc } from "../circuit/model";
import { PARTS, PART_BY_TYPE } from "../circuit/parts";
import { CircuitThumb } from "../circuit/render";
import { EXAMPLES } from "../examples";
import { checkCircuit, diagHelp, diagText, partLabels } from "../sim/diagnostics";
import { fmtNum, useLang } from "../i18n";
import { Badge, Button, Card, Spinner, cn, toast } from "../ui";

type Source = { kind: "example"; slug: string } | { kind: "plan"; plan: ArchitectPlan };
const INSTRUMENTS = new Set(["voltmeter", "ammeter"]);

/** An AI plan as a Lab circuit: its parts placed on a grid, not wired (the student wires them). */
export function planDoc(plan: ArchitectPlan): CircuitDoc {
  const doc = emptyDoc();
  let i = 0;
  for (const p of plan.parts) {
    const def = PART_BY_TYPE.get(p.type);
    if (!def) continue;
    for (let k = 0; k < Math.min(p.qty, 6); k++, i++) doc.parts.push({ id: uid(), type: p.type, x: 80 + (i % 4) * 220, y: 80 + Math.floor(i / 4) * 200, rot: 0, props: { ...def.defaults } });
  }
  doc.files[0].text = plan.code || doc.files[0].text;
  return doc;
}

export function ArchitectPage() {
  const { l, lang } = useLang();
  const [source, setSource] = useState<Source>({ kind: "example", slug: EXAMPLES[0].slug });
  const [ai, setAi] = useState(false);
  const [idea, setIdea] = useState("");
  const [planning, setPlanning] = useState(false);
  const [avail, setAvail] = useState<Record<string, PartAvail> | null>(null);
  const example = source.kind === "example" ? EXAMPLES.find((e) => e.slug === source.slug) : undefined;
  const doc = useMemo(() => (source.kind === "example" ? example?.doc : planDoc(source.plan)), [source, example]);

  const lines: (BomLine & { why?: string })[] = useMemo(() => {
    if (source.kind === "example" && doc) return bom(doc, l);
    if (source.kind === "plan")
      return source.plan.parts.map((p) => ({ type: p.type, name: PART_BY_TYPE.get(p.type)?.name ?? { en: p.type, ar: p.type }, spec: "", qty: p.qty, ids: [], why: p.why }));
    return [];
  }, [source, doc, l]);
  const types = useMemo(() => [...new Set(lines.map((x) => x.type))], [lines]);

  useEffect(() => {
    void architect.aiOn().then(setAi, () => setAi(false));
  }, []);
  useEffect(() => {
    let live = true;
    setAvail(null);
    architect.parts(types).then(
      (a) => live && setAvail(a),
      () => live && setAvail({}),
    );
    return () => {
      live = false;
    };
  }, [types]);

  // The wiring review: only for a design that has wires (an AI plan is wired by the student first).
  const review = useMemo(() => (source.kind === "example" && doc ? checkCircuit(doc) : null), [source, doc]);
  const labels = useMemo(() => (doc ? partLabels(doc, l) : new Map<string, string>()), [doc, l]);
  const errors = review?.filter((d) => d.level === "error") ?? [];

  const cheapest = (t: string) => avail?.[t]?.prices[0];
  const priced = lines.filter((x) => cheapest(x.type));
  const total = priced.reduce((s, x) => s + x.qty * cheapest(x.type)!.price, 0);
  const missing = lines.filter((x) => !cheapest(x.type));
  const stale = priced.some((x) => cheapest(x.type)!.stale);

  const plan = async () => {
    setPlanning(true);
    try {
      const catalog = PARTS.filter((p) => !INSTRUMENTS.has(p.type)).map((p) => ({ type: p.type, name: p.name.en }));
      const r = await architect.plan(idea.trim(), catalog);
      if (r.plan) setSource({ kind: "plan", plan: r.plan });
      else toast(l({ en: "The architect couldn't plan this right now — start from a Lab design below.", ar: "المعماري معرفش يخطط ده دلوقتي — ابدأ من تصميم في اللاب تحت." }), "danger");
    } finally {
      setPlanning(false);
    }
  };

  const open = () => {
    if (!doc) return;
    const title = source.kind === "example" ? l(example!.title) : source.plan.title || l({ en: "My project", ar: "مشروعي" });
    const description =
      source.kind === "plan" ? [source.plan.summary, "", l({ en: "Connections to wire:", ar: "التوصيلات اللي هتعملها:" }), ...source.plan.connections.map((c) => `☐ ${c}`)].join("\n") : l(example!.description);
    createAndOpen("circuit", title, doc, { description, tags: ["architect"] }).catch(() => toast(l({ en: "Couldn't create the project", ar: "معرفتش أعمل المشروع" }), "danger"));
  };

  return (
    <div className="grid gap-6" data-testid="architect">
      <header className="grid gap-2">
        <h1 className="font-display text-2xl font-bold">{l({ en: "Project Architect", ar: "معماري المشاريع" })}</h1>
        <p className="max-w-3xl text-sm text-fog">
          {l({
            en: "What your project needs, what's free in the BuildX store right now, and prices only from shops the team checked — each with its date. The wiring is reviewed before anything runs.",
            ar: "مشروعك محتاج إيه، إيه المتاح في مخزن BuildX دلوقتي، والأسعار من محلات الفريق راجعها بس — وكل سعر بتاريخه. والتوصيلات بتتراجع قبل أي تشغيل.",
          })}
        </p>
      </header>

      {ai && (
        <Card className="grid gap-3" data-testid="architect-ai">
          <p className="font-semibold">{l({ en: "Describe your idea", ar: "اوصف فكرتك" })}</p>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            maxLength={600}
            rows={3}
            dir="auto"
            placeholder={l({ en: "e.g. A plant pot that waters itself when the soil is dry", ar: "مثلًا: أصيص زرع بيسقي نفسه لما التربة تنشف" })}
            className="w-full rounded-lg bg-panel p-3 text-sm ring-1 ring-rim"
          />
          <div>
            <Button variant="primary" icon="bolt" disabled={planning || idea.trim().length < 10} onClick={() => void plan()}>
              {planning ? <Spinner /> : l({ en: "Plan it", ar: "خطّط" })}
            </Button>
          </div>
          <p className="text-xs text-fog">
            {l({ en: "The AI picks parts from the Lab's catalog only; it never gives prices.", ar: "الـAI بيختار قطع من كتالوج اللاب بس، ومبيديش أسعار أبدًا." })}
          </p>
        </Card>
      )}

      <section className="grid gap-3">
        <p className="font-semibold">{l({ en: "Or start from a Lab design", ar: "أو ابدأ من تصميم في اللاب" })}</p>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {EXAMPLES.map((e) => (
            <button
              key={e.slug}
              type="button"
              onClick={() => setSource({ kind: "example", slug: e.slug })}
              data-testid={`architect-example-${e.slug}`}
              className={cn("grid w-44 shrink-0 gap-1 rounded-xl border p-2 text-start", source.kind === "example" && source.slug === e.slug ? "border-volt bg-volt/10" : "border-[var(--line)] hover:border-volt/50")}
            >
              <CircuitThumb doc={e.doc} className="aspect-[16/10] w-full rounded bg-[#0a1430]" />
              <span className="truncate text-sm">{l(e.title)}</span>
            </button>
          ))}
        </div>
      </section>

      {source.kind === "plan" && (
        <Card className="grid gap-2" data-testid="architect-plan">
          <p className="text-lg font-semibold">{source.plan.title}</p>
          <p className="text-sm text-mist">{source.plan.summary}</p>
          {source.plan.steps.length > 0 && (
            <ol className="list-decimal space-y-1 ps-5 text-sm text-mist">
              {source.plan.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
        </Card>
      )}

      <Card className="grid gap-3 overflow-x-auto" data-testid="architect-bom">
        <p className="font-semibold">{l({ en: "Parts, store and prices", ar: "القطع والمخزن والأسعار" })}</p>
        {avail === null ? (
          <Spinner />
        ) : (
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="text-xs text-fog">
              <tr>
                <th className="py-1 text-start">{l({ en: "Part", ar: "القطعة" })}</th>
                <th className="text-center">{l({ en: "Qty", ar: "العدد" })}</th>
                <th className="text-start">{l({ en: "BuildX store", ar: "مخزن BuildX" })}</th>
                <th className="text-start">{l({ en: "Price (checked)", ar: "السعر (اتراجع)" })}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((x) => {
                const a = avail[x.type];
                const p = a?.prices[0];
                return (
                  <tr key={`${x.type}|${x.spec}`} className="border-t border-[var(--line)] align-top" data-testid={`architect-line-${x.type}`}>
                    <td className="py-2">
                      <span>{l(x.name)}</span>
                      {x.spec && <span className="block text-xs text-fog">{x.spec}</span>}
                      {x.why && <span className="block text-xs text-fog">{x.why}</span>}
                    </td>
                    <td className="text-center font-mono">{x.qty}</td>
                    <td>
                      {a?.store.items ? (
                        <Badge tone={a.store.free >= x.qty ? "ok" : "warn"}>{l({ en: `${a.store.free} free`, ar: `${a.store.free} متاح` })}</Badge>
                      ) : (
                        <span className="text-xs text-fog">{l({ en: "Not in the store", ar: "مش في المخزن" })}</span>
                      )}
                    </td>
                    <td>
                      {p ? (
                        <span className="grid gap-0.5">
                          <span>
                            {`${fmtNum(p.price, p.price % 1 ? 2 : 0)} ${p.currency}`} {p.stale && <Badge tone="warn">{l({ en: "old", ar: "قديم" })}</Badge>}
                          </span>
                          <span className="text-xs text-fog">
                            {p.url ? (
                              <a href={p.url} target="_blank" rel="noopener noreferrer" className="underline">
                                {p.source}
                              </a>
                            ) : (
                              p.source
                            )}
                            {` · ${new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${p.checked_on}T12:00:00`))}`}
                            {a.prices.length > 1 ? ` · ${l({ en: `${a.prices.length} shops`, ar: `${a.prices.length} محلات` })}` : ""}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-fog">{l({ en: "No checked price yet", ar: "لسه مفيش سعر متراجع" })}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {avail && (
          <div className="grid gap-1 text-sm" data-testid="architect-total">
            {priced.length > 0 && <p className="font-semibold">{l({ en: `Parts with a price: ${fmtNum(total, 0)} EGP`, ar: `القطع اللي ليها سعر: ${fmtNum(total, 0)} جنيه` })}</p>}
            {missing.length > 0 && (
              <p className="text-fog">{l({ en: `${missing.length} part(s) have no checked price — not counted.`, ar: `${missing.length} قطعة لسه ملهاش سعر متراجع — مش محسوبة.` })}</p>
            )}
            {stale && <p className="text-warn">{l({ en: "Some prices were checked more than 30 days ago.", ar: "فيه أسعار اتراجعت من أكتر من 30 يوم." })}</p>}
          </div>
        )}
      </Card>

      <Card className="grid gap-2" data-testid="architect-wiring">
        <p className="font-semibold">{l({ en: "Wiring review", ar: "مراجعة التوصيلات" })}</p>
        {source.kind === "plan" ? (
          <>
            <ul className="grid gap-1 text-sm">
              {source.plan.connections.map((c, i) => (
                <li key={i} dir="auto">
                  ☐ {c}
                </li>
              ))}
            </ul>
            <p className="text-xs text-fog">
              {l({
                en: "Open it in the Lab, wire these, and the circuit check reviews every connection before the simulation runs.",
                ar: "افتحه في اللاب ووصّل دول، وفحص الدايرة هيراجع كل توصيلة قبل ما المحاكاة تشتغل.",
              })}
            </p>
          </>
        ) : review && review.length === 0 ? (
          <p className="text-sm text-ok">{l({ en: "The circuit check found nothing to fix.", ar: "فحص الدايرة ملقاش حاجة محتاجة تتصلح." })}</p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {review?.map((d, i) => {
              const h = diagHelp(d, l);
              return (
                <li key={i} className={d.level === "error" ? "text-danger" : d.level === "warning" ? "text-warn" : "text-mist"}>
                  {diagText(d, l, labels)}
                  {h.fix && <span className="block text-xs text-fog">{h.fix}</span>}
                </li>
              );
            })}
          </ul>
        )}
        <div>
          <Button variant="primary" icon="circuit" onClick={open} disabled={errors.length > 0} data-testid="architect-open">
            {l({ en: "Open in the Lab", ar: "افتحه في اللاب" })}
          </Button>
        </div>
      </Card>
    </div>
  );
}
