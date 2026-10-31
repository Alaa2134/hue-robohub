/** Talking to the studio API: the session (Supabase or local), requests, and the shapes that come back. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Timeline } from "@studio/core";
import { API_URL } from "./config.ts";

export type ServerConfig = {
  auth: "supabase" | "local";
  storage: "supabase" | "local";
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  limits: { maxUploadMb: number; projectStorageMb: number; monthlyRenderMinutes: number; maxRenderSeconds: number; allow4k: boolean };
  features: { ai: boolean };
  templates: { id: string; label: string; aspect: string; fps: number }[];
};

export type Me = { userId: string; email: string; role: "admin" | "editor"; usage: { renderSecondsThisMonth: number; renderMinutesLimit: number } };

export type ProjectSummary = { id: string; name: string; template: string | null; settings: Timeline["settings"]; timelineVersion: number; createdAt: string; updatedAt: string; thumb: string | null; assets: number };
export type Project = { id: string; name: string; template: string | null; timeline: Timeline; timelineVersion: number; storage: { usedBytes: number; quotaBytes: number } };

export type Asset = {
  id: string;
  kind: "video" | "image" | "audio" | "font";
  name: string;
  mime: string;
  size: number;
  status: "uploading" | "processing" | "ready" | "failed";
  error: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasAudio: boolean;
  codec: string | null;
  waveform: number[] | null;
  url: string | null;
  thumb: string | null;
  preview: string | null;
  createdAt: string;
};

export type Render = {
  id: string;
  status: "queued" | "rendering" | "uploading" | "done" | "failed" | "cancelled";
  cancelRequested: boolean;
  progress: number;
  settings: { width: number; height: number; fps: number; quality: string; name?: string };
  duration: number;
  estimate: { cpuSeconds: number; wallSeconds: number } | null;
  size: number | null;
  error: string | null;
  attempt: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type UploadTarget = { endpoint: string; auth: "session" | "ticket"; headers: Record<string, string>; metadata: Record<string, string>; chunkSize: number };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

let serverConfig: ServerConfig | null = null;
let supabase: SupabaseClient | null = null;
const LOCAL_KEY = "studio.session";

export async function loadServerConfig(): Promise<ServerConfig> {
  if (serverConfig) return serverConfig;
  if (!API_URL) throw new ApiError(0, "no_api", "no_api");
  const res = await fetch(`${API_URL}/config`).catch(() => null);
  if (!res?.ok) throw new ApiError(0, "سيرفر الاستوديو مش بيرد دلوقتي.", "offline");
  serverConfig = (await res.json()) as ServerConfig;
  if (serverConfig.auth === "supabase" && serverConfig.supabaseUrl && serverConfig.supabaseAnonKey)
    supabase = createClient(serverConfig.supabaseUrl, serverConfig.supabaseAnonKey, { auth: { persistSession: true, storageKey: "buildx-studio-auth" } });
  return serverConfig;
}

export async function token(): Promise<string | null> {
  if (supabase) return (await supabase.auth.getSession()).data.session?.access_token ?? null;
  try {
    return sessionStorage.getItem(LOCAL_KEY);
  } catch {
    return null;
  }
}

export async function signIn(email: string, password: string) {
  const cfg = await loadServerConfig();
  if (cfg.auth === "supabase") {
    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) throw new ApiError(401, error.message === "Invalid login credentials" ? "الإيميل أو الباسورد غلط." : error.message, "bad_login");
    return;
  }
  const r = await api<{ token: string }>("POST", "/auth/local/login", { email, password }, false);
  sessionStorage.setItem(LOCAL_KEY, r.token);
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
  try {
    sessionStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignore */
  }
}

export async function api<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (auth) {
    const t = await token();
    if (t) headers.authorization = `Bearer ${t}`;
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "مفيش اتصال بسيرفر الاستوديو.", "offline");
  }
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new ApiError(res.status, String(json.error ?? `Error ${res.status}`), String(json.code ?? "error"), json);
  return json as T;
}

export const fmtBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : n < 1024 ** 3 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`);
export const fmtTime = (s: number, fps?: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const base = `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return fps ? `${base}:${String(Math.floor((s % 1) * fps)).padStart(2, "0")}` : base;
};
