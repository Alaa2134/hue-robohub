"use server";

import { redirect } from "next/navigation";
import { runAction, type ActionResult } from "../action";
import { AppError } from "../auth/errors";
import { getActor } from "../auth/guard";
import {
  beginTotpEnrollment,
  changePassword,
  completeMfa,
  confirmTotpEnrollment,
  createOwner,
  disableTotp,
  isSetupComplete,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  setupSchema,
} from "../services/auth";
import { requestContext } from "../observability/request";

/** Only same-app Command Center paths are allowed as post-login destinations (no open redirects). */
function safeNext(raw: FormDataEntryValue | null): string {
  const v = typeof raw === "string" ? raw : "";
  return /^\/command(\/[\w\-/]*)?(\?[\w=&%-]*)?$/.test(v) ? v : "/command";
}

export async function setupAction(_prev: unknown, form: FormData): Promise<ActionResult> {
  const res = await runAction(async ({ req }) => {
    if (await isSetupComplete()) throw new AppError("FORBIDDEN", "Setup has already been completed.");
    const input = setupSchema.parse({
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
      confirm: form.get("confirm"),
    });
    await createOwner(input, req);
  });
  if (res.ok) redirect("/command?welcome=1");
  return res;
}

export async function loginAction(_prev: unknown, form: FormData): Promise<ActionResult<{ mfa: boolean }>> {
  const next = safeNext(form.get("next"));
  const res = await runAction(async ({ req }) => {
    const r = await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""), req);
    return { mfa: r.status === "mfa_required" };
  });
  if (res.ok && !res.data.mfa) redirect(next);
  return res;
}

export async function mfaAction(_prev: unknown, form: FormData): Promise<ActionResult> {
  const next = safeNext(form.get("next"));
  const res = await runAction(async ({ req }) => {
    await completeMfa(String(form.get("code") ?? ""), req);
  });
  if (res.ok) redirect(next);
  return res;
}

export async function logoutAction(): Promise<void> {
  const actor = await getActor();
  await logout(actor, await requestContext());
  redirect("/login?signed_out=1");
}

export async function forgotPasswordAction(_prev: unknown, form: FormData): Promise<ActionResult> {
  return runAction(async ({ req }) => {
    await requestPasswordReset(String(form.get("email") ?? ""), req);
  });
}

export async function resetPasswordAction(_prev: unknown, form: FormData): Promise<ActionResult> {
  const res = await runAction(async ({ req }) => {
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) throw new AppError("VALIDATION", "Passwords do not match.", { confirm: "Passwords do not match" });
    await resetPassword(String(form.get("token") ?? ""), password, req);
  });
  if (res.ok) redirect("/login?reset=1");
  return res;
}

export async function changePasswordAction(_prev: unknown, form: FormData): Promise<ActionResult> {
  return runAction(async ({ actor, req }) => {
    if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in.");
    const next = String(form.get("next") ?? "");
    if (next !== String(form.get("confirm") ?? "")) throw new AppError("VALIDATION", "Passwords do not match.", { confirm: "Passwords do not match" });
    await changePassword(actor, String(form.get("current") ?? ""), next, req);
  });
}

export async function beginMfaAction(): Promise<ActionResult<{ secret: string; uri: string; qr: string }>> {
  return runAction(async ({ actor }) => {
    if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in.");
    const { secret, uri } = await beginTotpEnrollment(actor);
    const QR = await import("qrcode");
    const qr = await QR.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#f3f7fd", light: "#00000000" } });
    return { secret, uri, qr };
  });
}

export async function confirmMfaAction(_prev: unknown, form: FormData): Promise<ActionResult> {
  return runAction(async ({ actor, req }) => {
    if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in.");
    await confirmTotpEnrollment(actor, String(form.get("code") ?? ""), req);
  });
}

export async function disableMfaAction(_prev: unknown, form: FormData): Promise<ActionResult> {
  return runAction(async ({ actor, req }) => {
    if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in.");
    await disableTotp(actor, String(form.get("password") ?? ""), req);
  });
}
