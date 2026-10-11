"use client";
/**
 * The digital membership card. Members: a tile on the home screen and the full card (/me/card) with a
 * big QR of their card code (BXM-…), valid until, and a nudge to renew; it opens offline too, from the
 * last copy. Staff: «فحص كارنيه العضوية» scans a card (or takes a code) and says valid / ended / stopped /
 * banned, and can check the member into an event at the same time. Data: student_card, staff_member_scan.
 */
import { useEffect, useState } from "react";
import { errorText, fmt, must, rpc, sb, studentRpcOffline } from "./core";
import { Scanner } from "./scanner";
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  Field,
  Icon,
  Input,
  Loading,
  Select,
  TopBar,
  go,
  useAsync,
} from "./ui";
import { cn } from "@/lib/cn";

export type MemberState = "open" | "active" | "expiring" | "expired" | "stopped";
export type MyCard = {
  name: string;
  code: string;
  group: string;
  card: string;
  since: string;
  until: string | null;
  state: MemberState;
  daysLeft: number | null;
};

export const STATE: Record<MemberState, { label: string; tone: "ok" | "warn" | "danger" | "muted" }> = {
  open: { label: "عضو", tone: "ok" },
  active: { label: "عضوية سارية", tone: "ok" },
  expiring: { label: "قرّبت تخلص", tone: "warn" },
  expired: { label: "العضوية خلصت", tone: "danger" },
  stopped: { label: "موقوفة", tone: "danger" },
};

const day = (iso: string) =>
  new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(`${iso.slice(0, 10)}T12:00:00`),
  );

function useMyCard() {
  return useAsync(() => studentRpcOffline<MyCard>("student_card"), []);
}

function Qr({ value, size }: { value: string; size: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void import("qrcode").then((QR) =>
      QR.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: "M" }).then(
        (u) => live && setSrc(u),
      ),
    );
    return () => {
      live = false;
    };
  }, [value, size]);
  return (
    <div className="rounded-2xl bg-white p-3" style={{ width: size + 24, height: size + 24 }}>
      {src && <img src={src} alt={`QR ${value}`} width={size} height={size} data-testid="card-qr" />}
    </div>
  );
}

/** Home: the card in one line, with what needs doing when it is ending. */
export function MemberCardTile() {
  const { data } = useMyCard();
  if (!data) return null;
  const s = STATE[data.state];
  return (
    <button
      type="button"
      onClick={() => go("/me/card")}
      className="mt-4 flex w-full items-center gap-4 rounded-3xl border border-[var(--line-2)] bg-gradient-to-l from-cyan/10 to-panel/70 p-4 text-start"
      data-testid="member-tile"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#081634]">
        <Icon name="scan" size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-chalk">كارنيه العضوية</p>
        <p className="mt-0.5 text-xs text-fog">
          {data.state === "expiring" && data.daysLeft != null
            ? `فاضل ${data.daysLeft} يوم، جدّد عضويتك`
            : data.until
              ? `سارية لحد ${day(data.until)}`
              : "اعرضه على الباب في الفعاليات"}
        </p>
      </div>
      <Badge tone={s.tone}>{s.label}</Badge>
    </button>
  );
}

/** The full card: big QR to scan at the door. */
export function MemberCardScreen() {
  const { data, error, loading, reload } = useMyCard();
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} retry={reload} />;
  const s = STATE[data.state];
  const ended = data.state === "expired" || data.state === "stopped";
  return (
    <>
      <TopBar title="كارنيه العضوية" back="/me" />
      <div className="mx-auto grid max-w-sm gap-4" data-testid="member-card">
        <div
          className={cn(
            "relative overflow-hidden rounded-3xl border p-5",
            ended
              ? "border-[#ff8794]/40 bg-[#ff8794]/5"
              : "border-cyan/30 bg-gradient-to-br from-cyan/15 via-panel to-abyss",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] tracking-widest text-fog">BUILDX HUE · MEMBER</p>
              <p className="mt-2 text-xl font-bold text-chalk">{data.name}</p>
              <p className="mt-1 text-xs text-fog">
                <span dir="ltr" className="font-mono">
                  {data.code}
                </span>
                {data.group ? ` · ${data.group}` : ""}
              </p>
            </div>
            <Badge tone={s.tone}>{s.label}</Badge>
          </div>
          <div className="mt-5 flex justify-center">
            <Qr value={data.card} size={200} />
          </div>
          <p className="mt-3 text-center font-mono text-sm tracking-wider text-mist" dir="ltr">
            {data.card}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-white/[0.04] p-2.5">
              <p className="text-fog">عضو من</p>
              <p className="mt-0.5 font-semibold text-chalk">{day(data.since)}</p>
            </div>
            <div className="rounded-xl bg-white/[0.04] p-2.5">
              <p className="text-fog">سارية لحد</p>
              <p className="mt-0.5 font-semibold text-chalk">{data.until ? day(data.until) : "مفتوحة"}</p>
            </div>
          </div>
        </div>
        {(data.state === "expiring" || ended) && (
          <Card className="text-sm leading-relaxed text-mist">
            {data.state === "stopped"
              ? "عضويتك موقوفة دلوقتي. كلّم حد من الفريق يعرّفك تعمل إيه."
              : data.state === "expired"
                ? "العضوية خلصت. كلّم الفريق عشان تجدّدها وترجع تحضر الفعاليات والمعارض."
                : `فاضل ${data.daysLeft} يوم على العضوية. جدّدها مع الفريق قبل ما تخلص.`}
          </Card>
        )}
        <p className="text-center text-xs text-fog">
          اعرض الكود ده على الباب في الفعاليات والمعارض، وفي الجلسات بدل رقمك. بيفتح من غير نت كمان.
        </p>
      </div>
    </>
  );
}

