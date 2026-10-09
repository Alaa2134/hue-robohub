"use client";
/** Staff dashboards for the website itself: security (attacks and responses), visits, and browser errors. */
import { useState } from "react";
import { can, errorText, fmt, rpc, type StaffRow } from "./core";
import { Badge, Button, Card, Chip, Empty, ErrorBox, Icon, Input, List, Loading, Section, Sheet, Stat, TopBar, confirmDialog, copyText, go, toast, useAsync, type IconKey } from "./ui";

/* ─── Shared ───────────────────────────────────────────────────────────── */

export type Pulse = { level: "ok" | "elevated" | "attack"; last_hour: Record<string, number>; at: string };

export const PULSE_LOOK: Record<Pulse["level"], { title: string; body: string; tone: "ok" | "warn" | "danger"; icon: IconKey; cls: string }> = {
  ok: { title: "كل حاجة هادية", body: "مفيش نشاط مريب في آخر ساعة.", tone: "ok", icon: "checkCircle", cls: "border-ok/30 bg-ok/[0.06] text-ok" },
  elevated: { title: "نشاط مريب", body: "فيه محاولات اتمنعت في آخر ساعة. راجع الأحداث تحت.", tone: "warn", icon: "alert", cls: "border-warn/40 bg-warn/[0.07] text-warn" },
  attack: { title: "هجوم محتمل دلوقتي", body: "عدد كبير من المحاولات المرفوضة. احظر العناوين اللي ورا الهجوم، ولو لزم اقفل التقديم مؤقتًا.", tone: "danger", icon: "alert", cls: "border-danger/50 bg-danger/[0.08] text-danger" },
};

const KIND: Record<string, string> = {
  rate_limited: "طلبات كتير من نفس العنوان (اتمنعت)",
  blocked_ip: "عنوان محظور حاول يدخل",
  honeypot: "بوت ملأ فخ الاستمارة",
  apply_flood: "سيل طلبات على استمارة التقديم",
  login_failed: "محاولة دخول طالب غلط",
  account_locked: "حساب طالب اتقفل مؤقتًا",
  pin_change_failed: "محاولة تغيير رمز بالرمز الغلط",
};
const BUCKET: Record<string, string> = { apply: "التقديم", login: "دخول الطلاب", pin_change: "تغيير الرمز", view: "زيارات الموقع", client_error: "تقارير الأخطاء" };
const SEVERITY_TONE = { 1: "muted", 2: "warn", 3: "danger" } as const;

function Period({ value, onChange, options }: { value: number; onChange: (v: number) => void; options: [number, string][] }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <Chip key={v} active={value === v} onClick={() => onChange(v)}>
          {l}
        </Chip>
      ))}
    </div>
  );
}

/* ─── Security ─────────────────────────────────────────────────────────── */

type SecEvent = { id: number; at: string; kind: string; severity: 1 | 2 | 3; ip: string | null; detail: Record<string, unknown> };
type Overview = {
  pulse: Pulse;
  counts: Record<string, number>;
  events: SecEvent[];
  top_ips: { ip: string; events: number; worst: number; kinds: string[]; last: string }[];
  blocked: { ip: string; reason: string; until: string | null; created_at: string }[];
  locked_students: { id: string; name: string; code: string; until: string }[];
};

function eventDetail(e: SecEvent) {
  const d = e.detail ?? {};
  if (e.kind === "rate_limited" || e.kind === "blocked_ip") return BUCKET[String(d.bucket)] ?? String(d.bucket ?? "");
  if (e.kind === "account_locked" || e.kind === "login_failed") return d.code ? `كود ${String(d.code)}${d.attempts ? ` · محاولة ${String(d.attempts)}` : ""}` : "كود مش موجود";
  if (e.kind === "apply_flood") return `${String(d.last_minute ?? "")} طلب في دقيقة`;
  return "";
}

