#!/usr/bin/env node
/**
 * Fingerprint of everything the static site pre-renders from Supabase (published members, their
 * projects and website content). The deploy workflow rebuilds on a schedule only when it changes.
 *
 *   node scripts/content-version.mjs            → prints the fingerprint ("unknown" if Supabase is unreachable)
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const src = readFileSync(path.resolve(import.meta.dirname, "../src/lib/supabase-public.ts"), "utf8");
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || src.match(/"(https:\/\/[a-z0-9]+\.supabase\.co)"/)[1]).replace(/\/+$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_KEY || src.match(/"(sb_publishable_[A-Za-z0-9_-]+)"/)[1];

const QUERIES = [
  "site_content?select=id,slug,kind,updated_at&published=eq.true&order=id",
  "team_profiles?select=*&published=eq.true&order=id",
  "team_projects?select=*&order=id",
];

export async function contentVersion() {
  const h = createHash("sha256");
  for (const q of QUERIES) {
    const r = await fetch(`${url}/rest/v1/${q}`, { headers: { apikey: key, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`${q.split("?")[0]}: HTTP ${r.status}`);
    h.update(q).update(await r.text());
  }
  return h.digest("hex").slice(0, 32);
}

if (import.meta.url === `file://${process.argv[1]}`)
  console.log(
    await contentVersion().catch((e) => {
      console.error(`[content-version] ${e.message}`);
      return "unknown";
    }),
  );
