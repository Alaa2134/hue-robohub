"use client";
/** Settings (language, motion) and the profile (sign-in, own numbers, sign-out). */
import { useEffect, useState } from "react";
import { meStore, projects, signOut } from "../api";
import { useLang } from "../i18n";
import { BASE, navigate } from "../router";
import { Button, Card, toast } from "../ui";
import { SignInPanel } from "./signin";

const MOTION_KEY = "bx-lab-motion";

export function SettingsPage() {
  const { t, lang, setLang } = useLang();
  const [motion, setMotion] = useState<"auto" | "reduce">("auto");
  useEffect(() => {
    try {
      setMotion(localStorage.getItem(MOTION_KEY) === "reduce" ? "reduce" : "auto");
    } catch {
      /* default */
    }
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("bx-reduce-motion", motion === "reduce");
  }, [motion]);
  return (
    <div className="grid max-w-2xl gap-6">
      <h1 className="font-display text-2xl font-bold">{t("navSettings")}</h1>
      <Card className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <span>{t("language")}</span>
          <div className="flex gap-2">
            <Button size="sm" variant={lang === "ar" ? "primary" : "soft"} onClick={() => setLang("ar")}>
              العربية
            </Button>
            <Button size="sm" variant={lang === "en" ? "primary" : "soft"} onClick={() => setLang("en")}>
              English
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p>{t("motion")}</p>
            <p className="text-xs text-fog">{t("motionNote")}</p>
          </div>
          <input
            type="checkbox"
            className="size-5 accent-volt"
            checked={motion === "reduce"}
            onChange={(e) => {
              const v = e.target.checked ? "reduce" : "auto";
              setMotion(v);
              try {
                localStorage.setItem(MOTION_KEY, v);
              } catch {
                /* this visit only */
              }
            }}
          />
        </div>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">{t("licenses")}</h2>
        <p className="text-sm leading-relaxed text-fog">
          AVR GCC and GNU binutils (GPL v3) compiled to WebAssembly by @horang-corp/avr-gcc-wasm; avr-libc (BSD); Arduino AVR core and libraries (LGPL); avr8js (MIT); CodeMirror (MIT).{" "}
          <a className="text-cyan underline" href={`${BASE}/lab/NOTICE.txt`}>
            NOTICE
          </a>
        </p>
      </Card>
    </div>
  );
}

export function ProfilePage() {
  const { t } = useLang();
  const me = meStore.use();
  const local = projects.localCount();
  if (!me)
    return (
      <div className="grid gap-6">
        <h1 className="font-display text-2xl font-bold">{t("signIn")}</h1>
        <SignInPanel onDone={() => navigate("")} />
      </div>
    );
  return (
    <div className="grid max-w-2xl gap-6">
      <h1 className="font-display text-2xl font-bold">{t("navProfile")}</h1>
      <Card className="flex items-center gap-4">
        <span className="grid size-14 place-items-center rounded-full bg-volt/25 text-xl font-semibold text-ice">{me.name?.slice(0, 1)}</span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">{me.name}</p>
          <p className="text-sm text-fog">{me.kind === "student" ? t("studentLogin") : me.admin ? t("navAdmin") : "BuildX"}</p>
        </div>
        <Button variant="ghost" icon="x" onClick={() => void signOut().then(() => navigate(""))}>
          {t("signOut")}
        </Button>
      </Card>
      {local > 0 && (
        <Card className="flex items-center justify-between gap-4">
          <p className="text-sm">{local} · {t("savedLocal")}</p>
          <Button onClick={() => void projects.moveLocalToAccount().then((n) => toast(`${n} ✓`))}>{t("save")}</Button>
        </Card>
      )}
    </div>
  );
}
