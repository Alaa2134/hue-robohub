"use client";
/** Every part in the Lab, what the simulator models for it, and its pins. */
import { useState } from "react";
import { CATEGORIES, PARTS, type PartDef } from "../circuit/parts";
import { PartArt } from "../circuit/render";
import { useLang } from "../i18n";
import { Badge, Input } from "../ui";

function Art({ def }: { def: PartDef }) {
  const b = def.box;
  return (
    <svg viewBox={`${b.x - 6} ${b.y - 6} ${b.w + 12} ${b.h + 12}`} className="h-24 w-full" aria-hidden>
      <PartArt p={{ id: def.type, type: def.type, x: 0, y: 0, rot: 0, props: { ...def.defaults } }} />
    </svg>
  );
}

export function ComponentsPage() {
  const { t, l } = useLang();
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();
  const list = s ? PARTS.filter((p) => `${p.name.en} ${p.name.ar} ${p.keywords ?? ""}`.toLowerCase().includes(s)) : PARTS;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 font-display text-2xl font-bold">{t("navComponents")}</h1>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="w-full sm:w-72" aria-label={t("search")} />
      </div>
      {CATEGORIES.map((c) => {
        const items = list.filter((p) => p.category === c.key);
        if (!items.length) return null;
        return (
          <section key={c.key}>
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-fog uppercase">{l(c.label)}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((p) => (
                <article key={p.type} className="rounded-2xl border border-[var(--line)] bg-deep/80 p-4">
                  <div className="rounded-xl bg-[#0a1430] p-2">
                    <Art def={p} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <h3 className="font-semibold">{l(p.name)}</h3>
                    {p.support === "sim" ? <Badge tone="ok">{t("simulated")}</Badge> : <Badge tone="warn">{t("visualOnly")}</Badge>}
                  </div>
                  {p.note && <p className="mt-2 text-xs leading-relaxed text-fog">{l(p.note)}</p>}
                  {p.category !== "breadboards" && (
                    <p className="mt-2 font-mono text-[11px] text-steel" dir="ltr">
                      {p
                        .pins(p.defaults)
                        .map((x) => x.name)
                        .join(" · ")}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
