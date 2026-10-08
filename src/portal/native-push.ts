"use client";
/**
 * Notifications in the BuildX HUE store app (FCM on Android, APNs on iPhone). The phone hands us a
 * device token, which we register for the signed-in student or team member; push-deliver and
 * send-push deliver to it. Tapping a notification opens its screen.
 *
 * Push only works once the store build carries the Firebase file (Android) or the push entitlement
 * (iPhone): the Mobile apps workflow writes /app/push.json then, and without it the app never asks,
 * so an unconfigured build can't crash on a missing Firebase setup.
 */
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { APP_PATH, isNative, rpc, studentRpc } from "./core";

type Permission = "granted" | "denied" | "prompt" | "prompt-with-rationale";
type Push = {
  checkPermissions(): Promise<{ receive: Permission }>;
  requestPermissions(): Promise<{ receive: Permission }>;
  register(): Promise<void>;
  addListener(e: "registration", cb: (t: { value: string }) => void): Promise<PluginListenerHandle>;
  addListener(e: "registrationError", cb: (err: { error: string }) => void): Promise<PluginListenerHandle>;
  addListener(e: "pushNotificationActionPerformed", cb: (a: { notification: { data?: Record<string, unknown> } }) => void): Promise<PluginListenerHandle>;
};
const PushNotifications = registerPlugin<Push>("PushNotifications");

export type NativeState = "unsupported" | "denied" | "off" | "on";
export type Who = "student" | "staff";

const platform = (): "android" | "ios" => (/iphone|ipad|ipod|macintosh/i.test(navigator.userAgent) ? "ios" : "android");

let config: Promise<boolean> | null = null;
/** Is push set up in this build (for this phone's platform)? */
export function nativePushReady(): Promise<boolean> {
  if (!isNative()) return Promise.resolve(false);
  config ??= fetch(`${APP_PATH}push.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Partial<Record<"android" | "ios", boolean>>>) : null))
    .then((c) => c?.[platform()] === true)
    .catch(() => false);
  return config;
}

export async function nativePushState(): Promise<NativeState> {
  if (!(await nativePushReady())) return "unsupported";
  const { receive } = await PushNotifications.checkPermissions();
  return receive === "granted" ? "on" : receive === "denied" ? "denied" : "off";
}

/** Gets the device token from the phone (asks once) and registers it for this person. */
export async function enableNativePush(who: Who, ask = true): Promise<NativeState> {
  if (!(await nativePushReady())) return "unsupported";
  let { receive } = await PushNotifications.checkPermissions();
  if (receive !== "granted" && ask) receive = (await PushNotifications.requestPermissions()).receive;
  if (receive !== "granted") return receive === "denied" ? "denied" : "off";
  const token = await new Promise<string>((resolve, reject) => {
    const handles: Promise<PluginListenerHandle>[] = [];
    const done = () => handles.forEach((h) => h.then((x) => x.remove()).catch(() => undefined));
    const timer = setTimeout(() => (done(), reject(new Error("push_timeout"))), 15000);
    handles.push(PushNotifications.addListener("registration", (t) => (clearTimeout(timer), done(), resolve(t.value))));
    handles.push(PushNotifications.addListener("registrationError", (e) => (clearTimeout(timer), done(), reject(new Error(e.error)))));
    PushNotifications.register().catch(reject);
  });
  const out =
    who === "student"
      ? await studentRpc<{ ok: boolean }>("push_native_student", { p_device: token, p_platform: platform() })
      : await rpc<{ ok: boolean }>("push_native_staff", { p_device: token, p_platform: platform() });
  if (!out.ok) throw new Error("subscribe_failed");
  return "on";
}

let listening = false;
/** Tapping a notification opens its screen (its "route", e.g. /me/quizzes). Call once at start. */
export function listenForNotificationTaps() {
  if (listening || !isNative()) return;
  listening = true;
  nativePushReady().then((ready) => {
    if (!ready) return;
    PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
      const route = notification.data?.route;
      if (typeof route === "string" && route.startsWith("/")) window.location.hash = route;
    }).catch(() => undefined);
  });
}
