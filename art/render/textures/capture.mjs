// Captures HTML texture sources to PNG with headless Chromium.
import { chromium } from "@playwright/test";
import { readdirSync } from "node:fs";
import path from "node:path";
const dir = path.resolve("art/render/textures/src");
const out = path.resolve("art/render/textures/out");
const only = process.argv[2];
const browser = await chromium.launch();
for (const f of readdirSync(dir).filter((f) => f.endsWith(".html") && (!only || f.includes(only)))) {
  const banner = f.startsWith("banner");
  const wide = f.startsWith("wide_");
  const page = await browser.newPage({ viewport: banner ? { width: 600, height: 1600 } : wide ? { width: 1600, height: 520 } : { width: 1280, height: 800 } });
  await page.goto("file://" + path.join(dir, f));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, f.replace(".html", ".png")) });
  await page.close();
  console.log("captured", f);
}
await browser.close();
