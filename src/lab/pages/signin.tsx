"use client";
/** Signing in to the Lab: students with their code and PIN here; team members through the BuildX App. */
import { useState } from "react";
import { projects, studentSignIn } from "../api";
import { useLang } from "../i18n";
import { BASE } from "../router";
import { Button, Card, Input, toast } from "../ui";

export function SignInPanel({ onDone }: { onDone?: () => void }) {
  const { t } = useLang();
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <h2 className="mb-1 text-lg font-semibold">{t("studentLogin")}</h2>
        <p className="mb-4 text-sm text-fog">{t("guestNote")}</p>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr("");
            const r = await studentSignIn(code, pin);
            setBusy(false);
            if (!r.ok) {
              setErr(r.error === "locked" || r.error === "rate_limited" ? t("locked") : t("wrongLogin"));
              return;
            }
            const local = projects.localCount();
            if (local > 0) {
              const n = await projects.moveLocalToAccount().catch(() => 0);
              if (n) toast(`${n} → ${t("navProjects")}`);
            }
            onDone?.();
          }}
        >
          <label className="grid gap-1 text-sm">
            {t("studentCode")}
            <Input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="username" dir="ltr" required />
          </label>
          <label className="grid gap-1 text-sm">
            {t("pin")}
            <Input value={pin} onChange={(e) => setPin(e.target.value)} type="password" inputMode="numeric" autoComplete="current-password" dir="ltr" required />
          </label>
          {err && <p className="text-sm text-danger">{err}</p>}
          <Button type="submit" variant="primary" disabled={busy}>
            {t("signIn")}
          </Button>
        </form>
      </Card>
      <Card className="flex flex-col justify-between gap-4">
        <p className="text-sm leading-relaxed text-mist">{t("teamLogin")}</p>
        <a href={`${BASE}/app/`} className="inline-flex h-10 items-center justify-center rounded-lg bg-panel px-4 text-sm ring-1 ring-rim hover:bg-panel-2">
          {t("openApp")}
        </a>
      </Card>
    </div>
  );
}
