"use client";
/**
 * Students check themselves in (20261008110000_self_checkin.sql): the coach puts a QR on the
 * projector that changes every 30 seconds, students scan it from the BuildX HUE app.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { APP_PATH, errorText, feedback, fmt, publicOrigin, rpc, studentRpc, type Session } from "./core";
import { Scanner } from "./scanner";
import { Button, Card, Icon, TopBar, go, toast } from "./ui";

type Qr = { ok: boolean; error?: string; window: number; code: string; next_in: number; count: number };

export const checkinUrl = (session: string, window: number, code: string) => `${publicOrigin()}${APP_PATH}#/me/checkin?s=${session}&w=${window}&c=${code}`;

/** Reads a scanned check-in QR (the URL above); null for anything else. */
export function parseCheckin(raw: string): { s: string; w: number; c: string } | null {
  const hash = raw.includes("#") ? raw.slice(raw.indexOf("#") + 1) : raw;
  const q = new URLSearchParams(hash.split("?")[1] ?? "");
  const s = q.get("s") ?? "";
  const w = Number(q.get("w"));
  const c = q.get("c") ?? "";
  if (!/^\/me\/checkin/.test(hash) || !/^[0-9a-f-]{36}$/i.test(s) || !Number.isFinite(w) || !/^[0-9a-f]{12}$/.test(c)) return null;
  return { s, w, c };
}

