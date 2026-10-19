"use client";
/**
 * Lab home: the four ways in, this person's real numbers (counted from what they did — nothing
 * estimated), recent projects, examples, the community's public projects, the parts that simulate,
 * and achievements earned from actual activity.
 */
import { useEffect, useState } from "react";
import { dashboard, gallery, meStore, projects, type Card as CardT, type Dashboard as Dash } from "../api";
import { CircuitThumb } from "../circuit/render";
import { createAndOpen } from "../circuit/editor";
import { CATEGORIES, PARTS } from "../circuit/parts";
import { EXAMPLES } from "../examples";
import { fmtNum, useLang } from "../i18n";
import { href, navigate } from "../router";
import { Badge, Button, Card, Empty, Icon, Spinner, cn, toast, type IconName } from "../ui";
import { ProjectCard } from "./projects";

const ACHIEVEMENTS: { key: string; icon: IconName; title: { en: string; ar: string }; done: (d: Dash) => boolean }[] = [
  { key: "first-project", icon: "folder", title: { en: "First project", ar: "أول مشروع" }, done: (d) => (d.activity?.create ?? 0) >= 1 },
  { key: "first-compile", icon: "code", title: { en: "First successful compile", ar: "أول كومبايل ناجح" }, done: (d) => (d.activity?.compile_ok ?? 0) >= 1 },
  { key: "first-sim", icon: "play", title: { en: "First simulation", ar: "أول محاكاة" }, done: (d) => (d.activity?.sim_run ?? 0) >= 1 },
  { key: "ten-compiles", icon: "bolt", title: { en: "10 successful compiles", ar: "10 كومبايل ناجح" }, done: (d) => (d.activity?.compile_ok ?? 0) >= 10 },
  { key: "hour-sim", icon: "history", title: { en: "An hour of simulation", ar: "ساعة محاكاة" }, done: (d) => d.sim_seconds >= 3600 },
  { key: "five-projects", icon: "star", title: { en: "Five projects", ar: "خمس مشاريع" }, done: (d) => Object.values(d.projects ?? {}).reduce((a, b) => a + (b ?? 0), 0) >= 5 },
  { key: "shared", icon: "share", title: { en: "Shared a project", ar: "شاركت مشروع" }, done: (d) => (d.activity?.share ?? 0) >= 1 },
  { key: "week", icon: "trophy", title: { en: "Active on 7 days", ar: "نشط 7 أيام" }, done: (d) => d.days >= 7 },
];

const fmtDuration = (s: number) => (s >= 3600 ? `${fmtNum(s / 3600, 1)} h` : s >= 60 ? `${fmtNum(s / 60, 0)} min` : `${fmtNum(s, 0)} s`);

