"use client";
/**
 * «مواقع هتفيدك» in the app: the team adds, edits, orders and hides the sites on the website's
 * directory, and goes through what visitors suggested (add it in one tap, or set it aside).
 * The website shows the change right away; a new site gets its screenshot within a day.
 */
import { useMemo, useState } from "react";
import { DIR_CATEGORIES, type Price } from "@/content/directory";
import { can, errorText, fmt, must, sb, type StaffRow } from "./core";
import {
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  ErrorBox,
  Field,
  Input,
  List,
  Loading,
  Row,
  SearchBox,
  Select,
  Sheet,
  Textarea,
  Toggle,
  TopBar,
  toast,
  useAsync,
} from "./ui";

type Site = {
  id: string;
  slug: string;
  name: string;
  url: string;
  cat: string;
  price: Price;
  idea_ar: string;
  tip_ar: string;
  idea_en: string;
  tip_en: string;
  sort_order: number;
  published: boolean;
};
type Suggestion = {
  id: string;
  url: string;
  name: string | null;
  why: string;
  contact: string | null;
  status: "new" | "added" | "declined";
  created_at: string;
};
type Draft = Omit<Site, "id"> & { id?: string; suggestion?: string };

const PRICE: Record<Price, string> = { free: "مجاني", freemium: "فيه نسخة مجانية", student: "مجاني للطلبة" };
const catLabel = (k: string) => DIR_CATEGORIES.find((c) => c.key === k)?.ar ?? k;
const slugOf = (name: string, url: string) =>
  (name || new URL(url).hostname.replace(/^www\./, "").split(".")[0] || "site")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || `site-${Date.now().toString(36)}`;
const blank = (sort: number): Draft => ({
  slug: "",
  name: "",
  url: "https://",
  cat: "electronics",
  price: "free",
  idea_ar: "",
  tip_ar: "",
  idea_en: "",
  tip_en: "",
  sort_order: sort,
  published: true,
});

