"use client";
/**
 * /staff/rules — the Competition Coach's rule books. Paste a competition's rules (from the official
 * PDF or page); the app splits them at their numbers so the Coach can find and cite each one; check
 * the split, then publish. The AI answer on /coach is off until turned on here (it spends AI credit,
 * within the guide's limits).
 */
import { useMemo, useState } from "react";
import { duplicateRefs, splitRules, type RuleSection } from "@/lib/rules-split";
import { can, errorText, rpc, type StaffRow } from "./core";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Sheet, Textarea, Toggle, TopBar, toast, useAsync } from "./ui";

type Book = { id: string; slug: string; title: string; title_en: string | null; competition: string; edition: string; source_url: string | null; published: boolean; updated_at: string; sections: RuleSection[] };

const toText = (s: RuleSection[]) => s.map((x) => (x.ref === "0" ? x.body : `${x.ref} ${x.heading}\n${x.body === x.heading ? "" : x.body}`.trim())).join("\n\n");

function BookSheet({ book, onClose, onSaved }: { book: Book | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    slug: book?.slug ?? "",
    title: book?.title ?? "",
    title_en: book?.title_en ?? "",
    competition: book?.competition ?? "",
    edition: book?.edition ?? "",
    source_url: book?.source_url ?? "",
    published: book?.published ?? false,
  });
  const [text, setText] = useState(book ? toText(book.sections) : "");
  const [busy, setBusy] = useState(false);
  const sections = useMemo(() => splitRules(text), [text]);
  const dup = useMemo(() => duplicateRefs(sections), [sections]);
  const save = async () => {
    if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(f.slug)) return toast("الرابط حروف إنجليزي صغيرة وأرقام وشرطة (مثلًا wro-2026-junior)", "error");
    if (!sections.length) return toast("الصق نص القواعد الأول", "error");
    setBusy(true);
    try {
      const r = await rpc<{ ok: boolean; error?: string }>("staff_rulebook_save", { p: { id: book?.id ?? null, ...f, sections } });
      if (!r.ok) return toast("مينفعش الحفظ — راجع البيانات", "error");
      toast("اتحفظ");
      onSaved();
      onClose();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={book ? book.title : "قواعد مسابقة جديدة"} wide>
      <div className="grid gap-3" data-testid="rulebook-editor">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الاسم">
            <Input value={f.title} maxLength={140} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          <Field label="الاسم بالإنجليزي (اختياري)">
            <Input value={f.title_en} maxLength={140} dir="ltr" onChange={(e) => setF({ ...f, title_en: e.target.value })} />
          </Field>
          <Field label="المسابقة">
            <Input value={f.competition} maxLength={80} placeholder="WRO, Robotex, FLL…" onChange={(e) => setF({ ...f, competition: e.target.value })} />
          </Field>
          <Field label="النسخة / السنة">
            <Input value={f.edition} maxLength={40} onChange={(e) => setF({ ...f, edition: e.target.value })} />
          </Field>
          <Field label="الرابط في الموقع" hint="حروف إنجليزي صغيرة وأرقام وشرطة">
            <Input value={f.slug} dir="ltr" maxLength={50} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} />
          </Field>
          <Field label="رابط الملف الرسمي (اختياري)">
            <Input value={f.source_url} dir="ltr" placeholder="https://" onChange={(e) => setF({ ...f, source_url: e.target.value })} />
          </Field>
        </div>
        <Field label="نص القواعد" hint="انسخه من الملف الرسمي زي ما هو. كل مادة بتبدأ برقمها في أول السطر (4.2، 4.2.1، Rule 12، مادة 5).">
          <Textarea value={text} rows={12} dir="auto" onChange={(e) => setText(e.target.value)} data-testid="rules-text" />
        </Field>
        <p className="text-sm text-mist" data-testid="rules-split">{`اتقسمت لـ ${sections.length} مادة`}</p>
        {dup.length > 0 && <p className="text-sm text-warn">{`أرقام متكررة: ${dup.join("، ")} — غالبًا الفهرس اتنسخ مع القواعد؛ شيله عشان الاستشهاد يبقى واضح.`}</p>}
        <div className="grid max-h-64 gap-1 overflow-y-auto rounded-xl border border-[var(--line)] p-2 text-xs">
          {sections.slice(0, 200).map((s, i) => (
            <p key={i} className="truncate text-mist" dir="auto">
              <span className="font-mono text-cyan">{s.ref}</span> {s.heading || s.body.slice(0, 80)}
            </p>
          ))}
        </div>
        <Toggle checked={f.published} onChange={(published) => setF({ ...f, published })} label="منشورة على صفحة المدرب" />
        <Button loading={busy} onClick={() => void save()}>
          حفظ
        </Button>
      </div>
    </Sheet>
  );
}

export function StaffRules({ me }: { me: StaffRow }) {
  const { data, error, loading, reload } = useAsync(() => rpc<{ ai: boolean; books: Book[] }>("staff_rulebooks"), []);
  const [editing, setEditing] = useState<Book | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const toggleAi = async (on: boolean) => {
    setBusy(true);
    try {
      await rpc("staff_coach_ai", { p_enabled: on });
      toast(on ? "إجابات المدرب بالـAI اشتغلت" : "إجابات المدرب بالـAI اتقفلت");
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <TopBar title="قواعد المسابقات" sub="مدرب المسابقات على الموقع (/coach)" actions={<Button icon="plus" onClick={() => setEditing("new")}>قواعد جديدة</Button>} />
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : data ? (
        <div className="grid gap-3" data-testid="staff-rules">
          <Card className="grid gap-2">
            <Toggle
              checked={data.ai}
              disabled={busy || !can(me, "settings")}
              onChange={(on) => void toggleAi(on)}
              label="إجابة المدرب بالـAI"
              hint="بتصرف كريديت AI (في حدود بقلظ اليومية). من غيرها الصفحة بتعرض القواعد اللي ليها علاقة بس — ببلاش."
            />
          </Card>
          {data.books.length ? (
            data.books.map((b) => (
              <Card key={b.id} className="flex flex-wrap items-center gap-2" data-testid={`rulebook-${b.slug}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-chalk">{b.title}</p>
                  <p className="text-xs text-fog">{`${b.competition}${b.edition ? ` · ${b.edition}` : ""} · ${b.sections.length} مادة · /coach`}</p>
                </div>
                <Badge tone={b.published ? "ok" : "muted"}>{b.published ? "منشورة" : "مسودة"}</Badge>
                <Button variant="ghost" icon="edit" onClick={() => setEditing(b)}>
                  تعديل
                </Button>
              </Card>
            ))
          ) : (
            <Empty icon="book" title="لسه مفيش قواعد" body="الصق قواعد مسابقة عشان الطلبة يسألوا فيها على صفحة المدرب." />
          )}
        </div>
      ) : null}
      {editing && <BookSheet book={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
  );
}