export function Dashboard() {
  const { t, l } = useLang();
  const me = meStore.use();
  const [data, setData] = useState<Dash | null>(null);
  const [recent, setRecent] = useState<CardT[] | null>(null);
  const [community, setCommunity] = useState<CardT[] | null>(null);
  useEffect(() => {
    let live = true;
    if (me) {
      dashboard().then(
        (d) => {
          if (!live) return;
          setData(d);
          setRecent(d.recent);
          setCommunity(d.public);
        },
        () => live && (setRecent([]), setCommunity([])),
      );
    } else {
      void projects.list().then((r) => live && setRecent(r.slice(0, 6)));
      gallery({ sort: "popular" }).then(
        (r) => live && setCommunity(r.slice(0, 6)),
        () => live && setCommunity([]),
      );
    }
    return () => {
      live = false;
    };
  }, [me]);

  const openExample = async (slug: string) => {
    const ex = EXAMPLES.find((e) => e.slug === slug)!;
    try {
      await createAndOpen("circuit", l(ex.title), structuredClone(ex.doc), { description: l(ex.description), tags: ex.tags });
    } catch {
      toast(t("error"), "danger");
    }
  };

  const simCount = PARTS.filter((p) => p.support === "sim").length;
  const stats: [string, string][] = data
    ? [
        [t("circuitsN"), fmtNum(data.projects?.circuit ?? 0)],
        [t("codeN"), fmtNum(data.projects?.code ?? 0)],
        [t("compilesN"), fmtNum(data.activity?.compile_ok ?? 0)],
        [t("simsN"), fmtNum(data.activity?.sim_run ?? 0)],
        [t("simTime"), fmtDuration(data.sim_seconds)],
        [t("activeDays"), fmtNum(data.days)],
      ]
    : [];

  return (
    <div className="grid gap-10">
      <section className="relative overflow-hidden rounded-3xl border border-[var(--line-2)] bg-[radial-gradient(120%_120%_at_0%_0%,#13306f_0%,#081634_55%,#050e26_100%)] p-6 sm:p-10">
        <svg className="pointer-events-none absolute -end-10 -top-10 h-[130%] opacity-25" viewBox="0 0 400 300" aria-hidden>
          <path d="M20 280V160h80v-60h120v80h80V40h80" fill="none" stroke="#3cc4ff" strokeWidth={2} />
          <path d="M60 300V200h100v-40h60v100h120" fill="none" stroke="#2f7bff" strokeWidth={2} />
          {[[100, 100], [220, 180], [300, 40], [160, 160], [220, 260]].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r={5} fill="#3cc4ff" />
          ))}
        </svg>
        <p className="mb-3 font-mono text-xs tracking-[0.25em] text-cyan">BUILDX LAB</p>
        <h1 className="max-w-3xl font-display text-3xl font-bold leading-tight sm:text-5xl">{t("tagline")}</h1>
        <p className="mt-4 max-w-2xl text-mist">{t("heroBody")}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button variant="primary" icon="circuit" onClick={() => navigate("circuits/new")} data-testid="create-circuit">
            {t("createCircuit")}
          </Button>
          <Button icon="cube" onClick={() => navigate("3d")}>
            {t("start3d")}
          </Button>
          <Button icon="code" onClick={() => navigate("code")}>
            {t("openCode")}
          </Button>
          <Button variant="ghost" icon="gallery" onClick={() => navigate("gallery")}>
            {t("explore")}
          </Button>
        </div>
      </section>

      {me && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">{t("yourNumbers")}</h2>
          {data ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {stats.map(([k, v]) => (
                <div key={k} className="rounded-2xl border border-[var(--line)] bg-deep/80 p-4">
                  <p className="font-display text-2xl font-bold text-frost" dir="ltr">
                    {v}
                  </p>
                  <p className="mt-1 text-xs text-fog">{k}</p>
                </div>
              ))}
            </div>
          ) : (
            <Spinner />
          )}
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("recent")}</h2>
          <a href={href("projects")} onClick={(e) => (e.preventDefault(), navigate("projects"))} className="text-sm text-cyan hover:underline">
            {t("viewAll")}
          </a>
        </div>
        {!recent ? <Spinner /> : recent.length ? <Grid>{recent.map((p) => <ProjectCard key={p.id} p={p} />)}</Grid> : <Empty title={t("noRecent")} />}
        {!me && <p className="mt-3 text-xs text-fog">{t("guestNote")}</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold">{t("examples")}</h2>
        <p className="mb-4 text-sm text-fog">{t("examplesNote")}</p>
        <Grid>
          {EXAMPLES.map((ex) => (
            <button key={ex.slug} type="button" onClick={() => void openExample(ex.slug)} data-testid={`example-${ex.slug}`} className="group overflow-hidden rounded-2xl border border-[var(--line)] bg-deep/80 text-start transition hover:border-volt/60">
              <CircuitThumb doc={ex.doc} className="aspect-[16/9] w-full bg-[#0a1430] p-2" />
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{l(ex.title)}</p>
                  <Badge tone={ex.level === 1 ? "ok" : ex.level === 2 ? "volt" : "warn"}>{"●".repeat(ex.level)}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-fog">{l(ex.description)}</p>
              </div>
            </button>
          ))}
        </Grid>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("featured")}</h2>
          <a href={href("gallery")} onClick={(e) => (e.preventDefault(), navigate("gallery"))} className="text-sm text-cyan hover:underline">
            {t("viewAll")}
          </a>
        </div>
        {!community ? <Spinner /> : community.length ? <Grid>{community.map((p) => <ProjectCard key={p.id} p={p} />)}</Grid> : <Empty icon="gallery" title={t("noFeatured")} />}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">{t("componentsTitle")}</h2>
          <p className="mb-4 text-sm text-fog">
            {simCount} · {CATEGORIES.map((c) => l(c.label)).join(" · ")}
          </p>
          <Button icon="chip" onClick={() => navigate("components")}>
            {t("navComponents")}
          </Button>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">{t("learningPaths")}</h2>
          <p className="mb-4 text-sm text-fog">{t("comingBody")}</p>
          <Button icon="learn" onClick={() => navigate("learn")}>
            {t("navLearn")}
          </Button>
        </Card>
      </section>

      {data && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">{t("achievements")}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ACHIEVEMENTS.map((a) => {
              const done = a.done(data);
              return (
                <div key={a.key} className={cn("flex items-center gap-3 rounded-2xl border p-3", done ? "border-gold/50 bg-gold/10" : "border-[var(--line)] opacity-55")}>
                  <span className={cn("grid size-9 place-items-center rounded-xl", done ? "bg-gold/20 text-gold" : "bg-panel text-fog")}>
                    <Icon name={done ? a.icon : "lock"} />
                  </span>
                  <span className="text-sm">{l(a.title)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
