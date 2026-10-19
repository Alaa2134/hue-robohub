"use client";
/** Project lists (circuits, code, everything), creating, importing, and each project's card. */
import { useEffect, useRef, useState } from "react";
import { meStore, projects, type Card as CardT, type Kind, type ListFilter } from "../api";
import { createAndOpen } from "../circuit/editor";
import { emptyDoc, validDoc, type CircuitDoc } from "../circuit/model";
import { fmtDate, useLang } from "../i18n";
import { href, navigate } from "../router";
import { Badge, Button, Empty, Icon, IconButton, Input, Modal, Select, Spinner, cn, toast, useDebounced } from "../ui";
import { Grid } from "./dashboard";

const KIND_PATH: Record<Kind, string> = { circuit: "circuits", code: "code", blocks: "codeblocks", cad: "3d" };
const KIND_ICON = { circuit: "circuit", code: "code", blocks: "blocks", cad: "cube" } as const;

export function ProjectCard({ p, onChanged }: { p: CardT; onChanged?: () => void }) {
  const { t, l, lang } = useLang();
  const url = `${KIND_PATH[p.kind]}/${p.id}`;
  const [askDelete, setAskDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
      onChanged?.();
    } catch {
      toast(t("error"), "danger");
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-deep/80 transition hover:border-volt/60" data-testid="project-card">
      <a href={href(url)} onClick={(e) => (e.preventDefault(), navigate(url))} className="block">
        {p.thumbnail ? (
          <img src={p.thumbnail} alt="" className="aspect-[16/9] w-full bg-[#0a1430] object-contain" />
        ) : (
          <div className="grid aspect-[16/9] place-items-center bg-[#0a1430] text-steel">
            <Icon name={KIND_ICON[p.kind]} size={36} />
          </div>
        )}
      </a>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start gap-2">
          <a href={href(url)} onClick={(e) => (e.preventDefault(), navigate(url))} className="min-w-0 flex-1 truncate font-semibold hover:text-cyan">
            {p.title}
          </a>
          {p.visibility !== "private" && <Badge tone="volt">{t(p.visibility)}</Badge>}
        </div>
        <p className="text-xs text-fog">
          {!p.mine && p.owner ? `${t("by")} ${p.owner} · ` : ""}
          {t("updated")} {fmtDate(p.updated_at, lang)}
        </p>
        {p.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {p.tags.slice(0, 4).map((x) => (
              <Badge key={x}>{x}</Badge>
            ))}
          </div>
        )}
        {onChanged && (
          <div className="mt-auto flex items-center gap-1 pt-1">
            {!p.deleted_at ? (
              <>
                <IconButton icon="star" label={t("favorites")} active={p.favorite} onClick={() => act(() => projects.favorite(p.id, !p.favorite))} />
                <IconButton icon="copy" label={t("duplicate")} onClick={() => act(() => projects.clone(p.id))} />
                {p.mine && (
                  <IconButton icon="trash" label={t("del")} onClick={() => setAskDelete(true)} disabled={busy} />
                )}
              </>
            ) : (
              <Button size="sm" icon="undo" disabled={busy} onClick={() => act(() => projects.trash(p.id, false), l({ en: "Restored", ar: "اترجّع" }))}>
                {t("restore")}
              </Button>
            )}
            {p.favorites > 0 && (
              <span className="ms-auto flex items-center gap-1 text-xs text-fog">
                <Icon name="star" size={13} /> {p.favorites}
              </span>
            )}
          </div>
        )}
      </div>
      <Modal open={askDelete} onClose={() => setAskDelete(false)} title={t("del")}>
        <div className="grid gap-4">
          <p className="text-sm text-mist">
            {t("confirmDelete")} <span className="font-semibold text-frost">{p.title}</span>
          </p>
          <p className="text-xs text-fog">{l({ en: "You can restore it from the Trash tab.", ar: "تقدر ترجّعه من تبويب المحذوفات." })}</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAskDelete(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              data-testid="confirm-trash"
              onClick={async () => {
                await act(() => projects.trash(p.id, true), l({ en: "Moved to the trash", ar: "اتنقل للمحذوفات" }));
                setAskDelete(false);
              }}
            >
              {t("del")}
            </Button>
          </div>
        </div>
      </Modal>
    </article>
  );
}