/* ─── Staff: scan a card at the door ─────────────────────────────────────── */

type ScanResult =
  | { result: "unknown"; code: string }
  | { result: "no_event" }
  | {
      result: "ok" | "expired" | "stopped" | "banned";
      student: { name: string; code: string; group: string; until: string | null; state: MemberState };
      event: { checkedIn: true; already: boolean; count: number } | null;
    };

type Ev = { id: string; title: string; title_ar: string | null; starts_at: string | null };

const VERDICT: Record<"ok" | "expired" | "stopped" | "banned", { title: string; cls: string }> = {
  ok: { title: "عضو، يدخل ✓", cls: "border-ok/40 bg-ok/10 text-[#7cf0c6]" },
  expired: { title: "العضوية خلصت", cls: "border-warn/40 bg-warn/10 text-[#ffd08a]" },
  stopped: { title: "العضوية موقوفة", cls: "border-[#ff8794]/40 bg-[#ff8794]/10 text-[#ff8794]" },
  banned: { title: "محظور من الفعاليات", cls: "border-[#ff8794]/40 bg-[#ff8794]/10 text-[#ff8794]" },
};

export function MemberScanScreen({ canCheckIn }: { canCheckIn: boolean }) {
  const events = useAsync(async () => {
    if (!canCheckIn) return [] as Ev[];
    const from = new Date(Date.now() - 2 * 864e5).toISOString();
    return (await sb()
      .from("site_content")
      .select("id,title,title_ar,starts_at")
      .eq("kind", "event")
      .gte("starts_at", from)
      .order("starts_at")
      .limit(20)
      .then(must)) as Ev[];
  }, [canCheckIn]);
  const [event, setEvent] = useState("");
  const [scan, setScan] = useState(true);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const [last, setLast] = useState<ScanResult | { result: "error"; message: string } | null>(null);

  const check = async (raw: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await rpc<ScanResult>("staff_member_scan", { p_raw: raw, p_event: event || null });
      setLast(r);
      navigator.vibrate?.(r.result === "ok" ? 60 : [80, 60, 80]);
    } catch (e) {
      setLast({ result: "error", message: errorText(e) });
    } finally {
      setTimeout(() => setBusy(false), 1200);
    }
  };

  return (
    <>
      <TopBar title="فحص كارنيه العضوية" sub="امسح الـ QR من تطبيق العضو" back="/staff/more" />
      {canCheckIn && !!events.data?.length && (
        <Field label="سجّل حضوره في فعالية (اختياري)">
          <Select value={event} onChange={(e) => setEvent(e.target.value)} data-testid="scan-event">
            <option value="">من غير تسجيل، فحص بس</option>
            {events.data.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title_ar || e.title}
                {e.starts_at ? ` · ${fmt.day(e.starts_at)}` : ""}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {last && (
        <div className="mt-3" data-testid="scan-result" aria-live="polite">
          {last.result === "error" ? (
            <Card className="text-sm text-[#ff8794]">{last.message}</Card>
          ) : last.result === "unknown" ? (
            <Card className="border-[#ff8794]/40 text-[#ff8794]">
              <p className="text-lg font-bold">مش لاقيين الكارنيه ده</p>
              <p className="mt-1 font-mono text-xs" dir="ltr">
                {last.code}
              </p>
            </Card>
          ) : last.result === "no_event" ? (
            <Card className="text-sm text-[#ff8794]">الفعالية دي مش موجودة.</Card>
          ) : (
            <div className={cn("rounded-3xl border p-5", VERDICT[last.result].cls)}>
              <p className="text-2xl font-bold">{VERDICT[last.result].title}</p>
              <p className="mt-2 text-lg font-semibold text-chalk">{last.student.name}</p>
              <p className="text-xs text-fog">
                <span dir="ltr" className="font-mono">
                  {last.student.code}
                </span>
                {last.student.group ? ` · ${last.student.group}` : ""}
                {last.student.until ? ` · سارية لحد ${day(last.student.until)}` : ""}
              </p>
              {last.event && (
                <p className="mt-2 text-sm text-chalk">
                  {last.event.already ? "متسجّل في الفعالية قبل كده" : "اتسجّل حضوره في الفعالية"} · جوه
                  دلوقتي {last.event.count}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <Card className="mt-3 grid gap-3">
        {scan ? (
          <>
            <Scanner
              onDetect={(raw) => void check(raw)}
              paused={busy}
              className="aspect-square w-full overflow-hidden rounded-2xl sm:aspect-video"
            />
            <Button variant="ghost" block onClick={() => setScan(false)}>
              قفل الكاميرا
            </Button>
          </>
        ) : (
          <Button variant="primary" size="lg" icon="scan" block onClick={() => setScan(true)}>
            افتح الكاميرا
          </Button>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim()) void check(typed.trim()).then(() => setTyped(""));
          }}
        >
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="أو اكتب كود الكارنيه أو رقم العضو"
            aria-label="كود الكارنيه"
            dir="ltr"
            className="flex-1"
          />
          <Button type="submit" disabled={!typed.trim() || busy}>
            افحص
          </Button>
        </form>
      </Card>
    </>
  );
}
