"use client";
/**
 * Face ID / fingerprint lock for team members in the BuildX HUE app: when it's on, the app asks for the owner's
 * biometrics when it opens and when it comes back after a minute in the background. It guards the
 * signed-in team session on a lost or borrowed phone; it is per device and off by default.
 */
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { isNative, sb } from "./core";
import { BrandLine } from "./shell";
import { Button, Icon, Toggle, toast } from "./ui";

type Available = { isAvailable: boolean; biometryType: number };
const NativeBiometric = registerPlugin<{
  isAvailable(o?: { useFallback?: boolean }): Promise<Available>;
  verifyIdentity(o: { reason?: string; title?: string; subtitle?: string; negativeButtonText?: string; useFallback?: boolean }): Promise<void>;
}>("NativeBiometric");
const App = registerPlugin<{ addListener(e: "appStateChange", cb: (s: { isActive: boolean }) => void): Promise<PluginListenerHandle> }>("App");

const KEY = "rh-bio-lock";
const AWAY_MS = 60_000;

const enabled = () => {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
};

export const biometricSupported = () => isNative();

async function verify() {
  await NativeBiometric.verifyIdentity({ reason: "افتح BuildX HUE", title: "BuildX HUE", subtitle: "افتح التطبيق ببصمتك", negativeButtonText: "إلغاء", useFallback: true });
}

/** Wraps the staff app: shows the lock screen until the person unlocks it. */
export function BiometricGate({ active, children }: { active: boolean; children: ReactNode }) {
  const [locked, setLocked] = useState(() => active && biometricSupported() && enabled());
  const hiddenAt = useRef<number | null>(null);
  const prompting = useRef(false);

  const unlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    try {
      await verify();
      setLocked(false);
    } catch {
      /* cancelled or failed: stay locked, the button tries again */
    } finally {
      prompting.current = false;
    }
  }, []);

  useEffect(() => {
    if (!active || !biometricSupported()) return;
    if (locked) unlock();
    let handle: PluginListenerHandle | undefined;
    App.addListener("appStateChange", ({ isActive }) => {
      if (!enabled()) return;
      if (!isActive) hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > AWAY_MS) {
        setLocked(true);
        unlock();
      }
    })
      .then((h) => (handle = h))
      .catch(() => undefined);
    return () => {
      handle?.remove();
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!locked || !active) return <>{children}</>;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-abyss px-6 text-center">
      <BrandLine />
      <span className="flex size-20 items-center justify-center rounded-3xl bg-volt/15 text-cyan">
        <Icon name="lock" size={40} />
      </span>
      <p className="text-lg font-semibold text-chalk">التطبيق مقفول</p>
      <Button variant="primary" size="lg" icon="key" onClick={unlock}>
        افتح ببصمتك
      </Button>
      <button type="button" className="text-sm text-fog underline-offset-4 hover:underline" onClick={() => sb().auth.signOut()}>
        خروج وتسجيل دخول بكلمة المرور
      </button>
    </div>
  );
}

/** Account screen toggle (team app on a phone with biometrics only). */
export function BiometricToggle() {
  const [available, setAvailable] = useState(false);
  const [on, setOn] = useState(enabled);
  useEffect(() => {
    if (!biometricSupported()) return;
    NativeBiometric.isAvailable({ useFallback: true })
      .then((r) => setAvailable(r.isAvailable))
      .catch(() => setAvailable(false));
  }, []);
  if (!available) return null;
  const change = async (v: boolean) => {
    try {
      // Turning it on proves the lock works on this phone before relying on it.
      if (v) await verify();
      localStorage.setItem(KEY, v ? "on" : "off");
      setOn(v);
      toast(v ? "اتفعّل القفل بالبصمة" : "اتلغى القفل بالبصمة");
    } catch {
      toast("مقدرناش نتأكد من البصمة", "error");
    }
  };
  return <Toggle checked={on} onChange={change} label="قفل التطبيق بالبصمة أو Face ID" hint="بيطلبها لما تفتح التطبيق أو ترجعله بعد دقيقة." />;
}