export function ProjectList({ kind }: { kind?: Kind }) {
  const { t } = useLang();
  const me = meStore.use();
  const [tab, setTab] = useState<"all" | "favorites" | "shared" | "trash">("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<ListFilter["sort"]>("updated");
  const dq = useDebounced(q);
  const [list, setList] = useState<CardT[] | null>(null);
  const [tick, setTick] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let live = true;
    setList(null);
    projects
      .list({ kind, q: dq || undefined, favorites: tab === "favorites", deleted: tab === "trash", shared: tab === "shared", sort })
      .then((r) => live && setList(r), () => live && setList([]));
    return () => {
      live = false;
    };
  }, [kind, dq, tab, sort, tick, me]);

  const title = kind === "circuit" ? t("navCircuits") : kind === "code" ? t("navCode") : t("navProjects");
  const newKind: "circuit" | "code" = kind === "code" ? "code" : "circuit";

  const importFile = async (f: File) => {
    try {
      const j = JSON.parse(await f.text()) as { format?: string; kind?: string; title?: string; description?: string; tags?: string[]; data?: unknown };
      if (j.format !== "buildx-lab" || !validDoc(j.data)) throw new Error("format");
      await createAndOpen(j.kind === "code" ? "code" : "circuit", String(j.title ?? f.name).slice(0, 120), j.data as CircuitDoc, { description: String(j.description ?? "").slice(0, 4000), tags: Array.isArray(j.tags) ? j.tags.slice(0, 12).map(String) : [] });
    } catch {
      toast(t("error"), "danger");
    }
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 font-display text-2xl font-bold">{title}</h1>
        <input ref={file} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
        <Button icon="upload" onClick={() => file.current?.click()}>
          {t("importFile")}
        </Button>
        <Button variant="primary" icon="plus" onClick={() => navigate(newKind === "code" ? "code" : "circuits/new", newKind === "code" ? { query: { new: "1" } } : {})} data-testid="new-project">
          {t("newProject")}
        </Button>
      </div>
      {kind === "code" && <NewCodeOnQuery />}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "favorites", ...(me ? (["shared"] as const) : []), "trash"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cn("rounded-full px-3 py-1.5 text-sm", tab === k ? "bg-volt/20 text-ice ring-1 ring-volt/50" : "text-mist hover:bg-panel")}>
            {k === "all" ? t("all") : k === "favorites" ? t("favorites") : k === "shared" ? t("sharedWithMe") : t("trash")}
          </button>
        ))}
        <span className="flex-1" />
        <div className="relative w-full sm:w-64">
          <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fog" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="ps-9" aria-label={t("search")} />
        </div>
        <Select value={sort} onChange={(e) => setSort(e.target.value as ListFilter["sort"])} className="w-36" aria-label="Sort">
          <option value="updated">{t("updated")}</option>
          <option value="title">{t("title")}</option>
          <option value="created">+</option>
        </Select>
      </div>
      {!list ? (
        <Spinner />
      ) : list.length ? (
        <Grid>
          {list.map((p) => (
            <ProjectCard key={p.id} p={p} onChanged={() => setTick((x) => x + 1)} />
          ))}
        </Grid>
      ) : (
        <Empty title={t("emptyProjects")}>
          {tab === "all" && (
            <Button variant="primary" icon="plus" onClick={() => navigate(newKind === "code" ? "code" : "circuits/new", newKind === "code" ? { query: { new: "1" } } : {})}>
              {t("newProject")}
            </Button>
          )}
        </Empty>
      )}
    </div>
  );
}

/** /lab/code/?new=1 → a new Code Studio project with an Uno on the canvas. */
function NewCodeOnQuery() {
  const started = useRef(false);
  const { t } = useLang();
  useEffect(() => {
    if (started.current || new URLSearchParams(location.search).get("new") !== "1") return;
    started.current = true;
    const d = emptyDoc();
    d.parts = [{ id: "uno", type: "arduino-uno", x: 0, y: 0, rot: 0, props: {} }];
    d.files = [{ name: "sketch.ino", text: "void setup() {\n  Serial.begin(9600);\n  pinMode(LED_BUILTIN, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(LED_BUILTIN, HIGH);\n  delay(500);\n  digitalWrite(LED_BUILTIN, LOW);\n  delay(500);\n}\n" }];
    createAndOpen("code", "Sketch", d).catch(() => toast(t("error"), "danger"));
  }, [t]);
  return null;
}

/** /lab/circuits/new: a blank circuit, opened straight away. */
export function NewProject({ kind }: { kind: "circuit" }) {
  const { t } = useLang();
  const started = useRef(false);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const d = emptyDoc();
    projects
      .create(kind, t("untitled"), d)
      .then((id) => navigate(`circuits/${id}`, { replace: true }))
      .catch(() => setErr(true));
  }, [kind, t]);
  return err ? <Empty title={t("error")} /> : <Spinner size={28} />;
}
