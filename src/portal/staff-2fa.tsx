"use client";
/**
 * Two-factor sign-in for staff (authenticator app codes). Once a staff member adds an authenticator,
 * the database only honours their staff permissions after the 6-digit code check (see migration
 * 20261007140000_staff_two_factor.sql); owners/admins can require it for the whole team.
 */
import { useEffect, useState, type FormEvent } from "react";
import { isFull, asciiDigits, errorText, must, rpc, sb, type StaffRow } from "./core";
import { BrandLine } from "./shell";
import { Badge, Button, Card, Empty, ErrorBox, Field, IconButton, Input, List, Loading, Row, Section, Toggle, TopBar, confirmDialog, copyText, toast, useAsync } from "./ui";

export type MfaGateMode = "challenge" | "enroll";

/** What the signed-in staff member still needs before the dashboard: a code check, setting up an authenticator, or nothing. */
export async function mfaNeeded(): Promise<MfaGateMode | null> {
  const { data, error } = await sb().auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return null;
  if (data.currentLevel === "aal2") return null;
  if (data.nextLevel === "aal2") return "challenge";
  const r = (await sb().from("site_settings").select("value").eq("key", "security").maybeSingle()) as { data: { value: { require_2fa?: boolean } } | null };
  return r.data?.value?.require_2fa ? "enroll" : null;
}

const codeOk = (c: string) => /^\d{6}$/.test(c);


function CodeInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(asciiDigits(e.target.value).replace(/\D/g, "").slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      dir="ltr"
      placeholder="000000"
      maxLength={6}
      autoFocus={autoFocus}
      className="text-center font-mono text-2xl tracking-[0.5em]"
    />
  );
}

