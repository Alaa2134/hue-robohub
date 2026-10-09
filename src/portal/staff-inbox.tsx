"use client";
/**
 * BuildX App → the website's inbox ("Contact us" messages and sponsorship requests) and the
 * "tell me when applications open" waitlist.
 */
import { useMemo, useState } from "react";
import { safeHref } from "@/components/brand/social-icons";
import { mailtoLink, whatsappLink } from "@/lib/contact";
import { isFull, downloadCsv, fmt, must, sb, today, type StaffRow } from "./core";
import {
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  ErrorBox,
  Field,
  Icon,
  Input,
  List,
  Loading,
  Row,
  SearchBox,
  Sheet,
  Textarea,
  TopBar,
  confirmDialog,
  copyText,
  toast,
  useAsync,
} from "./ui";

type Status = "new" | "read" | "replied" | "archived";
type Message = {
  id: string;
  kind: "contact" | "sponsor";
  locale: "ar" | "en";
  name: string;
  email: string | null;
  phone: string | null;
  organization: string | null;
  topic: string;
  message: string;
  extra: { tier?: string; website?: string; interest?: string };
  status: Status;
  note: string | null;
  handled_at: string | null;
  created_at: string;
};

const STATUS: Record<Status, { ar: string; tone: "info" | "volt" | "ok" | "muted" }> = {
  new: { ar: "جديدة", tone: "info" },
  read: { ar: "اتقرت", tone: "volt" },
  replied: { ar: "اترد عليها", tone: "ok" },
  archived: { ar: "أرشيف", tone: "muted" },
};
const TOPIC: Record<string, string> = {
  general: "عام",
  partnership: "شراكة / رعاية",
  media: "إعلام",
  workshop: "طلب ورشة",
  other: "أخرى",
  sponsor: "طلب رعاية",
};
const TIER: Record<string, string> = {
  strategic: "شريك استراتيجي",
  gold: "راعي ذهبي",
  silver: "راعي فضي",
  technical: "شريك تقني",
  unsure: "مش متأكدين",
};

/** Unread messages (home dashboard). */
export async function newMessagesCount(): Promise<number> {
  const r = await sb()
    .from("inbox_messages")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  return r.count ?? 0;
}

