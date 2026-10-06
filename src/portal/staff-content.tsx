"use client";
/** Content library: upload files (PDF, slides, video, code…) or add links, per group. */
import { useMemo, useRef, useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import { MAX_UPLOAD, fileUrl, fmt, must, removeObjects, safeName, sb, uid, uploadObject, type Material, type StaffRow } from "./core";
import { GroupSelect, useGroups } from "./staff-data";
import {
  Badge,
  Bar,
  Button,
  Chip,
  Empty,
  ErrorBox,
  Field,
  Icon,
  IconButton,
  Input,
  List,
  Loading,
  Row,
  SearchBox,
  Sheet,
  Textarea,
  Toggle,
  TopBar,
  confirmDialog,
  copyText,
  toast,
  useAsync,
  type IconKey,
} from "./ui";

export function kindIcon(m: { kind: string; mime?: string | null; file_name?: string | null; fileName?: string | null }): IconKey {
  if (m.kind === "link") return "link";
  const mime = m.mime ?? "";
  const name = (m.file_name ?? m.fileName ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "film";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "book";
  if (/\.(zip|rar|7z)$/.test(name)) return "layers";
  if (/\.(ino|c|cpp|h|py|js|ts)$/.test(name)) return "cpu";
  return "file";
}

export function StaffContent({ me }: { me: StaffRow }) {
  const { data, error, loading, reload, set } = useAsync(async () => must(await sb().from("materials").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false })) as Material[], []);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [upload, setUpload] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const groups = useGroups(useMemo(() => (data ?? []).map((m) => m.group_name), [data]));

  const shown = (data ?? []).filter((m) => (group === null || m.group_name === group) && (!q.trim() || m.title.includes(q.trim()) || m.description.includes(q.trim())));

  const update = async (m: Material, patch: Partial<Material>) => {
    try {
      const row = must(await sb().from("materials").update(patch).eq("id", m.id).select().single()) as Material;
      set((list) => (list ?? []).map((x) => (x.id === m.id ? row : x)));
      setEditing(row);
      return true;
    } catch (e) {
      toast.error(e);
      return false;
    }
  };

  const remove = async (m: Material) => {
    if (!(await confirmDialog({ title: `حذف «${m.title}»؟`, body: "سيختفي من عند الطلاب نهائيًا.", ok: "حذف", danger: true }))) return;
    try {
      const gone = must(await sb().from("materials").delete().eq("id", m.id).select("id")) as { id: string }[];
      if (!gone.length) throw new Error("forbidden");
      if (m.storage_path) await removeObjects([m.storage_path]).catch(() => undefined);
      set((list) => (list ?? []).filter((x) => x.id !== m.id));
      setEditing(null);
      toast("تم الحذف");
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <TopBar
        title="المحتوى"
        sub="ملفات وروابط تظهر للطلاب في التطبيق"
        actions={
          <>
            <IconButton icon="link" label="إضافة رابط" onClick={() => setLinkOpen(true)} />
            <Button size="sm" variant="primary" icon="upload" onClick={() => setUpload(true)}>
              رفع ملف
            </Button>
          </>
        }
      />
      <div className="grid gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="ابحث في المحتوى" />
        {groups.length > 0 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            <Chip active={group === null} onClick={() => setGroup(null)}>
              الكل
            </Chip>
            <Chip active={group === ""} onClick={() => setGroup("")}>
              لكل الطلاب
            </Chip>
            {groups.map((g) => (
              <Chip key={g} active={group === g} onClick={() => setGroup(g)}>
                {g}
              </Chip>
            ))}
          </div>
        )}
      </div>
      <div className="mt-4">
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorBox error={error} retry={reload} />
        ) : !data?.length ? (
          <Empty
            icon="book"
            title="لا يوجد محتوى بعد"
            body="ارفع ملفات المحاضرات (PDF، عروض، فيديو، أكواد) أو أضف روابط، وهتظهر للطلاب فورًا."
            action={
              <Button variant="primary" icon="upload" onClick={() => setUpload(true)}>
                رفع أول ملف
              </Button>
            }
          />
        ) : !shown.length ? (
          <Empty icon="search" title="لا نتائج" />
        ) : (
          <List>
            {shown.map((m) => (
              <Row key={m.id} onClick={() => setEditing(m)}>
                <div className="flex items-center gap-3">
                  <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", m.published ? "bg-volt/15 text-[#8fb5ff]" : "bg-white/[0.04] text-fog")}>
                    <Icon name={kindIcon(m)} size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-chalk">{m.title}</p>
                    <p className="truncate text-xs text-fog">
                      {m.group_name || "لكل الطلاب"} · {m.kind === "link" ? "رابط" : <bdi dir="ltr">{fmt.size(m.size_bytes)}</bdi>} · {fmt.short(m.created_at)}
                    </p>
                  </div>
                  {m.pinned && <Icon name="pin" size={16} className="text-cyan" />}
                  {!m.published && <Badge>مخفي</Badge>}
                </div>
              </Row>
            ))}
          </List>
        )}
      </div>

      <UploadSheet open={upload} onClose={() => setUpload(false)} groups={groups} onDone={reload} />
      <LinkSheet open={linkOpen} onClose={() => setLinkOpen(false)} groups={groups} onDone={reload} />
      <MaterialSheet material={editing} me={me} groups={groups} onClose={() => setEditing(null)} onUpdate={update} onRemove={remove} />
    </>
  );
}

