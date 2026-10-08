#!/usr/bin/env node
/**
 * Icon and splash sources for the BuildX HUE app (students and the training team), drawn from the
 * BuildX mark (public/brand/mark-*.svg): the colour mark on night blue.
 * Writes mobile/app/assets/{icon-only,icon-foreground,icon-background,splash,splash-dark}.png, then
 * `npx @capacitor/assets generate` (run in mobile/app) makes every Android and iOS size from them.
 * Also writes the Google Play listing art: mobile/store/play-icon.png (512) and feature-graphic.png (1024×500).
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "../..");
const mark = (name) => readFileSync(path.join(root, "public/brand", `${name}.svg`), "utf8").replace(/width="118" height="100"/, 'width="100%" height="100%"');

const a = { bg: "radial-gradient(120% 90% at 50% 0%, #17336f 0%, #0b1f4a 45%, #081634 100%)", mark: mark("mark-color"), label: "", name: "BuildX HUE", line: "للطلاب وفريق التدريب في تطبيق واحد" };

/** One square image: `fill` paints the background, `scale` is the mark's width as a share of the side. */
const page = ({ size, fill, mark, scale, label }) => `<!doctype html><html><head><style>
  html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:${fill || "transparent"}}
  .c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${size * 0.035}px}
  .m{width:${size * scale}px;aspect-ratio:118/100}
  .l{font:800 ${size * scale * 0.24}px/1 "DejaVu Sans","Liberation Sans",Arial,sans-serif;letter-spacing:${size * scale * 0.06}px;color:#fff;padding-left:${size * scale * 0.06}px}
</style></head><body><div class="c"><div class="m">${mark}</div>${label ? `<div class="l">${label}</div>` : ""}</div></body></html>`;

const browser = await chromium.launch();
{
  const out = path.join(root, "mobile", "app", "assets");
  mkdirSync(out, { recursive: true });
  const shots = [
    // Full icon (iOS, Play listing, legacy Android).
    { file: "icon-only.png", size: 1024, fill: a.bg, scale: 0.5 },
    // Android adaptive icon: the launcher crops to the inner ~61%, so the mark stays small.
    { file: "icon-foreground.png", size: 1024, fill: "", scale: 0.36 },
    { file: "icon-background.png", size: 1024, fill: a.bg, scale: 0, noMark: true },
    { file: "splash.png", size: 2732, fill: "#081634", scale: 0.16 },
    { file: "splash-dark.png", size: 2732, fill: "#081634", scale: 0.16 },
  ];
  for (const s of shots) {
    const p = await browser.newPage({ viewport: { width: s.size, height: s.size } });
    await p.setContent(page({ size: s.size, fill: s.fill, mark: s.noMark ? "" : a.mark, scale: s.scale, label: s.noMark ? "" : a.label }));
    await p.screenshot({ path: path.join(out, s.file), omitBackground: !s.fill });
    await p.close();
  }
  // Google Play listing art.
  const listing = path.join(root, "mobile", "store");
  mkdirSync(listing, { recursive: true });
  const icon = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await icon.setContent(page({ size: 512, fill: a.bg, mark: a.mark, scale: 0.5, label: a.label }));
  await icon.screenshot({ path: path.join(listing, "play-icon.png") });
  await icon.close();
  const feature = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await feature.setContent(`<!doctype html><html dir="rtl"><body style="margin:0;width:1024px;height:500px;overflow:hidden;background:radial-gradient(90% 120% at 85% 0%, #1d3f8c 0%, #0b1f4a 50%, #081634 100%);font-family:'Noto Sans Arabic','DejaVu Sans',sans-serif">
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:56px;direction:ltr">
      <div style="width:220px;height:220px;border-radius:52px;background:${a.bg};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;box-shadow:0 20px 60px rgb(0 0 0/.45),0 0 0 2px rgb(255 255 255/.1)">
        <div style="width:120px;aspect-ratio:118/100">${a.mark}</div>${a.label ? `<div style="font:800 26px/1 'DejaVu Sans',sans-serif;letter-spacing:6px;color:#fff;padding-left:6px">${a.label}</div>` : ""}
      </div>
      <div style="color:#fff;max-width:560px">
        <div style="font:800 76px/1.05 'DejaVu Sans',sans-serif;letter-spacing:1px">${a.name}</div>
        <div dir="rtl" style="margin-top:22px;font:600 29px/1.4 'Noto Sans Arabic','DejaVu Sans',sans-serif;color:#c6d4ee;text-align:left;white-space:nowrap">${a.line}</div>
      </div>
    </div></body></html>`);
  await feature.screenshot({ path: path.join(listing, "feature-graphic.png") });
  await feature.close();
  console.log(`[icons] → ${out}`);
}
await browser.close();