export function InboxScreen({ me }: { me: StaffRow }) {
  const { data, error, loading, reload, set } = useAsync(
    async () =>
      (await sb()
        .from("inbox_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500)
        .then(must)) as Message[],
    [],
  );
  const [filter, setFilter] = useState<"open" | "sponsor" | "replied" | "archived">("open");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Message | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? [])
      .filter((m) =>
        filter === "open"
          ? m.status === "new" || m.status === "read"
          : filter === "sponsor"
            ? m.kind === "sponsor" && m.status !== "archived"
            : m.status === filter,
      )
      .filter(
        (m) =>
          !s ||
          [m.name, m.email, m.phone, m.organization, m.message].some((x) => x?.toLowerCase().includes(s)),
      );
  }, [data, filter, q]);

  const count = (f: typeof filter) =>
    (data ?? []).filter((m) =>
      f === "open"
        ? m.status === "new" || m.status === "read"
        : f === "sponsor"
          ? m.kind === "sponsor" && m.status !== "archived"
          : m.status === f,
    ).length;

  const update = async (m: Message, patch: Partial<Message>) => {
    try {
      const row = {
        ...patch,
        ...(patch.status === "replied" || patch.status === "archived"
          ? { handled_at: new Date().toISOString() }
          : {}),
      };
      await sb().from("inbox_messages").update(row).eq("id", m.id).then(must);
      const next = { ...m, ...row } as Message;
      set((data ?? []).map((x) => (x.id === m.id ? next : x)));
      setOpen((o) => (o?.id === m.id ? next : o));
    } catch (e) {
      toast.error(e);
    }
  };

  const view = (m: Message) => {
    setOpen(m);
    if (m.status === "new") void update(m, { status: "read" });
  };

  const exportCsv = () =>
    downloadCsv(`buildx-messages-${today()}.csv`, [
      ["التاريخ", "النوع", "الاسم", "الجهة", "الإيميل", "الموبايل", "الموضوع", "الباقة", "الرسالة", "الحالة"],
      ...(data ?? []).map((m) => [
        fmt.dateTime(m.created_at),
        m.kind === "sponsor" ? "رعاية" : "تواصل",
        m.name,
        m.organization,
        m.email,
        m.phone,
        TOPIC[m.topic] ?? m.topic,
        m.extra?.tier ? TIER[m.extra.tier] : "",
        m.message,
        STATUS[m.status].ar,
      ]),
    ]);

  return (
    <>
      <TopBar
        title="رسائل الموقع"
        sub="«كلّمنا» وطلبات الرعاية"
        back="/staff/more"
        actions={
          <Button size="sm" icon="download" onClick={exportCsv} disabled={!data?.length}>
            Excel
          </Button>
        }
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip active={filter === "open"} onClick={() => setFilter("open")} count={count("open")}>
          محتاجة رد
        </Chip>
        <Chip active={filter === "sponsor"} onClick={() => setFilter("sponsor")} count={count("sponsor")}>
          طلبات رعاية
        </Chip>
        <Chip active={filter === "replied"} onClick={() => setFilter("replied")} count={count("replied")}>
          اترد عليها
        </Chip>
        <Chip active={filter === "archived"} onClick={() => setFilter("archived")}>
          الأرشيف
        </Chip>
      </div>
      <div className="mt-3">
        <SearchBox value={q} onChange={setQ} placeholder="دوّر بالاسم أو الإيميل أو الكلام…" />
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !list.length ? (
        <Empty
          icon="bell"
          title={filter === "open" ? "مفيش رسايل مستنية رد 🎉" : "مفيش حاجة هنا"}
          body="الرسايل اللي بتتبعت من صفحة «كلّمنا» وطلبات الرعاية من صفحة الشركاء بتظهر هنا."
        />
      ) : (
        <List className="mt-4">
          {list.map((m) => (
            <Row key={m.id} onClick={() => view(m)}>
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1.5 size-2.5 shrink-0 rounded-full ${m.status === "new" ? "bg-cyan" : "bg-transparent"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-chalk">{m.name}</span>
                    {m.organization && <span className="truncate text-sm text-fog">· {m.organization}</span>}
                    {m.kind === "sponsor" && <Badge tone="warn">رعاية</Badge>}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-mist">{m.message}</p>
                  <p className="mt-1 text-xs text-fog">
                    {fmt.rel(m.created_at)} · {TOPIC[m.topic] ?? m.topic}
                  </p>
                </div>
                <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].ar}</Badge>
              </div>
            </Row>
          ))}
        </List>
      )}
      {open && (
        <MessageSheet
          m={open}
          me={me}
          onClose={() => setOpen(null)}
          onUpdate={(p) => update(open, p)}
          onDelete={async () => {
            if (
              !(await confirmDialog({
                title: "مسح الرسالة؟",
                body: "مش هتقدر ترجعها.",
                ok: "امسح",
                danger: true,
              }))
            )
              return;
            try {
              await sb().from("inbox_messages").delete().eq("id", open.id).then(must);
              set((data ?? []).filter((x) => x.id !== open.id));
              setOpen(null);
            } catch (e) {
              toast.error(e);
            }
          }}
        />
      )}
    </>
  );
}

