"use client";
/**
 * BuildX 3D AI in the app (the "ai3d" area): top-ups waiting for a look at the receipt (approve →
 * credits added, then a WhatsApp to tell them), every model made, the wallets (gift or take back
 * credits, block), a test model from the team, which models show in the site's gallery, and the
 * settings: on/off, prices, how to pay, and the Meshy key (owner only, kept in Vault, never shown).
 */
import { useState } from "react";
import { SUPABASE_URL } from "@/lib/supabase-public";
import { can, errorText, fmt, isFull, rpc, sb, type StaffRow } from "./core";
import { Badge, Button, Card, Chip, Empty, Field, Input, Loading, Section, Select, Sheet, Stat, Textarea, Toggle, TopBar, toast, useAsync } from "./ui";
import { sendOnWhatsApp } from "./wa-handoff";

type Pkg = { credits: number; price: number };
type Settings = {
  enabled: boolean;
  key_set: boolean;
  ai_model: string | null;
  cost_text: number;
  cost_image: number;
  textured: boolean;
  packages: Pkg[];
  pay_ar: string | null;
  pay_en: string | null;
  free_credits: number;
};
type Topup = {
  id: string;
  wallet: string;
  code: string;
  name: string;
  phone: string;
  credits: number;
  amount: number;
  method: string;
  sender: string | null;
  receipt: string | null;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  created_at: string;
};
type Job = {
  id: string;
  kind: "text" | "image";
  prompt: string | null;
  style: string;
  status: string;
  progress: number;
  glb: string | null;
  thumb: string | null;
  error: string | null;
  credits: number;
  refunded: boolean;
  public: boolean;
  featured: boolean;
  created_at: string;
  wallet: string | null;
  name: string | null;
};
type Wallet = { id: string; code: string; name: string; phone: string; credits: number; blocked: boolean; created_at: string; seen_at: string; models: number };
type Overview = {
  settings: Settings;
  stats: { wallets: number; done: number; failed: number; active: number; income: number; pending: number };
  topups: Topup[];
  jobs: Job[];
  wallets: Wallet[];
};

const METHOD: Record<string, string> = { vodafone_cash: "فودافون كاش", instapay: "إنستاباي", other: "تاني" };
const STATUS: Record<string, string> = { queued: "في الطابور", shaping: "بيبني الشكل", texturing: "بيلوّن", saving: "بيحفظ", done: "جاهز", failed: "فشل" };
const STYLE: Record<string, string> = { realistic: "واقعي", cartoon: "كرتون", lowpoly: "Low-poly", sculpture: "تمثال" };
const model = (p: string | null) => (p ? `${SUPABASE_URL}/storage/v1/object/public/ai3d-models/${p}` : null);
const egp = (n: number) => `${Number(n).toLocaleString("en-US")} ج`;

function Receipt({ path }: { path: string }) {
  const url = useAsync(async () => (await sb().storage.from("ai3d").createSignedUrl(path, 600)).data?.signedUrl ?? null, [path]);
  if (!url.data) return <div className="h-40 animate-pulse rounded-xl bg-white/5" />;
  return (
    <a href={url.data} target="_blank" rel="noreferrer">
      { }
      <img src={url.data} alt="إيصال" className="max-h-72 w-full rounded-xl object-contain" data-testid="ai3d-receipt-img" />
    </a>
  );
}