export function SecurityScreen({ me }: { me: StaffRow }) {
  const [hours, setHours] = useState(24);
  const [blocking, setBlocking] = useState<string | null>(null);
  const { data, error, loading, reload } = useAsync(() => rpc<Overview>("staff_security_overview", { p_hours: hours }), [hours]);
  const admin = can(me, "security");

  const unblock = async (ip: string) => {
    if (!(await confirmDialog({ title: `فك الحظر عن ${ip}؟`, ok: "فك الحظر" }))) return;
    try {
      await rpc("staff_unblock_ip", { p_ip: ip });
      toast("اتفك الحظر");
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const unlock = async (id: string, name: string) => {
    try {
      await rpc("staff_unlock_student", { p_id: id });
      toast(`اتفتح حساب ${name}`);
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  if (!admin)
    return (
      <>
        <TopBar title="الأمان" back="/staff/more" />
        <Empty icon="lock" title="الصفحة دي للمالك والأدمنز بس" />
      </>
    );

  const look = data ? PULSE_LOOK[data.pulse.level] : null;
  return (
    <>
      <TopBar title="الأمان والهجمات" sub="مراقبة الموقع والتطبيق والرد على أي هجوم" back="/staff/more" actions={<Button size="sm" variant="ghost" icon="refresh" onClick={reload} aria-label="تحديث" />} />
      <Period value={hours} onChange={setHours} options={[[24, "آخر 24 ساعة"], [24 * 7, "آخر أسبوع"], [24 * 30, "آخر شهر"]]} />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : data && look ? (
        <>
          <Card className={`flex items-start gap-3 ${look.cls}`}>
            <Icon name={look.icon} size={26} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold">{look.title}</p>
              <p className="mt-0.5 text-sm text-mist">{look.body}</p>
            </div>
          </Card>
          {data.pulse.level === "attack" && (
            <Button className="mt-3" block variant="danger" icon="lock" onClick={() => go("/staff/applications")}>
              اقفل التقديم مؤقتًا
            </Button>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="طلبات اتمنعت" value={data.counts.rate_limited ?? 0} tone={data.counts.rate_limited ? "warn" : undefined} icon="shield" />
            <Stat label="بوتات اتمسكت" value={data.counts.honeypot ?? 0} icon="alert" />
            <Stat label="دخول غلط" value={data.counts.login_failed ?? 0} icon="key" />
            <Stat label="عناوين محظورة" value={data.blocked.length} tone={data.blocked.length ? "info" : undefined} icon="lock" />
          </div>

          {data.locked_students.length > 0 && (
            <Section title="حسابات طلاب مقفولة مؤقتًا">
              <List>
                {data.locked_students.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-chalk">{s.name}</p>
                      <p className="text-xs text-fog">
                        <span dir="ltr">{s.code}</span> · مقفول لحد {fmt.time(s.until)}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => unlock(s.id, s.name)}>
                      افتح
                    </Button>
                  </div>
                ))}
              </List>
              <p className="mt-2 text-xs text-fog">افتح الحساب بس لو اتأكدت إن الطالب نفسه هو اللي نسي الرمز.</p>
            </Section>
          )}

          <Section title="أكتر العناوين نشاطًا مريبًا">
            {data.top_ips.length ? (
              <List>
                {data.top_ips.map((t) => {
                  const blocked = data.blocked.some((b) => b.ip === t.ip);
                  return (
                    <div key={t.ip} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <button type="button" className="font-mono text-sm text-chalk" dir="ltr" onClick={() => copyText(t.ip)}>
                          {t.ip}
                        </button>
                        <p className="truncate text-xs text-fog">
                          {t.events} حدث · {t.kinds.map((k) => KIND[k]?.split(" (")[0] ?? k).join("، ")} · آخر مرة {fmt.dateTime(t.last)}
                        </p>
                      </div>
                      {blocked ? (
                        <Badge tone="info">محظور</Badge>
                      ) : (
                        <Button size="sm" variant={t.worst >= 2 ? "danger" : "secondary"} onClick={() => setBlocking(t.ip)}>
                          احظر
                        </Button>
                      )}
                    </div>
                  );
                })}
              </List>
            ) : (
              <Empty icon="shield" title="مفيش عناوين مريبة في الفترة دي" />
            )}
          </Section>

          <Section title="العناوين المحظورة" action={<Button size="sm" variant="ghost" icon="plus" onClick={() => setBlocking("")}>حظر عنوان</Button>}>
            {data.blocked.length ? (
              <List>
                {data.blocked.map((b) => (
                  <div key={b.ip} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm text-chalk" dir="ltr">
                        {b.ip}
                      </p>
                      <p className="truncate text-xs text-fog">
                        {b.reason || "بدون سبب"} · {b.until ? `لحد ${fmt.dateTime(b.until)}` : "دايم"}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => unblock(b.ip)}>
                      فك الحظر
                    </Button>
                  </div>
                ))}
              </List>
            ) : (
              <p className="text-sm text-fog">مفيش عناوين محظورة.</p>
            )}
          </Section>

          <Section title="آخر الأحداث">
            {data.events.length ? (
              <List>
                {data.events.slice(0, 100).map((e) => (
                  <div key={e.id} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge tone={SEVERITY_TONE[e.severity]}>{e.severity === 3 ? "خطير" : e.severity === 2 ? "تحذير" : "معلومة"}</Badge>
                      <p className="min-w-0 flex-1 truncate text-sm text-chalk">{KIND[e.kind] ?? e.kind}</p>
                    </div>
                    <p className="mt-1 text-xs text-fog">
                      {fmt.dateTime(e.at)}
                      {e.ip && (
                        <>
                          {" · "}
                          <span dir="ltr" className="font-mono">
                            {e.ip}
                          </span>
                        </>
                      )}
                      {eventDetail(e) && ` · ${eventDetail(e)}`}
                    </p>
                  </div>
                ))}
              </List>
            ) : (
              <Empty icon="checkCircle" title="مفيش أحداث في الفترة دي" body="أي محاولة تخمين أو سبام أو ضغط على الموقع هتظهر هنا." />
            )}
          </Section>

          <Card className="mt-6 text-sm leading-relaxed text-mist">
            <p className="mb-1 font-semibold text-chalk">الحماية اللي شغالة لوحدها</p>
            <ul className="list-disc ps-5">
              <li>استمارة التقديم: 5 طلبات في الساعة لكل شبكة، وفخ للبوتات، وحد أقصى للطلبات في الدقيقة.</li>
              <li>دخول الطلاب: قفل الحساب بعد 5 محاولات غلط (والمدة بتزيد)، و30 محاولة كل ربع ساعة لكل شبكة.</li>
              <li>الموقع: سياسة أمان بتمنع تشغيل سكريبتات من برّه، وكل البيانات محمية بصلاحيات على مستوى الصف.</li>
              <li>مراقبة كل ساعة من GitHub: لو حصل هجوم أو الموقع وقع بيتفتح تنبيه ويوصلك على الإيميل.</li>
            </ul>
          </Card>
        </>
      ) : null}
      <BlockSheet ip={blocking} onClose={() => setBlocking(null)} onDone={reload} />
    </>
  );
}

function BlockSheet({ ip, onClose, onDone }: { ip: string | null; onClose: () => void; onDone: () => void }) {
  const [value, setValue] = useState("");
  const [hours, setHours] = useState(24);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const open = ip !== null;
  const target = ip || value;
  const save = async () => {
    setBusy(true);
    try {
      await rpc("staff_block_ip", { p_ip: target.trim(), p_hours: hours, p_reason: reason.trim() });
      toast(`اتحظر ${target}`);
      onClose();
      onDone();
      setValue("");
      setReason("");
    } catch (e) {
      toast(/inet|invalid input/i.test(errorText(e)) ? "العنوان ده مش صحيح." : errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="حظر عنوان IP">
      <div className="grid gap-4">
        {ip ? (
          <p className="font-mono text-lg text-chalk" dir="ltr">
            {ip}
          </p>
        ) : (
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="مثال: 203.0.113.9" dir="ltr" inputMode="decimal" />
        )}
        <div className="flex flex-wrap gap-2">
          {([[1, "ساعة"], [24, "يوم"], [24 * 7, "أسبوع"], [0, "دايم"]] as [number, string][]).map(([h, l]) => (
            <Chip key={h} active={hours === h} onClick={() => setHours(h)}>
              {l}
            </Chip>
          ))}
        </div>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="السبب (اختياري)" maxLength={200} />
        <p className="text-xs leading-relaxed text-fog">العنوان المحظور مش هيقدر يقدّم أو يدخل كطالب. خلي بالك: شبكة الجامعة أو الكافيه ممكن تجمع ناس كتير على نفس العنوان.</p>
        <Button variant="danger" block loading={busy} disabled={!target.trim()} onClick={save}>
          احظر
        </Button>
      </div>
    </Sheet>
  );
}

/* ─── Site visits ──────────────────────────────────────────────────────── */

type SiteStats = {
  from: string;
  totals: { views: number; visitors: number };
  daily: { day: string; views: number; visitors: number }[];
  pages: { path: string; views: number }[];
  referrers: { host: string; views: number }[];
  countries: Record<string, number>;
  devices: Record<string, number>;
  locales: Record<string, number>;
};

const DEVICE: Record<string, string> = { mobile: "موبايل", desktop: "كمبيوتر", tablet: "تابلت" };
const pageName = (p: string) => {
  const path = p.replace(/^\/ar(?=\/|$)/, "") || "/";
  const lang = p.startsWith("/ar") ? "ع" : "EN";
  return { path: path === "/" ? "الرئيسية" : path, lang };
};

/** Daily views as thin bars; hover/focus a bar to read its day. */
function DailyBars({ daily, from, days }: { daily: SiteStats["daily"]; from: string; days: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const series = Array.from({ length: days }, (_, i) => {
    const day = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    return byDay.get(day) ?? { day, views: 0, visitors: 0 };
  });
  const max = Math.max(1, ...series.map((d) => d.views));
  const cur = hover !== null ? series[hover] : null;
  const label = (d: { day: string; views: number; visitors: number }) => `${fmt.day(`${d.day}T12:00:00`)}: ${d.views} زيارة، ${d.visitors} زائر`;
  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="font-semibold text-chalk">الزيارات كل يوم</p>
        <p className="min-h-[1.25rem] text-xs text-mist" aria-live="polite">
          {cur ? label(cur) : `أعلى يوم: ${max} زيارة`}
        </p>
      </div>
      <div className="flex h-36 items-end gap-[2px] border-b border-[var(--line)]" dir="ltr" onPointerLeave={() => setHover(null)}>
        {series.map((d, i) => (
          <button
            key={d.day}
            type="button"
            aria-label={label(d)}
            onPointerEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            className="group flex h-full min-w-0 flex-1 items-end"
          >
            <span
              className={`block w-full rounded-t-[4px] transition-colors ${hover === i ? "bg-cyan" : "bg-volt"} ${d.views === 0 ? "opacity-30" : ""}`}
              style={{ height: `${Math.max(d.views ? 3 : 1, (d.views / max) * 100)}%` }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-fog" dir="ltr">
        <span>{fmt.short(`${series[0]?.day}T12:00:00`)}</span>
        <span>{fmt.short(`${series.at(-1)?.day}T12:00:00`)}</span>
      </div>
      <table className="sr-only">
        <caption>الزيارات كل يوم</caption>
        <tbody>
          {series.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{d.views}</td>
              <td>{d.visitors}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Ranked({ title, rows, total }: { title: string; rows: [React.ReactNode, number][]; total: number }) {
  return (
    <Card>
      <p className="mb-3 font-semibold text-chalk">{title}</p>
      {rows.length ? (
        <ul className="grid gap-2">
          {rows.map(([k, n], i) => (
            <li key={i} className="grid gap-1">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-mist">{k}</span>
                <span className="font-mono text-chalk">{n}</span>
              </div>
              <span className="h-1 rounded-full bg-volt/70" style={{ width: `${Math.max(3, (n / Math.max(1, total)) * 100)}%` }} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fog">لسه مفيش بيانات.</p>
      )}
    </Card>
  );
}

export function SiteStatsScreen() {
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useAsync(() => rpc<SiteStats>("staff_site_stats", { p_days: days }), [days]);
  const entries = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <TopBar title="زيارات الموقع" sub="عدد من غير كوكيز ومن غير ما نحفظ بيانات الزوار" back="/staff/more" actions={<Button size="sm" variant="ghost" icon="refresh" onClick={reload} aria-label="تحديث" />} />
      <Period value={days} onChange={setDays} options={[[7, "7 أيام"], [30, "30 يوم"], [90, "3 شهور"]]} />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : data ? (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="زيارة" value={data.totals.views} icon="chart" />
            <Stat label="زائر" value={data.totals.visitors} icon="users" />
            <Stat label="موبايل" value={`${Math.round(((data.devices.mobile ?? 0) / Math.max(1, data.totals.views)) * 100)}%`} icon="install" />
            <Stat label="بالعربي" value={`${Math.round(((data.locales.ar ?? 0) / Math.max(1, data.totals.views)) * 100)}%`} icon="globe" />
          </div>
          <DailyBars daily={data.daily} from={data.from} days={days} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Ranked
              title="أكتر الصفحات زيارة"
              total={data.pages[0]?.views ?? 1}
              rows={data.pages.map((p) => {
                const n = pageName(p.path);
                return [
                  <span key={p.path} className="flex items-center gap-2">
                    <span className="rounded bg-panel-2 px-1.5 text-[10px] text-fog">{n.lang}</span>
                    <span dir={n.path.startsWith("/") ? "ltr" : undefined}>{n.path}</span>
                  </span>,
                  p.views,
                ];
              })}
            />
            <Ranked title="جايين منين" total={data.referrers[0]?.views ?? 1} rows={data.referrers.map((r) => [<span key={r.host} dir="ltr">{r.host}</span>, r.views])} />
            <Ranked title="الأجهزة" total={data.totals.views} rows={entries(data.devices).map(([k, n]) => [DEVICE[k] ?? k, n])} />
            <Ranked title="الدول" total={data.totals.views} rows={entries(data.countries).slice(0, 8).map(([k, n]) => [k === "??" ? "غير معروف" : (new Intl.DisplayNames(["ar"], { type: "region" }).of(k) ?? k), n])} />
          </div>
          <p className="text-xs leading-relaxed text-fog">الزوار بيتعدّوا بكود بيتغير كل يوم ومينفعش يرجع لأي شخص، ومحدش بيتعدّ لو مفعّل &quot;Do Not Track&quot;. البوتات ومحركات البحث مش محسوبة.</p>
        </div>
      ) : null}
    </>
  );
}

/* ─── Browser errors ───────────────────────────────────────────────────── */

type ClientError = { id: number; message: string; source: string | null; path: string | null; browser: string | null; count: number; first_at: string; last_at: string };

const browserName = (ua: string | null) => {
  if (!ua) return "";
  const m = ua.match(/(Edg|OPR|SamsungBrowser|Firefox|CriOS|Chrome|Version)\/[\d.]+/);
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : "";
  const b = m ? m[1].replace("Version", "Safari").replace("CriOS", "Chrome").replace("Edg", "Edge").replace("OPR", "Opera") : "";
  return [b, os].filter(Boolean).join(" · ");
};

export function ErrorsScreen() {
  const { data, error, loading, reload } = useAsync(() => rpc<ClientError[]>("staff_client_errors", { p_days: 30 }), []);
  const resolve = async (id: number) => {
    try {
      await rpc("staff_resolve_client_error", { p_id: id });
      toast("اتعلّم إنه اتصلح — لو رجع تاني هيظهر هنا");
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  return (
    <>
      <TopBar title="أخطاء الموقع" sub="أي خطأ بيحصل عند الزوار بيوصل هنا لوحده" back="/staff/more" actions={<Button size="sm" variant="ghost" icon="refresh" onClick={reload} aria-label="تحديث" />} />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !data?.length ? (
        <Empty icon="checkCircle" title="مفيش أخطاء" body="آخر 30 يوم الموقع والتطبيق شغالين من غير أخطاء عند الزوار." />
      ) : (
        <List>
          {data.map((e) => (
            <div key={e.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <Icon name="xCircle" size={18} className="mt-0.5 shrink-0 text-danger" />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-mono text-[13px] text-chalk" dir="ltr">
                    {e.message}
                  </p>
                  <p className="mt-1 text-xs text-fog">
                    {e.count} مرة · آخر مرة {fmt.dateTime(e.last_at)}
                    {e.path && (
                      <>
                        {" · "}
                        <span dir="ltr">{e.path}</span>
                      </>
                    )}
                    {browserName(e.browser) && ` · ${browserName(e.browser)}`}
                  </p>
                  {e.source && (
                    <p className="mt-0.5 truncate font-mono text-[11px] text-fog" dir="ltr">
                      {e.source}
                    </p>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => resolve(e.id)}>
                  اتصلح
                </Button>
              </div>
            </div>
          ))}
        </List>
      )}
    </>
  );
}

/** Small home-screen alert for owners/admins when the security level isn't calm. */
export function SecurityAlert() {
  const { data } = useAsync(() => rpc<Pulse>("security_pulse"), []);
  if (!data || data.level === "ok") return null;
  const look = PULSE_LOOK[data.level];
  return (
    <Card className={`mt-4 flex items-center gap-3 ${look.cls}`}>
      <Icon name={look.icon} size={22} className="shrink-0" />
      <p className="flex-1 text-sm">
        <span className="font-bold">{look.title}</span>
        <span className="text-mist"> — {look.body}</span>
      </p>
      <Button size="sm" variant={data.level === "attack" ? "danger" : "secondary"} onClick={() => go("/staff/security")}>
        افتح
      </Button>
    </Card>
  );
}

/* ─── Free plan usage ──────────────────────────────────────────────────── */

type Usage = { db_bytes: number; buckets: { bucket: string; bytes: number; files: number }[] };
const MB = 1024 * 1024;
const BUCKET_LABEL: Record<string, string> = { materials: "ملفات الكورسات", submissions: "تسليمات الطلاب", site: "صور الموقع", team: "صور الفريق", backups: "النسخ الاحتياطية" };

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const tone = pct >= 90 ? "bg-danger" : pct >= 75 ? "bg-warn" : "bg-gradient-to-l from-cyan to-volt";
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-chalk">{label}</span>
        <span className="text-xs text-fog" dir="ltr">
          {(used / MB).toFixed(used < 10 * MB ? 1 : 0)} / {Math.round(limit / MB)} MB · {pct}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10" role="meter" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}

/** Owners and admins: how much of Supabase's free plan is used, before it runs out. */
export function UsageCard() {
  const { data } = useAsync(() => rpc<Usage>("staff_usage"), []);
  if (!data) return null;
  const files = data.buckets.reduce((n, b) => n + b.bytes, 0);
  const near = data.db_bytes / (500 * MB) >= 0.75 || files / (1024 * MB) >= 0.75;
  return (
    <Card className="mt-4 grid gap-3">
      <p className="font-semibold text-chalk">الباقة المجانية</p>
      <Meter label="قاعدة البيانات" used={data.db_bytes} limit={500 * MB} />
      <Meter label="الملفات" used={files} limit={1024 * MB} />
      {data.buckets.length > 0 && (
        <p className="text-xs leading-relaxed text-fog">
          {data.buckets.map((b) => `${BUCKET_LABEL[b.bucket] ?? b.bucket}: ${(b.bytes / MB).toFixed(1)} MB`).join(" · ")}
        </p>
      )}
      {near && <p className="text-xs text-warn">قرّبت توصل للحد المجاني: امسح الملفات القديمة، وحط الفيديوهات على يوتيوب بدل ما ترفعها.</p>}
    </Card>
  );
}
