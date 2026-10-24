"use client";
/** Community gallery: projects their owners made public. Counts are real saves, nothing seeded. */
import { useEffect, useState } from "react";
import { gallery, type Card as CardT, type Kind } from "../api";
import { useLang } from "../i18n";
import { Empty, Icon, Input, Select, Spinner, useDebounced } from "../ui";
import { Grid } from "./dashboard";
import { ProjectCard } from "./projects";

export function Gallery() {
  const { t } = useLang();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind | "">("");
  const [sort, setSort] = useState<"new" | "popular">("new");
  const dq = useDebounced(q);
  const [list, setList] = useState<CardT[] | null>(null);
  useEffect(() => {
    let live = true;
    setList(null);
    gallery({ q: dq || undefined, kind: kind || undefined, sort }).then(
      (r) => live && setList(r),
      () => live && setList([]),
    );
    return () => {
      live = false;
    };
  }, [dq, kind, sort]);
  return (
    <div className="grid gap-6">
      <h1 className="font-display text-2xl font-bold">{t("navGallery")}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fog" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="ps-9" aria-label={t("search")} />
        </div>
        <Select value={kind} onChange={(e) => setKind(e.target.value as Kind | "")} className="w-40" aria-label="Kind">
          <option value="">{t("all")}</option>
          <option value="circuit">{t("navCircuits")}</option>
          <option value="code">{t("navCode")}</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as "new" | "popular")} className="w-36" aria-label="Sort">
          <option value="new">{t("updated")}</option>
          <option value="popular">★</option>
        </Select>
      </div>
      {!list ? <Spinner /> : list.length ? <Grid>{list.map((p) => <ProjectCard key={p.id} p={p} />)}</Grid> : <Empty icon="gallery" title={t("noFeatured")} />}
    </div>
  );
}
