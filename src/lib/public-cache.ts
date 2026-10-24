/**
 * Anonymous reads from Supabase for the public site (content, settings, the impact numbers), kept in
 * the tab for a few minutes. Moving between pages then reuses what the last page loaded instead of
 * asking the database again, and two parts of one page asking for the same thing share one request.
 * Each page still has its build-time copy, so a change the team publishes shows up within the TTL.
 */
import { SUPABASE_KEY, SUPABASE_URL } from "./supabase-public";

const TTL = 3 * 60_000;
const PREFIX = "bx_pc:";
const inflight = new Map<string, Promise<unknown>>();

function read<T>(key: string, ttl: number): T | undefined {
  try {
    const c = JSON.parse(sessionStorage.getItem(PREFIX + key) ?? "null") as { at: number; v: T } | null;
    if (c && Date.now() - c.at < ttl) return c.v;
  } catch {
    /* storage blocked */
  }
  return undefined;
}

function write(key: string, v: unknown) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), v }));
  } catch {
    /* full or blocked: the next page just asks again */
  }
}

/** GET `rest/v1/<path>`, or POST `rest/v1/rpc/<name>` with no arguments when `rpc` is set. Throws on an HTTP error. */
export function publicGet<T>(path: string, { rpc = false, ttl = TTL }: { rpc?: boolean; ttl?: number } = {}): Promise<T> {
  const key = (rpc ? "rpc/" : "") + path;
  const hit = read<T>(key, ttl);
  if (hit !== undefined) return Promise.resolve(hit);
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = fetch(`${SUPABASE_URL}/rest/v1/${key}`, {
    method: rpc ? "POST" : "GET",
    headers: { apikey: SUPABASE_KEY, Accept: "application/json", ...(rpc ? { "Content-Type": "application/json" } : {}) },
    body: rpc ? "{}" : undefined,
  })
    .then(async (r) => {
      if (!r.ok) throw new Error(`public_${r.status}`);
      const v = (await r.json()) as T;
      write(key, v);
      return v;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