export function DirectoryScreen({ me }: { me: StaffRow }) {
  const editor = can(me, "site");
  const { data, error, loading, reload, set } = useAsync(async () => {
    const [sites, suggestions] = await Promise.all([
      sb().from("directory_sites").select("*").order("sort_order").order("name").then(must) as Promise<
        Site[]
      >,
      sb()
        .from("directory_suggestions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200)
        .then(must) as Promise<Suggestion[]>,
    ]);
    return { sites, suggestions };
  }, []);
  const [tab, setTab] = useState<"sites" | "suggestions">("sites");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [draft, setDraftRaw] = useState<{ d: Draft; n: number } | null>(null);
  const setDraft = (d: Draft | null) => setDraftRaw((o) => (d ? { d, n: (o?.n ?? 0) + 1 } : null));
  const fresh = (data?.suggestions ?? []).filter((s) => s.status === "new");
  const shown = useMemo(
    () =>
      (data?.sites ?? []).filter(
        (s) =>
          (cat === "all" || s.cat === cat) &&
          (!q.trim() || `${s.name} ${s.url} ${s.idea_ar}`.toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [data, cat, q],
  );
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox error={error} retry={reload} />;
  const nextSort = Math.max(0, ...data.sites.map((s) => s.sort_order)) + 10;

  const decide = async (s: Suggestion, status: Suggestion["status"]) => {
    try {
      await sb().from("directory_suggestions").update({ status }).eq("id", s.id).then(must);
      set({ ...data, suggestions: data.suggestions.map((x) => (x.id === s.id ? { ...x, status } : x)) });
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <TopBar
        title="مواقع هتفيدك"
        sub={`${data.sites.filter((s) => s.published).length} موقع على الموقع · ${fresh.length} اقتراح جديد`}
        back="/staff/more"
        actions={
          editor ? (
            <Button size="sm" variant="primary" icon="plus" onClick={() => setDraft(blank(nextSort))}>
              موقع
            </Button>
          ) : undefined
        }
      />
      <div className="mb-3 flex gap-2">
        <Chip active={tab === "sites"} onClick={() => setTab("sites")} count={data.sites.length}>
          المواقع
        </Chip>
        <Chip active={tab === "suggestions"} onClick={() => setTab("suggestions")} count={fresh.length}>
          اقتراحات الزوار
        </Chip>
      </div>
      {tab === "sites" ? (
        <>
          <SearchBox value={q} onChange={setQ} placeholder="دوّر على موقع…" />
          <div className="rail -mx-4 mt-3 gap-1.5 px-4">
            <Chip active={cat === "all"} onClick={() => setCat("all")}>
              الكل
            </Chip>
            {DIR_CATEGORIES.map((c) => (
              <Chip key={c.key} active={cat === c.key} onClick={() => setCat(c.key)}>
                {c.ar}
              </Chip>
            ))}
          </div>
          {!shown.length ? (
            <Empty icon="link" title="مفيش مواقع هنا" />
          ) : (
            <div className="mt-3" data-testid="dir-sites">
              <List>
                {shown.map((s) => (
                  <Row key={s.id} onClick={editor ? () => setDraft({ ...s }) : undefined}>
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-chalk" dir="ltr">
                          {s.name}
                        </p>
                        <p className="truncate text-xs text-fog">
                          {catLabel(s.cat)} · {PRICE[s.price]}
                        </p>
                        <p className="line-clamp-1 text-xs text-mist">{s.idea_ar}</p>
                      </div>
                      {!s.published && <Badge tone="muted">مخفي</Badge>}
                    </div>
                  </Row>
                ))}
              </List>
            </div>
          )}
        </>
      ) : !data.suggestions.length ? (
        <Empty
          icon="link"
          title="مفيش اقتراحات لسه"
          body="الزوار بيقترحوا مواقع من آخر صفحة «مواقع هتفيدك» على الموقع."
        />
      ) : (
        <div className="grid gap-2" data-testid="dir-suggestions">
          {data.suggestions.map((s) => (
            <Card key={s.id} className="grid gap-2">
              <div className="flex items-center gap-2">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-sm text-cyan"
                  dir="ltr"
                >
                  {s.url}
                </a>
                <Badge tone={s.status === "new" ? "info" : s.status === "added" ? "ok" : "muted"}>
                  {s.status === "new" ? "جديد" : s.status === "added" ? "اتضاف" : "مش مناسب"}
                </Badge>
              </div>
              <p className="text-sm text-mist">{s.why}</p>
              <p className="text-[11px] text-fog">
                {s.contact ? `${s.contact} · ` : ""}
                {fmt.dateTime(s.created_at)}
              </p>
              {editor && s.status === "new" && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      setDraft({
                        ...blank(nextSort),
                        url: s.url.replace(/^http:/, "https:"),
                        name: s.name ?? "",
                        idea_ar: s.why,
                        suggestion: s.id,
                      })
                    }
                  >
                    ضيفه
                  </Button>
                  <Button size="sm" onClick={() => void decide(s, "declined")}>
                    مش مناسب
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {draft && (
        <SiteSheet
          key={draft.n}
          draft={draft.d}
          taken={new Set(data.sites.map((s) => s.slug))}
          onClose={() => setDraft(null)}
          onSaved={(site, suggestion) => {
            const sites = data.sites.some((x) => x.id === site.id)
              ? data.sites.map((x) => (x.id === site.id ? site : x))
              : [...data.sites, site];
            set({
              ...data,
              sites,
              suggestions: data.suggestions.map((x) => (x.id === suggestion ? { ...x, status: "added" } : x)),
            });
            if (suggestion)
              void sb()
                .from("directory_suggestions")
                .update({ status: "added" })
                .eq("id", suggestion)
                .then(({ error }) => error && toast.error(error));
            setDraft(null);
          }}
        />
      )}
    </>
  );
}

function SiteSheet({
  draft,
  taken,
  onClose,
  onSaved,
}: {
  draft: Draft;
  taken: Set<string>;
  onClose: () => void;
  onSaved: (s: Site, suggestion?: string) => void;
}) {
  const [d, setD] = useState<Draft>(draft);
  const [busy, setBusy] = useState(false);
  const up = (p: Partial<Draft>) => setD({ ...d, ...p });
  const save = async () => {
    if (!/^https:\/\/\S{4,}$/.test(d.url.trim())) return toast("اللينك لازم يبدأ بـ https://", "error");
    if (d.name.trim().length < 2 || d.idea_ar.trim().length < 5) return toast("اكتب الاسم والفكرة", "error");
    setBusy(true);
    try {
      let slug = d.slug || slugOf(d.name, d.url.trim());
      if (!d.id)
        for (let n = 2; taken.has(slug); n++) slug = `${slugOf(d.name, d.url.trim()).slice(0, 36)}-${n}`;
      const body = {
        slug,
        name: d.name.trim(),
        url: d.url.trim(),
        cat: d.cat,
        price: d.price,
        idea_ar: d.idea_ar.trim(),
        tip_ar: d.tip_ar.trim(),
        idea_en: d.idea_en.trim(),
        tip_en: d.tip_en.trim(),
        sort_order: d.sort_order,
        published: d.published,
      };
      const out = (
        d.id
          ? await sb()
              .from("directory_sites")
              .update({ ...body, updated_at: new Date().toISOString() })
              .eq("id", d.id)
              .select("*")
              .single()
              .then(must)
          : await sb().from("directory_sites").insert(body).select("*").single().then(must)
      ) as Site;
      toast(d.id ? "اتحفظ" : "اتضاف على الموقع (الصورة بتتاخد خلال يوم)");
      onSaved(out, d.suggestion);
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={d.id ? d.name : "موقع جديد"}>
      <div className="grid gap-3" data-testid="dir-sheet">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الاسم">
            <Input dir="ltr" value={d.name} maxLength={60} onChange={(e) => up({ name: e.target.value })} />
          </Field>
          <Field label="اللينك">
            <Input
              dir="ltr"
              type="url"
              value={d.url}
              maxLength={300}
              onChange={(e) => up({ url: e.target.value })}
            />
          </Field>
          <Field label="القسم">
            <Select value={d.cat} onChange={(e) => up({ cat: e.target.value })}>
              {DIR_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.ar}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="السعر">
            <Select value={d.price} onChange={(e) => up({ price: e.target.value as Price })}>
              {(Object.keys(PRICE) as Price[]).map((p) => (
                <option key={p} value={p}>
                  {PRICE[p]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="فكرته في سطر">
          <Textarea
            rows={2}
            maxLength={400}
            value={d.idea_ar}
            onChange={(e) => up({ idea_ar: e.target.value })}
          />
        </Field>
        <Field label="جرّب (أول حاجة تعملها)">
          <Input value={d.tip_ar} maxLength={300} onChange={(e) => up({ tip_ar: e.target.value })} />
        </Field>
        <details className="rounded-xl border border-[var(--line-2)] p-3">
          <summary className="cursor-pointer text-sm text-mist">بالإنجليزي (اختياري)</summary>
          <div className="mt-3 grid gap-3">
            <Field label="Idea">
              <Textarea
                dir="ltr"
                rows={2}
                maxLength={400}
                value={d.idea_en}
                onChange={(e) => up({ idea_en: e.target.value })}
              />
            </Field>
            <Field label="Try">
              <Input
                dir="ltr"
                value={d.tip_en}
                maxLength={300}
                onChange={(e) => up({ tip_en: e.target.value })}
              />
            </Field>
          </div>
        </details>
        <Field label="الترتيب" hint="الأصغر بيظهر الأول.">
          <Input
            type="number"
            inputMode="numeric"
            value={d.sort_order}
            onChange={(e) => up({ sort_order: Number(e.target.value) || 0 })}
          />
        </Field>
        <Toggle
          checked={d.published}
          onChange={(v) => up({ published: v })}
          label={d.published ? "ظاهر على الموقع" : "مخفي"}
        />
        <Button variant="primary" loading={busy} onClick={() => void save()}>
          احفظ
        </Button>
      </div>
    </Sheet>
  );
}