/** Staff: full-screen QR for the projector. */
export function SelfCheckinScreen({ session, onClose }: { session: Session; onClose: () => void }) {
  const [qr, setQr] = useState<Qr | null>(null);
  const [img, setImg] = useState("");
  const [left, setLeft] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(async () => {
    try {
      const r = await rpc<Qr>("staff_checkin_qr", { p_session: session.id });
      if (!r.ok) {
        setError(r.error === "closed" ? "الجلسة مقفولة. افتحها الأول." : "الجلسة مش موجودة.");
        return;
      }
      setError(null);
      setQr(r);
      const QRCode = (await import("qrcode")).default;
      setImg(await QRCode.toDataURL(checkinUrl(session.id, r.window, r.code), { margin: 1, width: 900, errorCorrectionLevel: "M", color: { dark: "#081634", light: "#ffffff" } }));
      clearTimeout(timer.current);
      timer.current = setTimeout(load, Math.max(1, r.next_in) * 1000 + 300);
    } catch (e) {
      setError(errorText(e));
      clearTimeout(timer.current);
      timer.current = setTimeout(load, 5000);
    }
  }, [session.id]);

  useEffect(() => {
    load();
    return () => clearTimeout(timer.current);
  }, [load]);
  useEffect(() => {
    if (!qr) return;
    const started = Date.now();
    const tick = () => setLeft(Math.max(0, Math.ceil(qr.next_in - (Date.now() - started) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [qr]);

  const stop = async () => {
    await rpc("staff_checkin_stop", { p_session: session.id }).catch(() => undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-abyss px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] text-center">
      <div>
        <p className="text-sm text-fog">امسح الكود من تطبيق BuildX HUE ← سجّل حضوري</p>
        <h1 className="mt-1 text-2xl font-bold text-chalk sm:text-4xl">{session.title}</h1>
      </div>
      {error ? (
        <Card className="max-w-sm border-danger/30 text-[#ff9aa5]">{error}</Card>
      ) : (
        <div className="rounded-[2rem] bg-white p-4 shadow-[0_30px_80px_-30px_rgb(43_109_255/0.9)]">
          {img ? <img src={img} alt="QR تسجيل الحضور" className="aspect-square w-[min(78vw,62vh)]" /> : <span className="block aspect-square w-[min(78vw,62vh)]" />}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#081634]/10">
            <div className="h-full rounded-full bg-[#2b6dff] transition-[width] duration-200" style={{ width: `${(left / 30) * 100}%` }} />
          </div>
        </div>
      )}
      <div className="flex items-center gap-6 text-mist">
        <span className="flex items-center gap-2">
          <Icon name="users" size={20} className="text-cyan" />
          <span className="font-mono text-2xl font-bold text-chalk">{qr?.count ?? "…"}</span> سجّلوا
        </span>
        <span className="text-sm text-fog">الكود بيتغيّر كل 30 ثانية</span>
      </div>
      <Button variant="danger" icon="close" onClick={stop}>
        إيقاف التسجيل الذاتي
      </Button>
    </div>
  );
}

type Result = { result: "marked" | "already" | "closed" | "expired" | "invalid" | "wrong_group" | "no_session" | "rate_limited"; title?: string; status?: "present" | "late"; at?: string; group?: string };

const MESSAGES: Record<Result["result"], string> = {
  marked: "اتسجّل حضورك",
  already: "حضورك متسجّل من قبل",
  closed: "التسجيل الذاتي مقفول للجلسة دي. كلّم المدرب.",
  expired: "الكود ده قديم. امسح الكود اللي على الشاشة دلوقتي.",
  invalid: "الكود ده مش صحيح.",
  wrong_group: "الجلسة دي لمجموعة تانية.",
  no_session: "الجلسة دي مش موجودة.",
  rate_limited: "محاولات كتير. استنى شوية وجرّب تاني.",
};

/** /me/checkin — scanner, or straight to the result when opened from a scanned link. */
export function StudentCheckin({ query, onMarked }: { query: URLSearchParams; onMarked?: () => void }) {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const sent = useRef(false);

  const submit = useCallback(async (p: { s: string; w: number; c: string }) => {
    if (sent.current) return;
    sent.current = true;
    setBusy(true);
    try {
      const r = await studentRpc<Result>("student_self_checkin", { p_session: p.s, p_window: p.w, p_code: p.c });
      setResult(r);
      feedback(r.result === "marked" || r.result === "already" ? "ok" : "error");
      if (r.result === "marked") onMarked?.();
    } catch (e) {
      toast(errorText(e), "error");
      sent.current = false;
    } finally {
      setBusy(false);
    }
  }, [onMarked]);

  useEffect(() => {
    const p = parseCheckin(`#/me/checkin?${query.toString()}`);
    if (p) submit(p);
  }, [query, submit]);

  const onDetect = (raw: string) => {
    const p = parseCheckin(raw);
    if (p) submit(p);
    else toast("ده مش كود الحضور. امسح الكود اللي على شاشة المدرب.", "error");
  };

  const good = result?.result === "marked" || result?.result === "already";
  return (
    <>
      <TopBar title="سجّل حضوري" sub="امسح الكود اللي على شاشة المدرب" back="/me" />
      {result ? (
        <Card className={good ? "grid justify-items-center gap-3 border-ok/30 py-8 text-center" : "grid justify-items-center gap-3 border-danger/30 py-8 text-center"}>
          <span className={good ? "flex size-16 items-center justify-center rounded-full bg-ok/15 text-ok" : "flex size-16 items-center justify-center rounded-full bg-danger/15 text-[#ff9aa5]"}>
            <Icon name={good ? "check" : "alert"} size={34} />
          </span>
          <p className="text-xl font-bold text-chalk">{MESSAGES[result.result]}</p>
          {result.title && <p className="text-mist">{result.title}</p>}
          {good && result.status && (
            <p className="text-sm text-fog">
              {result.status === "late" ? "متأخر" : "حاضر"}
              {result.at ? ` · ${fmt.time(result.at)}` : ""}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            {!good && (
              <Button
                onClick={() => {
                  sent.current = false;
                  setResult(null);
                  go("/me/checkin", true);
                }}
              >
                امسح تاني
              </Button>
            )}
            <Button variant="primary" onClick={() => go("/me")}>
              الرئيسية
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3">
          <Scanner onDetect={onDetect} paused={busy} />
          <p className="text-center text-xs leading-relaxed text-fog">الكود بيتغيّر كل 30 ثانية، فلازم تمسحه وانت في القاعة.</p>
        </div>
      )}
    </>
  );
}

/** Student home: the button that opens the scanner. */
export function CheckinCard() {
  return (
    <a href="#/me/checkin" className="mt-3 flex items-center gap-4 rounded-3xl border border-volt/40 bg-gradient-to-l from-[#1f57e6] to-[#0c2f8a] p-5">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white">
        <Icon name="scan" size={28} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold text-white">سجّل حضوري</span>
        <span className="block text-sm text-white/75">امسح الكود اللي على شاشة المدرب</span>
      </span>
      <Icon name="chevron" size={18} className="rotate-180 text-white/80" />
    </a>
  );
}