/** Adding an authenticator: QR code (or the key typed by hand), then the first code to confirm it. */
function Enroll({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Drop half-finished set-ups from earlier tries; they block a new one with the same name.
        const list = await sb().auth.mfa.listFactors();
        for (const old of list.data?.all ?? []) if (old.status === "unverified") await sb().auth.mfa.unenroll({ factorId: old.id });
        const { data, error } = await sb().auth.mfa.enroll({ factorType: "totp", friendlyName: `BuildX ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, issuer: "BuildX HUE" });
        if (error) throw error;
        // Draw the QR ourselves from the otpauth:// link (no third-party image, works in every browser).
        const QR = await import("qrcode");
        const qr = await QR.toDataURL(data.totp.uri, { margin: 1, width: 400, errorCorrectionLevel: "M" });
        if (alive) setF({ id: data.id, qr, secret: data.totp.secret });
      } catch (e) {
        if (alive) setErr(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (!f || !codeOk(code)) return;
    setBusy(true);
    try {
      const { error } = await sb().auth.mfa.challengeAndVerify({ factorId: f.id, code });
      if (error) throw error;
      toast("التحقق بخطوتين اشتغل ✓");
      onDone();
    } catch {
      toast("الكود غلط أو خلص وقته — اكتب الكود اللي ظاهر دلوقتي في التطبيق", "error");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  if (err) return <ErrorBox error={err} />;
  if (!f) return <Loading />;
  return (
    <form onSubmit={verify} className="grid gap-4">
      <ol className="grid list-decimal gap-1 ps-5 text-sm leading-relaxed text-mist">
        <li>نزّل تطبيق Google Authenticator أو Microsoft Authenticator على موبايلك.</li>
        <li>اضغط «+» وامسح الكود ده (أو اكتب المفتاح بإيدك).</li>
        <li>اكتب الأرقام الستة اللي هتظهر.</li>
      </ol>
      <div className="mx-auto rounded-2xl bg-white p-3">
        <img src={f.qr} alt="QR code للتحقق بخطوتين" width={200} height={200} className="size-[200px]" />
      </div>
      <button type="button" onClick={() => copyText(f.secret)} className="mx-auto break-all rounded-xl border border-[var(--line-2)] px-3 py-2 font-mono text-xs text-mist" dir="ltr">
        {f.secret}
      </button>
      <Field label="الكود من التطبيق">
        <CodeInput value={code} onChange={setCode} />
      </Field>
      <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!codeOk(code)}>
        تأكيد وتشغيل
      </Button>
    </form>
  );
}

/** Full-screen step between the password and the dashboard. */
export function MfaGate({ mode, email, onDone }: { mode: MfaGateMode; email: string; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (!codeOk(code)) return;
    setBusy(true);
    try {
      const { data } = await sb().auth.mfa.listFactors();
      const factor = data?.totp?.[0];
      if (!factor) throw new Error("no factor");
      const { error } = await sb().auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (error) throw error;
      onDone();
    } catch {
      toast("الكود غلط أو خلص وقته — جرّب الكود اللي ظاهر دلوقتي", "error");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-abyss bg-[radial-gradient(100%_55%_at_50%_0%,rgb(43_109_255/0.18),transparent_65%)] px-4 pb-10 pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-md items-center justify-between">
        <BrandLine />
        <button type="button" onClick={() => sb().auth.signOut()} className="text-sm text-mist hover:text-chalk">
          خروج
        </button>
      </div>
      <div className="mx-auto mt-8 w-full max-w-md">
        <h1 className="text-[26px] font-bold leading-tight text-chalk">{mode === "challenge" ? "كود التحقق" : "فعّل التحقق بخطوتين"}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-mist">
          {mode === "challenge" ? (
            <>
              افتح تطبيق المصادقة على موبايلك واكتب الكود بتاع <span dir="ltr">{email}</span>.
            </>
          ) : (
            "المالك فعّل التحقق بخطوتين لكل الفريق. ظبّطه مرة واحدة وبعدها هتكتب كود من موبايلك مع كل تسجيل دخول."
          )}
        </p>
        <Card className="mt-6">
          {mode === "challenge" ? (
            <form onSubmit={verify} className="grid gap-4">
              <CodeInput value={code} onChange={setCode} autoFocus />
              <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!codeOk(code)}>
                دخول
              </Button>
              <p className="text-xs leading-relaxed text-fog">ضيّعت موبايلك؟ كلّم المالك يشيل التحقق من حسابك من لوحة Supabase (Authentication ← Users).</p>
            </form>
          ) : (
            <Enroll onDone={onDone} />
          )}
        </Card>
      </div>
    </div>
  );
}

type Overview = { require: boolean; staff: { user_id: string; name: string; role: string; factors: number }[] };

/** BuildX App → More → التحقق بخطوتين: own authenticators, and the team-wide switch for owners/admins. */
export function TwoFactorScreen({ me }: { me: StaffRow }) {
  const admin = isFull(me);
  const mine = useAsync(async () => {
    const { data, error } = await sb().auth.mfa.listFactors();
    if (error) throw error;
    return data.totp;
  }, []);
  const team = useAsync(async () => (admin ? await rpc<Overview>("staff_mfa_overview") : null), [admin]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async (id: string) => {
    const last = (mine.data?.length ?? 0) <= 1;
    if (!(await confirmDialog({ title: "شيل جهاز التحقق؟", body: last ? "ده آخر جهاز — حسابك هيرجع يدخل بكلمة المرور بس." : "الجهاز ده مش هيقدر يدخل بعد كده.", ok: "شيل", danger: true }))) return;
    try {
      const { error } = await sb().auth.mfa.unenroll({ factorId: id });
      if (error) throw error;
      toast("اتشال");
      mine.reload();
      team.reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  const setRequire = async (on: boolean) => {
    if (on && !(mine.data?.length ?? 0)) return toast("فعّل التحقق على حسابك الأول", "error");
    if (on && !(await confirmDialog({ title: "إجبار كل الفريق؟", body: "أي حد في الفريق من غير تطبيق مصادقة هيتطلب منه يظبطه قبل ما يفتح الداشبورد.", ok: "إجبار" }))) return;
    setBusy(true);
    try {
      await sb().from("site_settings").upsert({ key: "security", value: { require_2fa: on } }).then(must);
      toast(on ? "التحقق بخطوتين بقى إجباري للفريق" : "التحقق بخطوتين بقى اختياري");
      team.reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar title="التحقق بخطوتين" sub="كود من موبايلك مع كلمة المرور" back="/staff/more" />
      <p className="text-sm leading-relaxed text-mist">لو حد عرف كلمة المرور بتاعتك، مش هيقدر يدخل من غير الكود اللي على موبايلك. بيتغيّر كل 30 ثانية.</p>

      <Section title="أجهزتك">
        {mine.loading && !mine.data ? (
          <Loading />
        ) : mine.error ? (
          <ErrorBox error={mine.error} retry={mine.reload} />
        ) : adding ? (
          <Card>
            <Enroll
              onDone={() => {
                setAdding(false);
                mine.reload();
                team.reload();
              }}
            />
            <Button variant="ghost" block className="mt-2" onClick={() => setAdding(false)}>
              إلغاء
            </Button>
          </Card>
        ) : (
          <>
            {mine.data?.length ? (
              <List>
                {mine.data.map((f) => (
                  <Row key={f.id}>
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-chalk">{f.friendly_name || "تطبيق مصادقة"}</p>
                        <p className="text-xs text-fog">اتضاف {new Date(f.created_at).toLocaleDateString("ar-EG")}</p>
                      </div>
                      <Badge tone="ok">شغّال</Badge>
                      <IconButton icon="trash" label="شيل" onClick={() => remove(f.id)} />
                    </div>
                  </Row>
                ))}
              </List>
            ) : (
              <Empty icon="shield" title="التحقق بخطوتين مقفول" body="فعّله عشان تحمي الداشبورد وبيانات الطلاب." />
            )}
            <Button variant={mine.data?.length ? "ghost" : "primary"} icon="plus" block className="mt-3" onClick={() => setAdding(true)}>
              {mine.data?.length ? "ضيف جهاز احتياطي" : "فعّل التحقق بخطوتين"}
            </Button>
          </>
        )}
      </Section>

      {admin && team.data && (
        <Section title="الفريق">
          <Card className="grid gap-3">
            <Toggle checked={team.data.require} disabled={busy} onChange={setRequire} label="إجباري لكل الفريق" hint="اللي معندوش هيتطلب منه يظبطه أول ما يدخل." />
          </Card>
          <List className="mt-3">
            {team.data.staff.map((s) => (
              <Row key={s.user_id}>
                <div className="flex items-center gap-3">
                  <p className="min-w-0 flex-1 truncate text-chalk">{s.name}</p>
                  <Badge tone={s.factors ? "ok" : "warn"}>{s.factors ? "مفعّل" : "مش مفعّل"}</Badge>
                </div>
              </Row>
            ))}
          </List>
        </Section>
      )}
    </>
  );
}