function MaterialSheet({
  material: m,
  me,
  groups,
  onClose,
  onUpdate,
  onRemove,
}: {
  material: Material | null;
  me: StaffRow;
  groups: string[];
  onClose: () => void;
  onUpdate: (m: Material, patch: Partial<Material>) => Promise<boolean>;
  onRemove: (m: Material) => void;
}) {
  const [edit, setEdit] = useState<{ title: string; description: string; group: string } | null>(null);
  if (!m) return null;
  const href = m.kind === "link" ? m.url! : fileUrl(m.storage_path!);
  const canDelete = me.role !== "lead" || m.created_by === me.user_id;
  return (
    <Sheet
      open
      onClose={() => {
        setEdit(null);
        onClose();
      }}
      title={m.title}
    >
      {edit ? (
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onUpdate(m, { title: edit.title.trim(), description: edit.description.trim(), group_name: edit.group })) setEdit(null);
          }}
        >
          <Field label="العنوان">
            <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required maxLength={160} />
          </Field>
          <Field label="وصف (اختياري)">
            <Textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} rows={3} maxLength={2000} />
          </Field>
          <Field label="يظهر لـ">
            <GroupSelect value={edit.group} onChange={(group) => setEdit({ ...edit, group })} groups={groups} allLabel="كل الطلاب" allowNew />
          </Field>
          <Button type="submit" variant="primary" icon="check" block>
            حفظ
          </Button>
        </form>
      ) : (
        <div className="grid gap-3">
          {m.description && <p className="whitespace-pre-line text-sm leading-relaxed text-mist">{m.description}</p>}
          <p className="text-xs text-fog">
            {m.group_name || "لكل الطلاب"} ·{" "}
            {m.kind === "link" ? (
              "رابط"
            ) : (
              <>
                <bdi>{m.file_name ?? ""}</bdi> · <bdi dir="ltr">{fmt.size(m.size_bytes)}</bdi>
              </>
            )}{" "}
            · {fmt.dateTime(m.created_at)}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <a href={href} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#3d7dff] to-[#1f57e6] font-semibold text-white">
              <Icon name="external" size={18} />
              فتح
            </a>
            <Button icon="copy" onClick={() => copyText(href, "تم نسخ الرابط")}>
              نسخ الرابط
            </Button>
          </div>
          <Toggle checked={m.published} onChange={(published) => onUpdate(m, { published })} label="ظاهر للطلاب" />
          <Toggle checked={m.pinned} onChange={(pinned) => onUpdate(m, { pinned })} label="تثبيت في الأعلى" />
          <div className="grid grid-cols-2 gap-2">
            <Button icon="edit" onClick={() => setEdit({ title: m.title, description: m.description, group: m.group_name })}>
              تعديل
            </Button>
            {canDelete && (
              <Button variant="danger" icon="trash" onClick={() => onRemove(m)}>
                حذف
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

type Pending = { id: string; file: File; title: string; progress: number; state: "wait" | "up" | "done" | "error"; error?: string };

function UploadSheet({ open, onClose, groups, onDone }: { open: boolean; onClose: () => void; groups: string[]; onDone: () => void }) {
  const [items, setItems] = useState<Pending[]>([]);
  const [group, setGroup] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const pick = (files: FileList | null) => {
    if (!files) return;
    const add = [...files].map<Pending>((file) => ({
      id: uid(),
      file,
      title: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || file.name,
      progress: 0,
      state: file.size > MAX_UPLOAD ? "error" : "wait",
      error: file.size > MAX_UPLOAD ? "أكبر من 50 ميجابايت" : undefined,
    }));
    setItems((list) => [...list, ...add]);
  };

  const patch = (id: string, p: Partial<Pending>) => setItems((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const start = async () => {
    setBusy(true);
    let ok = 0;
    for (const it of items.filter((x) => x.state === "wait")) {
      patch(it.id, { state: "up", progress: 0 });
      const path = `m/${uid()}/${safeName(it.file.name)}`;
      try {
        await uploadObject(path, it.file, it.file.type, (p) => patch(it.id, { progress: p }));
        must(
          await sb()
            .from("materials")
            .insert({ title: it.title.trim() || it.file.name, description: description.trim(), kind: "file", storage_path: path, file_name: it.file.name.slice(0, 200), mime: it.file.type || null, size_bytes: it.file.size, group_name: group })
            .select("id"),
        );
        patch(it.id, { state: "done", progress: 1 });
        ok++;
      } catch (e) {
        await removeObjects([path]).catch(() => undefined);
        patch(it.id, { state: "error", error: (e as Error).message });
      }
    }
    setBusy(false);
    if (ok) {
      toast(`تم رفع ${ok} ملف`);
      onDone();
    }
  };

  const close = () => {
    if (busy) return;
    setItems([]);
    setDescription("");
    onClose();
  };
  const waiting = items.filter((x) => x.state === "wait").length;
  const finished = items.length > 0 && items.every((x) => x.state === "done" || x.state === "error");

  return (
    <Sheet open={open} onClose={close} title="رفع ملفات">
      <div className="grid gap-4">
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[var(--line-2)] px-4 py-8 text-mist transition hover:border-cyan/50 hover:text-chalk"
        >
          <Icon name="upload" size={30} className="text-cyan" />
          <span className="font-semibold">اختر ملفات من الجهاز</span>
          <span className="text-xs text-fog">PDF، عروض، صور، فيديو، أكواد… حتى 50 ميجابايت للملف</span>
        </button>
        {items.length > 0 && (
          <div className="grid gap-2">
            {items.map((it) => (
              <div key={it.id} className="rounded-xl border border-[var(--line)] p-3">
                <div className="flex items-center gap-2">
                  <Icon name={it.state === "done" ? "checkCircle" : it.state === "error" ? "xCircle" : "file"} size={18} className={it.state === "done" ? "text-ok" : it.state === "error" ? "text-[#ff8794]" : "text-fog"} />
                  {it.state === "wait" ? (
                    <input value={it.title} onChange={(e) => patch(it.id, { title: e.target.value })} className="min-w-0 flex-1 bg-transparent text-sm text-chalk outline-none" aria-label="عنوان الملف" />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm text-chalk">{it.title}</span>
                  )}
                  <span className="shrink-0 text-xs text-fog">{fmt.size(it.file.size)}</span>
                  {it.state === "wait" && <IconButton icon="close" label="إزالة" className="size-8" onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))} />}
                </div>
                {it.state === "up" && (
                  <div className="mt-2">
                    <Bar value={it.progress * 100} />
                  </div>
                )}
                {it.error && <p className="mt-1 text-xs text-[#ff9aa5]">{it.error}</p>}
              </div>
            ))}
          </div>
        )}
        <Field label="يظهر لـ">
          <GroupSelect value={group} onChange={setGroup} groups={groups} allLabel="كل الطلاب" allowNew />
        </Field>
        <Field label="وصف (اختياري)">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={2000} />
        </Field>
        {finished ? (
          <Button variant="primary" size="lg" icon="check" onClick={close} block>
            تم
          </Button>
        ) : (
          <Button variant="primary" size="lg" icon="upload" loading={busy} disabled={!waiting} onClick={start} block>
            {waiting ? `رفع ${waiting} ملف` : "رفع"}
          </Button>
        )}
      </div>
    </Sheet>
  );
}

function LinkSheet({ open, onClose, groups, onDone }: { open: boolean; onClose: () => void; groups: string[]; onDone: () => void }) {
  const [form, setForm] = useState({ title: "", url: "", description: "", group: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    let url = form.url.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    url = url.replace(/^http:\/\//i, "https://");
    setBusy(true);
    try {
      must(await sb().from("materials").insert({ title: form.title.trim(), url, description: form.description.trim(), kind: "link", group_name: form.group }).select("id"));
      toast("تمت إضافة الرابط");
      setForm({ title: "", url: "", description: "", group: "" });
      onDone();
      onClose();
    } catch (e2) {
      toast.error(e2);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="إضافة رابط">
      <form onSubmit={submit} className="grid gap-4">
        <Field label="العنوان">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={160} />
        </Field>
        <Field label="الرابط" hint="يوتيوب، Google Drive، Tinkercad، GitHub…">
          <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required dir="ltr" inputMode="url" placeholder="https://" />
        </Field>
        <Field label="يظهر لـ">
          <GroupSelect value={form.group} onChange={(group) => setForm({ ...form, group })} groups={groups} allLabel="كل الطلاب" allowNew />
        </Field>
        <Field label="وصف (اختياري)">
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} maxLength={2000} />
        </Field>
        <Button type="submit" variant="primary" size="lg" icon="plus" loading={busy} block>
          إضافة
        </Button>
      </form>
    </Sheet>
  );
}