function TopupsTab({ data, me, reload }: { data: Overview; me: StaffRow; reload: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const pending = data.topups.filter((t) => t.status === "pending");
  const done = data.topups.filter((t) => t.status !== "pending");
  const review = async (t: Topup, approve: boolean) => {
    setBusy(t.id);
    try {
      const r = await rpc<{ ok: boolean; error?: string; credits?: number }>("staff_ai3d_topup_review", { p_id: t.id, p_approve: approve, p_note: null });
      if (!r.ok) throw new Error(r.error);
      toast(approve ? `اتضاف ${t.credits} كريدت لـ ${t.name}` : "اترفض", "ok");
      if (can(me, "whatsapp"))
        sendOnWhatsApp([{ phone: t.phone, name: t.name }], {
          label: `شحن 3D AI — ${t.name}`,
          context: `ai3d:topup:${t.id}`,
          text: approve
            ? `أهلًا ${t.name.split(" ")[0]} 👋 اتضاف ${t.credits} كريدت لمحفظتك في BuildX 3D AI، ورصيدك دلوقتي ${r.credits}. ابدأ من هنا: https://buildxhue.com/ar/3dai/studio/`
            : `أهلًا ${t.name.split(" ")[0]}، للأسف مقدرناش نأكد التحويل بتاع شحن BuildX 3D AI. ابعتلنا صورة إيصال أوضح أو كلمنا على الرقم ده.`,
        });
      else reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      {pending.length === 0 && <Empty icon="check" title="مفيش شحن مستني" body="أول ما حد يرفع إيصال تحويل هيظهر هنا ويوصلك إشعار." />}
      <div className="grid gap-3 lg:grid-cols-2">
        {pending.map((t) => (
          <Card key={t.id} className="grid gap-3 p-4" data-testid="ai3d-pending">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-chalk">{t.name}</p>
                <p className="text-xs text-fog" dir="ltr">
                  {t.code} · {t.phone}
                </p>
              </div>
              <Badge tone="warn">
                {t.credits} كريدت · {egp(t.amount)}
              </Badge>
            </div>
            <p className="text-sm text-mist">
              {METHOD[t.method] ?? t.method} من <span dir="auto">{t.sender}</span> · {fmt.dateTime(t.created_at)}
            </p>
            {t.receipt && <Receipt path={t.receipt} />}
            <div className="flex gap-2">
              <Button variant="primary" icon="check" loading={busy === t.id} onClick={() => void review(t, true)} data-testid="ai3d-approve">
                اتأكدت — ضيف الكريدت
              </Button>
              <Button variant="ghost" disabled={busy === t.id} onClick={() => void review(t, false)}>
                ارفض
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {done.length > 0 && (
        <Section title="اللي اتراجع">
          <Card className="divide-y divide-[var(--line)]">
            {done.slice(0, 60).map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="text-chalk">{t.name}</span>
                <span className="text-fog">
                  {t.credits} كريدت · {egp(t.amount)}
                </span>
                <Badge tone={t.status === "approved" ? "ok" : "danger"}>{t.status === "approved" ? "اتضاف" : "اترفض"}</Badge>
              </div>
            ))}
          </Card>
        </Section>
      )}
    </>
  );
}

function JobsTab({ data, me, reload }: { data: Overview; me: StaffRow; reload: () => void }) {
  const [kind, setKind] = useState<"text" | "image">("text");
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("realistic");
  const [busy, setBusy] = useState(false);
  const running = data.jobs.some((j) => j.status !== "done" && j.status !== "failed");
  const test = async () => {
    setBusy(true);
    try {
      await rpc("staff_ai3d_test", { p_kind: "text", p_prompt: prompt, p_style: style, p_image: null });
      setPrompt("");
      toast("بدأ — هيخلص في دقايق", "ok");
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const feature = async (j: Job, on: boolean) => {
    try {
      const ok = await rpc<boolean>("staff_ai3d_feature", { p_job: j.id, p_featured: on });
      if (!ok) throw new Error("العميل ما وافقش يعرضه، أو لسه مخلصش");
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  return (
    <>
      {can(me, "ai3d") && data.settings.key_set && (
        <Card className="mb-4 grid gap-3 p-4">
          <p className="text-sm text-mist">موديل من الفريق (تجربة أو للمعرض) — من غير كريدت، 20 في اليوم بالكتير، وبيتحسب على حساب Meshy.</p>
          <div className="flex flex-wrap gap-2">
            <Chip active={kind === "text"} onClick={() => setKind("text")}>
              من كلام
            </Chip>
          </div>
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={500} placeholder="a cute robot toy with big glowing eyes" dir="auto" />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={style} onChange={(e) => setStyle(e.target.value)}>
              {Object.entries(STYLE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Button variant="primary" icon="plus" loading={busy} disabled={prompt.trim().length < 3} onClick={() => void test()}>
              اعمل موديل
            </Button>
            {running && (
              <Button variant="ghost" onClick={() => void rpc("staff_ai3d_poke").then(reload, () => {})}>
                حدّث التقدّم
              </Button>
            )}
          </div>
        </Card>
      )}
      {data.jobs.length === 0 ? (
        <Empty icon="layers" title="لسه مفيش موديلات" />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {data.jobs.map((j) => (
            <Card key={j.id} className="overflow-hidden" data-testid="ai3d-staff-job">
              <div className="aspect-square bg-void">
                {j.thumb ? (
                   
                  <img src={model(j.thumb)!} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-xs text-fog">{j.status === "done" ? "—" : `${j.progress}%`}</div>
                )}
              </div>
              <div className="grid gap-1.5 p-3 text-xs">
                <p className="line-clamp-2 text-sm text-chalk" dir="auto">
                  {j.prompt || (j.kind === "image" ? "من صورة" : "")}
                </p>
                <p className="text-fog">
                  {j.name ?? "—"} · {fmt.dateTime(j.created_at)}
                </p>
                <div className="flex flex-wrap items-center gap-1">
                  <Badge tone={j.status === "done" ? "ok" : j.status === "failed" ? "danger" : "info"}>{STATUS[j.status] ?? j.status}</Badge>
                  {j.refunded && <Badge>رجع الكريدت</Badge>}
                  {j.public && <Badge tone="info">موافق يتعرض</Badge>}
                </div>
                {j.error && <p className="text-danger">{j.error}</p>}
                {j.status === "done" && j.glb && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    <a href={model(j.glb)!} target="_blank" rel="noreferrer" className="text-cyan underline-offset-2 hover:underline">
                      GLB
                    </a>
                    {(j.public || !j.wallet) && can(me, "ai3d") && (
                      <Toggle checked={j.featured} onChange={(v) => void feature(j, v)} label="في معرض الموقع" />
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function WalletsTab({ data, me, reload }: { data: Overview; me: StaffRow; reload: () => void }) {
  const [q, setQ] = useState("");
  const [grant, setGrant] = useState<Wallet | null>(null);
  const [n, setN] = useState("1");
  const [note, setNote] = useState("");
  const list = data.wallets.filter((w) => !q.trim() || `${w.name} ${w.phone} ${w.code}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر بالاسم أو الرقم أو الكود" className="mb-3" />
      {list.length === 0 ? (
        <Empty icon="users" title="مفيش محافظ" />
      ) : (
        <Card className="divide-y divide-[var(--line)]">
          {list.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-chalk">
                  {w.name} {w.blocked && <Badge tone="danger">محظور</Badge>}
                </p>
                <p className="text-xs text-fog" dir="ltr">
                  {w.code} · {w.phone}
                </p>
              </div>
              <span className="text-sm text-mist">{w.models} موديل</span>
              <Badge tone="info">{w.credits} كريدت</Badge>
              {can(me, "ai3d") && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setGrant(w)}>
                    ± كريدت
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void rpc("staff_ai3d_block", { p_wallet: w.id, p_blocked: !w.blocked }).then(reload, (e) => toast(errorText(e), "error"))}
                  >
                    {w.blocked ? "فك الحظر" : "احظر"}
                  </Button>
                </>
              )}
            </div>
          ))}
        </Card>
      )}
      <Sheet open={!!grant} onClose={() => setGrant(null)} title={`كريدت لـ ${grant?.name ?? ""}`}>
        <div className="grid gap-3">
          <Field label="العدد" hint="بالسالب عشان تسحب (مثلاً -2)">
            <Input value={n} onChange={(e) => setN(e.target.value)} inputMode="numeric" dir="ltr" />
          </Field>
          <Field label="ليه؟">
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="هدية، تعويض، تصحيح…" />
          </Field>
          <Button
            variant="primary"
            onClick={async () => {
              try {
                const v = await rpc<number>("staff_ai3d_grant", { p_wallet: grant!.id, p_credits: parseInt(n, 10), p_note: note || null });
                toast(`رصيده بقى ${v}`, "ok");
                setGrant(null);
                reload();
              } catch (e) {
                toast(errorText(e), "error");
              }
            }}
          >
            احفظ
          </Button>
        </div>
      </Sheet>
    </>
  );
}

function SettingsTab({ data, me, reload }: { data: Overview; me: StaffRow; reload: () => void }) {
  const [s, setS] = useState<Settings>(data.settings);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const edit = can(me, "ai3d");
  const put = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const save = async () => {
    setBusy(true);
    try {
      await rpc("staff_ai3d_settings_save", { p: s });
      toast("اتحفظ", "ok");
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-4">
      {isFull(me) && (
        <Card className="grid gap-3 p-4">
          <p className="font-semibold text-chalk">مفتاح Meshy</p>
          <p className="text-sm text-mist">
            {s.key_set ? "✓ متحط ومتخزّن مخفي. اكتب مفتاح جديد لو عايز تغيّره." : "اعمل حساب على meshy.ai (خطة مدفوعة)، ومن API Keys اعمل مفتاح بيبدأ بـ msy_ وحطه هنا."} المفتاح بيتحفظ في الـ Vault ومش بيظهر تاني لأي حد.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="msy_…" dir="ltr" className="min-w-[16rem] flex-1" autoComplete="off" />
            <Button
              variant="primary"
              disabled={!key.trim()}
              onClick={async () => {
                try {
                  await rpc("staff_ai3d_key_save", { p_key: key });
                  setKey("");
                  toast("اتحفظ المفتاح", "ok");
                  reload();
                } catch (e) {
                  toast(errorText(e), "error");
                }
              }}
            >
              احفظ المفتاح
            </Button>
            {s.key_set && (
              <Button variant="ghost" onClick={() => void rpc("staff_ai3d_key_save", { p_key: "" }).then(reload, (e) => toast(errorText(e), "error"))}>
                شيله
              </Button>
            )}
          </div>
        </Card>
      )}
      <Card className="grid gap-4 p-4">
        <Toggle
          checked={s.enabled}
          disabled={!edit || !s.key_set}
          onChange={(v) => put("enabled", v)}
          label={s.enabled ? "الخدمة شغالة للعملاء" : "الخدمة مقفولة"}
          hint={s.key_set ? "لما تتقفل، الصفحة بتفضل ظاهرة بس محدش يقدر يعمل موديل." : "حط مفتاح Meshy الأول."}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="كريدت الموديل من كلام">
            <Input type="number" min={1} max={100} value={String(s.cost_text)} onChange={(e) => put("cost_text", Number(e.target.value) || 1)} disabled={!edit} dir="ltr" />
          </Field>
          <Field label="كريدت الموديل من صورة">
            <Input type="number" min={1} max={100} value={String(s.cost_image)} onChange={(e) => put("cost_image", Number(e.target.value) || 1)} disabled={!edit} dir="ltr" />
          </Field>
        </div>
        <Field label="الباقات" hint="عدد الكريدت والسعر بالجنيه. من 1 لـ 6 باقات.">
          <div className="grid gap-2">
            {s.packages.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input type="number" min={1} value={String(p.credits)} onChange={(e) => put("packages", s.packages.map((x, j) => (j === i ? { ...x, credits: Math.max(1, Math.round(Number(e.target.value) || 1)) } : x)))} disabled={!edit} dir="ltr" aria-label="كريدت" />
                <span className="text-fog">كريدت بـ</span>
                <Input type="number" min={0} value={String(p.price)} onChange={(e) => put("packages", s.packages.map((x, j) => (j === i ? { ...x, price: Math.max(0, Number(e.target.value) || 0) } : x)))} disabled={!edit} dir="ltr" aria-label="السعر" />
                <span className="text-fog">جنيه</span>
                {edit && s.packages.length > 1 && (
                  <Button size="sm" variant="ghost" onClick={() => put("packages", s.packages.filter((_, j) => j !== i))}>
                    شيل
                  </Button>
                )}
              </div>
            ))}
            {edit && s.packages.length < 6 && (
              <Button size="sm" variant="ghost" icon="plus" className="w-fit" onClick={() => put("packages", [...s.packages, { credits: 10, price: 450 }])}>
                باقة
              </Button>
            )}
          </div>
        </Field>
        <Field label="طريقة الدفع (بالعربي)" hint="الأرقام اللي العميل يحوّل عليها، بتظهر في الاستوديو وقت الشحن.">
          <Textarea value={s.pay_ar ?? ""} onChange={(e) => put("pay_ar", e.target.value)} maxLength={600} disabled={!edit} placeholder={"فودافون كاش: 010…\nإنستاباي: name@instapay"} />
        </Field>
        <Field label="طريقة الدفع (English)">
          <Textarea value={s.pay_en ?? ""} onChange={(e) => put("pay_en", e.target.value)} maxLength={600} disabled={!edit} dir="ltr" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="كريدت هدية لكل محفظة جديدة" hint="من 0 لـ 5 — كل واحد بيتكلّف عليك">
            <Input type="number" min={0} max={5} value={String(s.free_credits)} onChange={(e) => put("free_credits", Math.min(5, Math.max(0, Number(e.target.value) || 0)))} disabled={!edit} dir="ltr" />
          </Field>
          <Field label="موديل Meshy (اختياري)" hint="سيبه فاضي للأحدث">
            <Input value={s.ai_model ?? ""} onChange={(e) => put("ai_model", e.target.value)} disabled={!edit} dir="ltr" placeholder="latest" />
          </Field>
        </div>
        <Toggle checked={s.textured} disabled={!edit} onChange={(v) => put("textured", v)} label="خامات وألوان (Texture)" hint="من غيرها الموديل بيطلع أسرع وأرخص بس بلون واحد." />
        {edit && (
          <Button variant="primary" loading={busy} onClick={() => void save()} data-testid="ai3d-settings-save">
            احفظ الإعدادات
          </Button>
        )}
      </Card>
    </div>
  );
}

export function Ai3dScreen({ me }: { me: StaffRow }) {
  const data = useAsync(() => rpc<Overview>("staff_ai3d_overview"), []);
  const [tab, setTab] = useState<"topups" | "jobs" | "wallets" | "settings">("topups");
  if (!data.data) return <>{data.error ? <Empty icon="alert" title="مقدرناش نفتح 3D AI" body={errorText(data.error)} /> : <Loading />}</>;
  const d = data.data;
  const reload = () => data.reload();
  return (
    <>
      <TopBar
        title="BuildX 3D AI"
        sub={d.settings.enabled && d.settings.key_set ? "شغالة للعملاء" : "مقفولة للعملاء"}
        actions={
          <a href="/ar/3dai/" target="_blank" rel="noreferrer" className="text-sm text-cyan">
            الصفحة ↗
          </a>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="مستني مراجعة" value={d.stats.pending} tone={d.stats.pending ? "warn" : undefined} icon="clock" />
        <Stat label="الدخل (المتأكد)" value={egp(d.stats.income)} icon="chart" />
        <Stat label="موديلات جاهزة" value={d.stats.done} sub={d.stats.active ? `${d.stats.active} شغالين` : undefined} icon="layers" />
        <Stat label="محافظ" value={d.stats.wallets} icon="users" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Chip active={tab === "topups"} onClick={() => setTab("topups")} count={d.stats.pending}>
          الشحن
        </Chip>
        <Chip active={tab === "jobs"} onClick={() => setTab("jobs")}>
          الموديلات
        </Chip>
        <Chip active={tab === "wallets"} onClick={() => setTab("wallets")}>
          المحافظ
        </Chip>
        <Chip active={tab === "settings"} onClick={() => setTab("settings")}>
          الإعدادات
        </Chip>
      </div>
      {tab === "topups" && <TopupsTab data={d} me={me} reload={reload} />}
      {tab === "jobs" && <JobsTab data={d} me={me} reload={reload} />}
      {tab === "wallets" && <WalletsTab data={d} me={me} reload={reload} />}
      {tab === "settings" && <SettingsTab data={d} me={me} reload={reload} />}
    </>
  );
}