function MessageSheet({
  m,
  me,
  onClose,
  onUpdate,
  onDelete,
}: {
  m: Message;
  me: StaffRow;
  onClose: () => void;
  onUpdate: (p: Partial<Message>) => Promise<void>;
  onDelete: () => void;
}) {
  const [note, setNote] = useState(m.note ?? "");
  const first = m.name.split(/\s+/)[0];
  const greet =
    m.locale === "en"
      ? `Hi ${first}, this is the BuildX HUE team. Thanks for your message.`
      : `أهلاً ${first}، معاك فريق BuildX HUE. شكراً على رسالتك.`;
  const wa = whatsappLink(m.phone, greet);
  const mail = m.email
    ? mailtoLink(m.email, m.kind === "sponsor" ? "BuildX HUE — Sponsorship" : "BuildX HUE", `${greet}\n\n`)
    : null;
  return (
    <Sheet open onClose={onClose} title={m.kind === "sponsor" ? "طلب رعاية" : "رسالة من الموقع"}>
      <div className="grid gap-4">
        <div>
          <p className="text-lg font-bold text-chalk">{m.name}</p>
          {m.organization && <p className="text-sm text-mist">{m.organization}</p>}
          <p className="mt-1 text-xs text-fog">
            {fmt.dateTime(m.created_at)} · {TOPIC[m.topic] ?? m.topic} ·{" "}
            {m.locale === "en" ? "English" : "عربي"}
          </p>
        </div>
        {m.kind === "sponsor" && (m.extra?.tier || m.extra?.interest || m.extra?.website) && (
          <Card className="grid gap-1 text-sm">
            {m.extra.tier && (
              <p>
                <span className="text-fog">الباقة: </span>
                <span className="text-chalk">{TIER[m.extra.tier] ?? m.extra.tier}</span>
              </p>
            )}
            {m.extra.interest && (
              <p>
                <span className="text-fog">مهتمين بـ: </span>
                <span className="text-chalk">{m.extra.interest}</span>
              </p>
            )}
            {safeHref(m.extra.website) && (
              <a
                href={safeHref(m.extra.website)!}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-cyan underline"
                dir="ltr"
              >
                {m.extra.website}
              </a>
            )}
          </Card>
        )}
        <p className="whitespace-pre-line rounded-2xl bg-white/[0.04] p-4 leading-relaxed text-frost">
          {m.message}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1fa855] px-4 font-semibold text-white"
              onClick={() => m.status !== "replied" && void onUpdate({ status: "replied" })}
            >
              رد على واتساب
            </a>
          )}
          {mail && (
            <a
              href={mail}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--line-2)] px-4 font-semibold text-chalk"
              onClick={() => m.status !== "replied" && void onUpdate({ status: "replied" })}
            >
              <Icon name="mail" size={18} />
              رد بالإيميل
            </a>
          )}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {m.email && (
            <Button size="sm" icon="copy" onClick={() => copyText(m.email!)}>
              {m.email}
            </Button>
          )}
          {m.phone && (
            <Button size="sm" icon="copy" onClick={() => copyText(m.phone!)}>
              <span dir="ltr">{m.phone}</span>
            </Button>
          )}
        </div>
        <Field label="ملاحظة داخلية" hint="محدش بيشوفها غير الفريق.">
          <Textarea
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (m.note ?? "") && void onUpdate({ note })}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          {m.status !== "replied" && (
            <Button size="sm" variant="primary" onClick={() => onUpdate({ status: "replied" })}>
              اترد عليها ✓
            </Button>
          )}
          {m.status !== "archived" ? (
            <Button size="sm" onClick={() => onUpdate({ status: "archived" }).then(onClose)}>
              أرشيف
            </Button>
          ) : (
            <Button size="sm" onClick={() => onUpdate({ status: "read" })}>
              رجّعها من الأرشيف
            </Button>
          )}
          {isFull(me) && (
            <Button size="sm" variant="danger" icon="trash" onClick={onDelete}>
              مسح
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/* ─── Waitlist ─────────────────────────────────────────────────────────── */

type Waiting = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  locale: "ar" | "en";
  notified_at: string | null;
  created_at: string;
};

export async function waitlistCount(): Promise<number> {
  const r = await sb().from("waitlist").select("id", { count: "exact", head: true }).is("notified_at", null);
  return r.count ?? 0;
}

/** Applications screen → who asked to be told when applications open. */
export function WaitlistCard() {
  const { data, set } = useAsync(
    async () =>
      (await sb()
        .from("waitlist")
        .select("*")
        .is("notified_at", null)
        .order("created_at")
        .limit(2000)
        .then(must)) as Waiting[],
    [],
  );
  const [open, setOpen] = useState(false);
  if (!data?.length) return null;
  return (
    <>
      <Card className="mb-4 flex items-center gap-3 border-cyan/30 bg-cyan/[0.06]">
        <Icon name="bell" size={22} className="shrink-0 text-cyan" />
        <p className="flex-1 text-sm text-mist">
          {data.length === 1 ? "شخص واحد مستني التقديم يفتح." : `${data.length} شخص مستنيين التقديم يفتح.`}
        </p>
        <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
          القايمة
        </Button>
      </Card>
      {open && (
        <WaitlistSheet
          list={data}
          onClose={() => setOpen(false)}
          onDone={(ids) => set(data.filter((w) => !ids.includes(w.id)))}
        />
      )}
    </>
  );
}

function WaitlistSheet({
  list,
  onClose,
  onDone,
}: {
  list: Waiting[];
  onClose: () => void;
  onDone: (ids: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState(
    "أهلاً! التقديم في BuildX HUE فتح دلوقتي 🎉 قدّم من هنا: https://buildxhue.com/ar/join/",
  );
  const markAll = async () => {
    if (
      !(await confirmDialog({
        title: "علّم الكل إنهم اتبلّغوا؟",
        body: "هيختفوا من القايمة، ويقدروا يسجلوا تاني للمرة الجاية.",
        ok: "تمام",
      }))
    )
      return;
    setBusy(true);
    try {
      const ids = list.map((w) => w.id);
      await sb().from("waitlist").update({ notified_at: new Date().toISOString() }).in("id", ids).then(must);
      onDone(ids);
      toast("اتعلّموا إنهم اتبلّغوا");
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const emails = list
    .map((w) => w.email)
    .filter(Boolean)
    .join(", ");
  return (
    <Sheet open onClose={onClose} title={`مستنيين التقديم (${list.length})`}>
      <div className="grid gap-4">
        <Field label="الرسالة" hint="بتتبعت لكل واحد على واتساب بدوسة.">
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {emails && (
            <Button size="sm" icon="copy" onClick={() => copyText(emails, "اتنسخت الإيميلات")}>
              انسخ كل الإيميلات
            </Button>
          )}
          <Button
            size="sm"
            icon="download"
            onClick={() =>
              downloadCsv(`buildx-waitlist-${today()}.csv`, [
                ["الاسم", "الموبايل", "الإيميل", "اللغة", "سجّل"],
                ...list.map((w) => [w.name, w.phone, w.email, w.locale, fmt.dateTime(w.created_at)]),
              ])
            }
          >
            Excel
          </Button>
          <Button size="sm" variant="primary" loading={busy} onClick={markAll}>
            علّم الكل اتبلّغوا
          </Button>
        </div>
        <List>
          {list.map((w) => {
            const wa = whatsappLink(w.phone, text);
            return (
              <div key={w.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-chalk">{w.name || "—"}</p>
                  <p className="truncate text-xs text-fog" dir="ltr">
                    {[w.phone, w.email].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {wa && (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-[#1fa855] px-3 py-1.5 text-sm font-semibold text-white"
                  >
                    واتساب
                  </a>
                )}
              </div>
            );
          })}
        </List>
      </div>
    </Sheet>
  );
}

/* ─── Settings: the sponsorship deck ───────────────────────────────────── */

/** Site settings → the PDF link the sponsorship form offers. */
export function SponsorDeckCard() {
  const { data, set } = useAsync(async () => {
    const r = (await sb()
      .from("site_settings")
      .select("value")
      .eq("key", "sponsorship")
      .maybeSingle()
      .then(must)) as { value: { deck_url?: string } } | null;
    return { deck_url: r?.value?.deck_url ?? "" };
  }, []);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const save = async () => {
    const url = data.deck_url.trim();
    if (url && !/^https:\/\/\S+$/.test(url)) return toast("الرابط لازم يبدأ بـ https://", "error");
    setBusy(true);
    try {
      await sb()
        .from("site_settings")
        .upsert({ key: "sponsorship", value: { deck_url: url } })
        .then(must);
      toast("اتحفظ");
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="grid gap-3">
      <p className="font-semibold text-chalk">ملف الرعاية (PDF)</p>
      <Field
        label="رابط الملف"
        hint="ارفعه على Google Drive أو أي مكان، وحط الرابط هنا. بيظهر زرار «حمّل ملف الرعاية» جنب فورم الرعاية."
      >
        <Input
          dir="ltr"
          placeholder="https://"
          value={data.deck_url}
          onChange={(e) => set({ deck_url: e.target.value })}
        />
      </Field>
      <Button size="sm" loading={busy} onClick={save}>
        حفظ
      </Button>
    </Card>
  );
}
