import { chromium } from "@playwright/test";
import path from "node:path";
const dir = path.resolve("art/render/textures");
const boards = [
  ["esp32", 28.5, 54.5],
  ["stm32", 70, 53],
  ["uno", 68.6, 53.4],
  ["driver", 43, 43],
];
const b = await chromium.launch();
for (const [k, wmm, hmm] of boards) {
  const w = Math.round(wmm * 24), h = Math.round(hmm * 24);
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(`file://${dir}/src/silk.html?k=${k}&w=${w}&h=${h}&wmm=${wmm}&seed=${k.length * 7}`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${dir}/out/silk_${k}.png`, omitBackground: true });
  await p.close();
  console.log("silk", k, w, h);
}
await b.close();
