/**
 * Screenshots for "مواقع هتفيدك" (src/content/directory.ts): opens each site in Chromium, closes cookie
 * banners when it can, and saves the top of the page as <out>/<id>.webp (640×400). Sites that already
 * have a screenshot younger than 30 days are skipped unless --all. A site that fails keeps its old picture
 * (the page shows a drawn cover when there is none).
 *   npx tsx scripts/directory-shots.ts --out directory [--all] [--only wokwi,kaggle]
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import { DIRECTORY, fromRow, type DirRow } from "../src/content/directory";
import { SUPABASE_KEY, SUPABASE_URL } from "../src/lib/supabase-public";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const out = arg("--out") ?? "directory";
const all = process.argv.includes("--all");
const only = arg("--only")?.split(",");
const MAX_AGE = 30 * 864e5;

const CONSENT = [/^(accept|accept all|allow all|agree|i agree|got it|ok|okay)$/i, /accept (all )?cookies/i, /^allow (all )?cookies$/i];

/** The list the team keeps in the app (the one in the code when it can't be read). */
const rows = await fetch(`${SUPABASE_URL}/rest/v1/directory_sites?select=slug,name,url,cat,price,idea_ar,tip_ar,idea_en,tip_en&published=eq.true&limit=500`, { headers: { apikey: SUPABASE_KEY } })
  .then((r) => (r.ok ? (r.json() as Promise<DirRow[]>) : []))
  .catch(() => [] as DirRow[]);
const SITES = rows.length ? rows.map(fromRow) : DIRECTORY;

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: "en-US", colorScheme: "dark", userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" });
let done = 0;
let failed = 0;
for (const site of SITES) {
  if (only && !only.includes(site.id)) continue;
  const file = path.join(out, `${site.id}.webp`);
  if (!all && !only && existsSync(file) && Date.now() - statSync(file).mtimeMs < MAX_AGE) continue;
  const page = await ctx.newPage();
  try {
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    for (const name of CONSENT) {
      const b = page.getByRole("button", { name }).first();
      if (await b.isVisible({ timeout: 300 }).catch(() => false)) {
        await b.click({ timeout: 1_000 }).catch(() => {});
        break;
      }
    }
    await page.waitForTimeout(1_500);
    const png = await page.screenshot({ type: "png" });
    writeFileSync(file, await sharp(png).resize(640, 400, { fit: "cover", position: "top" }).webp({ quality: 72 }).toBuffer());
    done++;
    console.log(`✓ ${site.id}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${site.id}: ${(e as Error).message.split("\n")[0]}`);
  } finally {
    await page.close();
  }
}
await browser.close();
console.log(`${done} new screenshots, ${failed} failed`);
