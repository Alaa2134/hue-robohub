/**
 * BuildX 3D AI from the browser: everything goes through the ai3d_* database functions with the
 * public key. The wallet's secret key stays in this browser (localStorage); the database only keeps
 * its hash, so nothing here is trusted by the server.
 */
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

export type Pkg = { credits: number; price: number };
export type GalleryItem = { id: string; kind: "text" | "image"; prompt: string | null; style: string; glb: string; thumb: string | null };
export type Info = {
  enabled: boolean;
  packages: Pkg[];
  cost_text: number;
  cost_image: number;
  textured: boolean;
  pay_ar: string | null;
  pay_en: string | null;
  free_credits: number;
  made: number;
  gallery: GalleryItem[];
};
export type Job = {
  id: string;
  kind: "text" | "image";
  prompt: string | null;
  style: string;
  status: "queued" | "shaping" | "texturing" | "saving" | "done" | "failed";
  progress: number;
  glb: string | null;
  thumb: string | null;
  remote_glb: string | null;
  remote_thumb: string | null;
  error: string | null;
  credits: number;
  refunded: boolean;
  public: boolean;
  created_at: string;
  finished_at: string | null;
};
export type Topup = { id: string; credits: number; amount: number; method: string; status: "pending" | "approved" | "rejected"; note: string | null; created_at: string };
export type Me = { wallet: { code: string; name: string; phone: string; credits: number }; topups: Topup[]; jobs: Job[] };

export const DEFAULT_PACKAGES: Pkg[] = [
  { credits: 1, price: 60 },
  { credits: 5, price: 250 },
  { credits: 12, price: 500 },
];

export class Ai3dError extends Error {}

export async function rpc<T>(fn: string, body: Record<string, unknown> = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Ai3dError("network");
  }
  if (!r.ok) {
    const e = (await r.json().catch(() => null)) as { message?: string } | null;
    throw new Ai3dError(e?.message || "network");
  }
  return (await r.json()) as T;
}

export const getInfo = () => rpc<Info>("ai3d_info");

/** The models live in a public bucket behind random paths. */
export const modelUrl = (path: string | null | undefined) =>
  path ? `${SUPABASE_URL}/storage/v1/object/public/ai3d-models/${path.split("/").map(encodeURIComponent).join("/")}` : null;

/* ─── the wallet on this device ─────────────────────────────────────── */

const KEY = "bx-ai3d-wallet";
export type Saved = { token: string; code: string };
export function savedWallet(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    return v?.token?.length === 48 ? v : null;
  } catch {
    return null;
  }
}
export function saveWallet(v: Saved | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the session still works until the tab closes */
  }
}

type WalletOut = { ok: boolean; error?: string; token?: string; code?: string; credits?: number };
export async function createWallet(name: string, phone: string): Promise<Saved> {
  const r = await rpc<WalletOut>("ai3d_wallet_create", { p_name: name, p_phone: phone });
  if (!r.ok || !r.token || !r.code) throw new Ai3dError(r.error ?? "invalid");
  return { token: r.token, code: r.code };
}
export async function recoverWallet(code: string, phone: string): Promise<Saved> {
  const r = await rpc<WalletOut>("ai3d_wallet_recover", { p_code: code, p_phone: phone });
  if (!r.ok || !r.token || !r.code) throw new Ai3dError(r.error ?? "not_found");
  return { token: r.token, code: r.code };
}

export const getMe = (token: string) => rpc<Me>("ai3d_me", { p_token: token });

export async function generate(token: string, kind: "text" | "image", prompt: string, style: string, image: string | null): Promise<string> {
  const r = await rpc<{ ok: boolean; error?: string; id?: string }>("ai3d_generate", { p_token: token, p_kind: kind, p_prompt: prompt, p_style: style, p_image: image });
  if (!r.ok || !r.id) throw new Ai3dError(r.error ?? "invalid");
  return r.id;
}

export const share = (token: string, id: string, on: boolean) => rpc<boolean>("ai3d_share", { p_token: token, p_id: id, p_public: on });

/** Upload the receipt to the one-time path the database gives, then ask for the credits. */
export async function topUp(token: string, pkg: number, method: string, sender: string, receipt: File): Promise<void> {
  const path = await rpc<string>("ai3d_receipt_slot", { p_token: token });
  let up: Response;
  try {
    up = await fetch(`${SUPABASE_URL}/storage/v1/object/ai3d/${path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "x-upsert": "false", "Content-Type": receipt.type || "image/jpeg" },
      body: receipt,
    });
  } catch {
    throw new Ai3dError("network");
  }
  if (!up.ok) throw new Ai3dError("receipt");
  const r = await rpc<{ ok: boolean; error?: string }>("ai3d_topup", { p_token: token, p_package: pkg, p_method: method, p_sender: sender, p_receipt: path });
  if (!r.ok) throw new Ai3dError(r.error ?? "invalid");
}

/** A photo for image-to-3D: at most 1024 px, JPEG, as a data URL (what the database passes on). */
export async function photoDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Ai3dError("image");
  const s = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * s));
  c.height = Math.max(1, Math.round(bmp.height * s));
  const g = c.getContext("2d");
  if (!g) throw new Ai3dError("image");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL("image/jpeg", 0.88);
}

export const errorKey = (e: unknown) => (e instanceof Error ? e.message : "network");
