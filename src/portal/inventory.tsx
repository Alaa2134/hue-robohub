"use client";
/**
 * The team's store: parts and tools, how many are on the shelf, where they're kept and who has what.
 * Store keepers (the "inventory" area) add items, lend them to a team member or a student with a
 * return date, take them back, and hand out consumables. Everyone else sees the catalog, asks to
 * borrow, and sees what they have. Reminders go out from the database (20261011090500_inventory_functions.sql).
 */
import { useMemo, useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import { errorText, fmt, fromLocalInput, rpc, toLocalInput } from "./core";
import { Badge, Button, Card, Chip, Empty, ErrorBox, Field, Icon, Input, List, Loading, Row, Select, Sheet, Stat, Textarea, Toggle, TopBar, confirmDialog, toast, useAsync } from "./ui";
import { dueText } from "./staff-sectors";
import { useStudentLoans } from "./baqloz";

export type Item = {
  id: string;
  name: string;
  category: string;
  description: string;
  location: string;
  quantity: number;
  min_quantity: number;
  unit: string;
  consumable: boolean;
  archived: boolean;
  low_notified_at: string | null;
  available: number;
  out: number;
};
export type Loan = {
  id: string;
  item_id: string;
  item_name: string;
  unit: string;
  quantity: number;
  staff_id: string | null;
  student_id: string | null;
  student_code: string | null;
  borrower_name: string;
  purpose: string;
  due_at: string | null;
  status: "out" | "returned" | "lost" | "consumed";
  lent_by_name: string | null;
  lent_at: string;
  returned_at: string | null;
  return_note: string | null;
};
type StoreRequest = {
  id: string;
  item_id: string;
  item_name: string;
  staff_id: string;
  name: string;
  quantity: number;
  purpose: string;
  needed_until: string | null;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  available: number;
  created_at: string;
};
type Store = {
  keeps: boolean;
  items: Item[];
  loans: Loan[];
  requests: StoreRequest[];
  staff: { id: string; name: string; title: string | null }[] | null;
  students: { id: string; name: string; code: string; group: string }[] | null;
};
type Tab = "items" | "out" | "requests" | "mine" | "low";

const MESSAGES: Record<string, string> = {
  not_enough: "الكمية دي مش موجودة على الرف.",
  bad_due: "حدد ميعاد ترجيع بعد دلوقتي.",
  no_borrower: "اختار مين هياخدها.",
  pending: "عندك طلب للحاجة دي لسه مستني رد.",
  "not allowed": "ليست لديك صلاحية لهذا الإجراء.",
};
const why = (e: unknown) => MESSAGES[(e as { message?: string })?.message ?? ""] ?? errorText(e);
const isLow = (i: Item) => i.min_quantity > 0 && i.available <= i.min_quantity;
const late = (l: Pick<Loan, "status" | "due_at">) => l.status === "out" && !!l.due_at && new Date(l.due_at).getTime() < Date.now();
const LOAN_STATUS: Record<Loan["status"], string> = { out: "معاه", returned: "رجعت", lost: "ضاعت", consumed: "اتصرفت" };

export const loadStore = () => rpc<Store>("staff_inventory");

/** /staff/inventory — the store. */
export function InventoryScreen({ me, query }: { me: string; query?: URLSearchParams }) {
  const { data, error, loading, reload } = useAsync(loadStore, []);
  const first = (query?.get("tab") as Tab | null) ?? "items";
  const [tab, setTab] = useState<Tab>(first);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [open, setOpen] = useState<Item | null>(null);
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [lending, setLending] = useState<Item | null>(null);
  const [asking, setAsking] = useState<Item | null>(null);
  const [deciding, setDeciding] = useState<StoreRequest | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);
  const cats = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))], [items]);
  const mine = data?.loans.filter((l) => l.staff_id === me) ?? [];
  const out = data?.keeps ? data.loans.filter((l) => l.status === "out") : [];
  const pending = data?.keeps ? data.requests.filter((r) => r.status === "pending") : [];
  const low = items.filter((i) => !i.archived && isLow(i));
  const myRequests = data?.requests.filter((r) => r.staff_id === me) ?? [];
  const shown = items.filter(
    (i) =>
      (tab !== "low" || (!i.archived && isLow(i))) &&
      (!cat || i.category === cat) &&
      (!q.trim() || `${i.name} ${i.category} ${i.location} ${i.description}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const done = () => {
    setOpen(null);
    setLending(null);
    setAsking(null);
    setDeciding(null);
    setEditing(null);
    reload();
  };

  const giveBack = async (l: Loan, status: "returned" | "lost") => {
    const ok = await confirmDialog(
      status === "returned"
        ? { title: `رجعت ${l.item_name}؟`, body: `${l.borrower_name} · ${l.quantity} ${l.unit}`, ok: "رجعت ✓" }
        : { title: `${l.item_name} ضاعت؟`, body: "الكمية هتنقص من المخزن.", ok: "سجّل إنها ضاعت", danger: true },
    );
    if (!ok) return;
    try {
      await rpc("staff_inventory_return", { p_loan: l.id, p_status: status, p_note: null });
      toast(status === "returned" ? "اتسجّل الترجيع" : "اتسجّلت إنها ضاعت");
      reload();
    } catch (e) {
      toast(why(e), "error");
    }
  };

  return (
    <>
      <TopBar
        title="المخزن"
        sub={data?.keeps ? "القطع والأدوات، مين معاه إيه، والطلبات" : "القطع والأدوات اللي عندنا، واطلب اللي محتاجه"}
        back="/staff/more"
        actions={
          data?.keeps && (
            <Button size="sm" variant="primary" icon="plus" onClick={() => setEditing("new")}>
              قطعة
            </Button>
          )
        }
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : (
        <>
          {data?.keeps && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="صنف" value={items.filter((i) => !i.archived).length} icon="box" />
              <Stat label="برا المخزن" value={out.length} icon="clock" />
              <Stat label="متأخر" value={out.filter(late).length} icon="alert" tone={out.some(late) ? "danger" : undefined} />
              <Stat label="قرّب يخلص" value={low.length} icon="alert" tone={low.length ? "warn" : undefined} />
            </div>
          )}
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            <Chip active={tab === "items"} onClick={() => setTab("items")}>
              الكتالوج
            </Chip>
            {data?.keeps && (
              <Chip active={tab === "out"} onClick={() => setTab("out")} count={out.length}>
                برا المخزن
              </Chip>
            )}
            {data?.keeps && (
              <Chip active={tab === "requests"} onClick={() => setTab("requests")} count={pending.length}>
                الطلبات
              </Chip>
            )}
            {data?.keeps && (
              <Chip active={tab === "low"} onClick={() => setTab("low")} count={low.length}>
                قرّب يخلص
              </Chip>
            )}
            <Chip active={tab === "mine"} onClick={() => setTab("mine")} count={mine.filter((l) => l.status === "out").length}>
              حاجاتي
            </Chip>
          </div>

          {tab === "items" || tab === "low" ? (
            <>
              {items.length > 6 && <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر: أردوينو، سيرفو، كاوية…" className="mb-3" aria-label="دوّر في المخزن" />}
              {cats.length > 1 && tab === "items" && (
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                  <Chip active={!cat} onClick={() => setCat("")}>
                    الكل
                  </Chip>
                  {cats.map((c) => (
                    <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
                      {c}
                    </Chip>
                  ))}
                </div>
              )}
              {!items.length ? (
                <Empty
                  icon="box"
                  title="المخزن فاضي لسه"
                  body={data?.keeps ? "ضيف القطع والأدوات اللي عند الفريق (الأردوينو، الحساسات، الموتورات، الكاوية…) وعددها ومكانها." : "أمين المخزن لسه ماضافش القطع."}
                  action={
                    data?.keeps && (
                      <Button variant="primary" icon="plus" onClick={() => setEditing("new")}>
                        أول قطعة
                      </Button>
                    )
                  }
                />
              ) : !shown.length ? (
                <Empty icon="box" title={tab === "low" ? "مفيش حاجة قرّبت تخلص 👌" : "مفيش حاجة بالاسم ده"} />
              ) : (
                <List>
                  {shown.map((i) => (
                    <Row key={i.id} onClick={() => setOpen(i)}>
                      <div className="flex items-center gap-3">
                        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", i.available ? "bg-cyan/10 text-cyan" : "bg-white/[0.04] text-fog")}>
                          <Icon name="box" size={22} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-chalk">
                            {i.name} {i.archived && <span className="text-xs font-normal text-fog">(مؤرشف)</span>}
                          </p>
                          <p className="truncate text-xs text-fog">{[i.category, i.location && `📍 ${i.location}`, i.consumable && "بيتصرف"].filter(Boolean).join(" · ") || "—"}</p>
                        </div>
                        <div className="shrink-0 text-end">
                          <p className={cn("font-mono text-lg", i.available ? "text-chalk" : "text-[#ff9aa5]")}>{i.available}</p>
                          <p className="text-[11px] text-fog">{i.consumable ? i.unit : `من ${i.quantity}`}</p>
                        </div>
                        {isLow(i) && <Badge tone="warn">قرّب يخلص</Badge>}
                      </div>
                    </Row>
                  ))}
                </List>
              )}
            </>
          ) : tab === "out" ? (
            !out.length ? (
              <Empty icon="check" title="كل الحاجات في المخزن 👌" />
            ) : (
              <LoanList loans={out} onReturn={giveBack} />
            )
          ) : tab === "requests" ? (
            !pending.length ? (
              <Empty icon="check" title="مفيش طلبات مستنية" />
            ) : (
              <List>
                {pending.map((r) => (
                  <Row key={r.id}>
                    <div className="grid gap-2">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-chalk">
                            {r.item_name} × {r.quantity}
                          </p>
                          <p className="text-xs text-fog">
                            {r.name} · {fmt.dateTime(r.created_at)}
                            {r.needed_until && ` · لحد ${fmt.short(r.needed_until)}`}
                          </p>
                          <p className="mt-1 text-sm text-mist">{r.purpose}</p>
                        </div>
                        <Badge tone={r.available >= r.quantity ? "ok" : "danger"}>متاح {r.available}</Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="primary" icon="check" disabled={r.available < r.quantity} onClick={() => setDeciding(r)}>
                          وافق
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={async () => {
                            if (!(await confirmDialog({ title: "ترفض الطلب؟", body: `${r.name} · ${r.item_name}`, ok: "ارفض", danger: true }))) return;
                            try {
                              await rpc("staff_inventory_request_decide", { p_id: r.id, p_approve: false, p_note: null, p_due: null });
                              toast("اترفض ووصله إشعار");
                              reload();
                            } catch (e) {
                              toast(why(e), "error");
                            }
                          }}
                        >
                          ارفض
                        </Button>
                      </div>
                    </div>
                  </Row>
                ))}
              </List>
            )
          ) : (
            <>
              {!mine.length && !myRequests.length ? (
                <Empty icon="box" title="مفيش حاجة معاك من المخزن" body="لو محتاج قطعة أو أداة لشغلك، افتحها من الكتالوج واطلب استعارتها." action={<Button onClick={() => setTab("items")}>الكتالوج</Button>} />
              ) : (
                <>
                  {!!mine.length && <LoanList loans={mine} />}
                  {!!myRequests.length && (
                    <>
                      <p className="mb-2 mt-5 text-sm font-semibold text-chalk">طلباتي</p>
                      <List>
                        {myRequests.map((r) => (
                          <Row key={r.id}>
                            <div className="flex items-center gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold text-chalk">
                                  {r.item_name} × {r.quantity}
                                </p>
                                <p className="truncate text-xs text-fog">{r.note || r.purpose}</p>
                              </div>
                              <Badge tone={r.status === "pending" ? "info" : r.status === "approved" ? "ok" : "danger"}>
                                {r.status === "pending" ? "مستني" : r.status === "approved" ? "اتوافق" : "اترفض"}
                              </Badge>
                            </div>
                          </Row>
                        ))}
                      </List>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {open && data && (
        <Sheet open onClose={() => setOpen(null)} title={open.name}>
          <div className="grid gap-3">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="على الرف" value={open.available} tone={open.available ? undefined : "danger"} />
              <Stat label={open.consumable ? "الوحدة" : "الإجمالي"} value={open.consumable ? open.unit : open.quantity} />
              <Stat label="برا" value={open.out} />
            </div>
            {open.description && <p className="whitespace-pre-line text-sm text-mist">{open.description}</p>}
            <p className="text-sm text-fog">
              {[open.category, open.location && `📍 ${open.location}`, open.consumable ? "بيتصرف (مش بيرجع)" : "بيتسلّف ويرجع"].filter(Boolean).join(" · ")}
            </p>
            {data.keeps && (
              <div className="grid gap-1.5">
                {data.loans
                  .filter((l) => l.item_id === open.id && l.status === "out")
                  .map((l) => (
                    <p key={l.id} className="flex justify-between gap-2 text-sm text-mist">
                      <span className="truncate">
                        {l.borrower_name} × {l.quantity}
                      </span>
                      {l.due_at && <span className={late(l) ? "text-[#ff9aa5]" : "text-fog"}>{dueText(l.due_at)}</span>}
                    </p>
                  ))}
              </div>
            )}
            {data.keeps ? (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="primary" icon="upload" disabled={!open.available || open.archived} onClick={() => (setLending(open), setOpen(null))}>
                  {open.consumable ? "اصرف" : "سلّف"}
                </Button>
                <Button icon="edit" onClick={() => (setEditing(open), setOpen(null))}>
                  تعديل
                </Button>
              </div>
            ) : (
              <Button variant="primary" icon="plus" disabled={!open.available} onClick={() => (setAsking(open), setOpen(null))}>
                {open.available ? "اطلب استعارة" : "مش متاح دلوقتي"}
              </Button>
            )}
          </div>
        </Sheet>
      )}
      {editing && <ItemSheet item={editing === "new" ? null : editing} cats={cats} onClose={() => setEditing(null)} onDone={done} />}
      {lending && data && <LendSheet item={lending} store={data} onClose={() => setLending(null)} onDone={done} />}
      {asking && <AskSheet item={asking} onClose={() => setAsking(null)} onDone={done} />}
      {deciding && <ApproveSheet request={deciding} onClose={() => setDeciding(null)} onDone={done} />}
    </>
  );
}

function LoanList({ loans, onReturn }: { loans: Loan[]; onReturn?: (l: Loan, s: "returned" | "lost") => void }) {
  return (
    <List>
      {loans.map((l) => (
        <Row key={l.id}>
          <div className="grid gap-2">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-chalk">
                  {l.item_name} × {l.quantity}
                </p>
                <p className="truncate text-xs text-fog">
                  {onReturn ? `${l.borrower_name}${l.student_code ? ` (${l.student_code})` : ""} · ` : ""}
                  {fmt.short(l.lent_at)}
                  {l.purpose && ` · ${l.purpose}`}
                </p>
              </div>
              {l.status === "out" && l.due_at ? (
                <Badge tone={late(l) ? "danger" : new Date(l.due_at).getTime() - Date.now() < 86_400_000 ? "warn" : "muted"}>{dueText(l.due_at)}</Badge>
              ) : (
                <Badge tone={l.status === "lost" ? "danger" : "muted"}>{LOAN_STATUS[l.status]}</Badge>
              )}
            </div>
            {onReturn && l.status === "out" && (
              <div className="flex gap-2">
                <Button size="sm" variant="primary" icon="check" onClick={() => onReturn(l, "returned")}>
                  رجعت
                </Button>
                <Button size="sm" onClick={() => onReturn(l, "lost")}>
                  ضاعت
                </Button>
              </div>
            )}
          </div>
        </Row>
      ))}
    </List>
  );
}

function ItemSheet({ item, cats, onClose, onDone }: { item: Item | null; cats: string[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({
    name: item?.name ?? "",
    category: item?.category ?? "",
    description: item?.description ?? "",
    location: item?.location ?? "",
    quantity: String(item?.quantity ?? 1),
    min_quantity: String(item?.min_quantity ?? 0),
    unit: item?.unit ?? "قطعة",
    consumable: item?.consumable ?? false,
    archived: item?.archived ?? false,
  });
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (f.name.trim().length < 2) return toast("اكتب اسم القطعة", "error");
    const quantity = Number(f.quantity);
    const min = Number(f.min_quantity);
    if (!Number.isInteger(quantity) || quantity < 0 || !Number.isInteger(min) || min < 0) return toast("العدد لازم يكون رقم صحيح", "error");
    setBusy(true);
    try {
      await rpc("staff_inventory_item_save", { p_id: item?.id ?? null, p: { ...f, quantity, min_quantity: min } });
      toast("اتحفظ");
      onDone();
    } catch (e2) {
      toast(why(e2), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={item ? `تعديل ${item.name}` : "قطعة جديدة"}>
      <form onSubmit={save} className="grid gap-3">
        <Field label="الاسم">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} placeholder="مثلاً: Arduino Uno" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="النوع">
            <Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} maxLength={40} list="store-cats" placeholder="بوردات، حساسات…" />
            <datalist id="store-cats">
              {cats.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="مكانها">
            <Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} maxLength={80} placeholder="الدولاب 2، الرف الأول" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="العدد كله">
            <Input type="number" inputMode="numeric" min={0} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
          </Field>
          <Field label="نبّهني تحت">
            <Input type="number" inputMode="numeric" min={0} value={f.min_quantity} onChange={(e) => setF({ ...f, min_quantity: e.target.value })} aria-label="الحد الأدنى" />
          </Field>
          <Field label="الوحدة">
            <Input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} maxLength={20} />
          </Field>
        </div>
        <Field label="وصف (اختياري)">
          <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} className="min-h-16" placeholder="الموديل، ملاحظات الاستخدام…" />
        </Field>
        <Toggle checked={f.consumable} onChange={(v) => setF({ ...f, consumable: v })} label="بيتصرف ومش بيرجع" hint="زي المقاومات والأسلاك: الصرف بينقص العدد على طول." />
        {item && <Toggle checked={f.archived} onChange={(v) => setF({ ...f, archived: v })} label="أرشفة" hint="بتختفي من الكتالوج، وسجلها بيفضل." />}
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          حفظ
        </Button>
      </form>
    </Sheet>
  );
}

function LendSheet({ item, store, onClose, onDone }: { item: Item; store: Store; onClose: () => void; onDone: () => void }) {
  const [who, setWho] = useState<"staff" | "student" | "other">("staff");
  const [pick, setPick] = useState("");
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [qty, setQty] = useState("1");
  const [due, setDue] = useState(toLocalInput(new Date(Date.now() + 7 * 86_400_000)));
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const students = (store.students ?? []).filter((s) => !q.trim() || `${s.name} ${s.code} ${s.group}`.includes(q.trim())).slice(0, 50);
  const lend = async () => {
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1) return toast("اكتب الكمية", "error");
    if (n > item.available) return toast(MESSAGES.not_enough, "error");
    if (who !== "other" && !pick) return toast(MESSAGES.no_borrower, "error");
    if (who === "other" && name.trim().length < 2) return toast("اكتب اسم اللي هياخدها", "error");
    setBusy(true);
    try {
      await rpc("staff_inventory_lend", {
        p_item: item.id,
        p_qty: n,
        p_staff: who === "staff" ? pick : null,
        p_student: who === "student" ? pick : null,
        p_name: who === "other" ? name.trim() : null,
        p_purpose: purpose.trim(),
        p_due: item.consumable ? null : fromLocalInput(due),
      });
      toast(item.consumable ? "اتصرفت" : "اتسجّلت السلفة");
      onDone();
    } catch (e) {
      toast(why(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={`${item.consumable ? "صرف" : "سلفة"}: ${item.name}`}>
      <div className="grid gap-3">
        <div className="flex gap-2">
          {(["staff", "student", "other"] as const).map((w) => (
            <Chip key={w} active={who === w} onClick={() => (setWho(w), setPick(""))}>
              {w === "staff" ? "حد من الفريق" : w === "student" ? "طالب" : "حد تاني"}
            </Chip>
          ))}
        </div>
        {who === "staff" ? (
          <Field label="مين؟">
            <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="عضو الفريق">
              <option value="">اختار…</option>
              {(store.staff ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.title ? ` · ${s.title}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        ) : who === "student" ? (
          <Field label="الطالب">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر بالاسم أو الكود" className="mb-2" aria-label="دوّر على طالب" />
            <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="الطالب">
              <option value="">اختار…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.code}
                  {s.group ? ` · ${s.group}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="الاسم">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="مثلاً: د. أحمد (معمل الكلية)" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={`الكمية (متاح ${item.available})`}>
            <Input type="number" inputMode="numeric" min={1} max={item.available} value={qty} onChange={(e) => setQty(e.target.value)} aria-label="الكمية" />
          </Field>
          {!item.consumable && (
            <Field label="ترجع لحد">
              <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="ميعاد الترجيع" />
            </Field>
          )}
        </div>
        <Field label="عشان إيه؟ (اختياري)">
          <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={300} placeholder="مشروع روبوت الخط، سيشن السبت…" />
        </Field>
        {!item.consumable && <p className="text-xs text-fog">بيوصله تذكير قبل الميعاد بيوم، ولو اتأخر بيوصله هو وانت.</p>}
        <Button variant="primary" size="lg" block loading={busy} onClick={lend}>
          {item.consumable ? "اصرف" : "سجّل السلفة"}
        </Button>
      </div>
    </Sheet>
  );
}

function AskSheet({ item, onClose, onDone }: { item: Item; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState("1");
  const [purpose, setPurpose] = useState("");
  const [until, setUntil] = useState(item.consumable ? "" : toLocalInput(new Date(Date.now() + 7 * 86_400_000)));
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1) return toast("اكتب الكمية", "error");
    if (purpose.trim().length < 2) return toast("اكتب محتاجها في إيه", "error");
    setBusy(true);
    try {
      await rpc("staff_inventory_request", { p_item: item.id, p_qty: n, p_purpose: purpose.trim(), p_until: fromLocalInput(until) });
      toast("وصل طلبك لأمين المخزن");
      onDone();
    } catch (e) {
      toast(why(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={`اطلب: ${item.name}`}>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={`الكمية (متاح ${item.available})`}>
            <Input type="number" inputMode="numeric" min={1} max={item.available} value={qty} onChange={(e) => setQty(e.target.value)} aria-label="الكمية" />
          </Field>
          {!item.consumable && (
            <Field label="محتاجها لحد">
              <Input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} aria-label="محتاجها لحد" />
            </Field>
          )}
        </div>
        <Field label="محتاجها في إيه؟">
          <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={300} className="min-h-16" placeholder="مشروع، سيشن، تجربة…" />
        </Field>
        <Button variant="primary" size="lg" block loading={busy} onClick={send}>
          ابعت الطلب
        </Button>
      </div>
    </Sheet>
  );
}

function ApproveSheet({ request: r, onClose, onDone }: { request: StoreRequest; onClose: () => void; onDone: () => void }) {
  const [due, setDue] = useState(toLocalInput(r.needed_until && new Date(r.needed_until).getTime() > Date.now() ? r.needed_until : new Date(Date.now() + 7 * 86_400_000)));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const approve = async () => {
    setBusy(true);
    try {
      await rpc("staff_inventory_request_decide", { p_id: r.id, p_approve: true, p_note: note.trim() || null, p_due: fromLocalInput(due) });
      toast(`اتسجّلت السلفة لـ ${r.name}`);
      onDone();
    } catch (e) {
      toast(why(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={`موافقة: ${r.item_name} × ${r.quantity}`}>
      <div className="grid gap-3">
        <Card className="text-sm text-mist">
          {r.name}: {r.purpose}
        </Card>
        <Field label="ترجع لحد" hint="لو الحاجة بتتصرف، الميعاد مش بيفرق.">
          <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="ميعاد الترجيع" />
        </Field>
        <Field label="ملاحظة (اختياري)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="استلمها من الدولاب 2" />
        </Field>
        <Button variant="primary" size="lg" block loading={busy} onClick={approve}>
          وافق وسلّم
        </Button>
      </div>
    </Sheet>
  );
}

/** The student app: what this student borrowed from the store. */
export function StudentLoansCard() {
  const { data } = useStudentLoans();
  const out = (data ?? []).filter((l) => l.status === "out");
  if (!out.length) return null;
  return (
    <Card className="mt-4 grid gap-2" data-testid="student-loans">
      <p className="flex items-center gap-2 font-semibold text-chalk">
        <Icon name="box" size={18} className="text-cyan" /> معاك من المخزن
      </p>
      {out.map((l) => (
        <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate text-mist">
            {l.item} × {l.quantity}
          </span>
          {l.dueAt && <Badge tone={late({ status: l.status, due_at: l.dueAt }) ? "danger" : "muted"}>{dueText(l.dueAt)}</Badge>}
        </div>
      ))}
    </Card>
  );
}
