import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";
import opentype from "opentype.js";
import { makeGlyphs, layout, C } from "./glyphs.mjs";

const OUT = "public/brand";
mkdirSync(OUT, { recursive: true });

// The mark is the BuildX Robotics badge (public/brand/logo-badge.png, 1024 px on transparent), trimmed
// to its edges. Every lockup carries it; the site shows the web sizes written below.
const badge = await sharp(`${OUT}/logo-badge.png`).trim().toBuffer({ resolveWithObject: true });
const MARK_W = +((badge.info.width / badge.info.height) * 100).toFixed(2);
const badgePng = (height) => sharp(badge.data).resize({ height }).png({ palette: true, quality: 95, effort: 10 }).toBuffer();
const BADGE_B64 = (await badgePng(400)).toString("base64");
for (const h of [160, 512]) writeFileSync(`${OUT}/logo-badge-${h}.png`, await badgePng(h));

const COLORS = { white: "#F2F5F8", silver: "#9AA6B6", blue: "#2F7BFF", ink: "#05070A", cyan: "#45E1FF", sky: "#38B6FF" };
const heavy = makeGlyphs({ S: 26, K: 18 });
const light = makeGlyphs({ S: 14, K: 12 });

const mono = opentype.parse(readFileSync("node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff").buffer.slice(0));

function textPath(str, x, y, size, spacing) {
  // Letterspaced text → outlined path (brand files never depend on installed fonts).
  let cx = x;
  let d = "";
  for (const ch of str) {
    const g = mono.charToGlyph(ch);
    // A position with a long fraction makes opentype.js write NaN into some glyphs (the first E of COMPETE).
    d += g.getPath(Math.round(cx * 100) / 100, y, size).toPathData(2);
    cx += (g.advanceWidth / mono.unitsPerEm) * size + spacing;
  }
  return { d, width: cx - x - spacing };
}

/** Mark group (100 units tall): the badge, the same on every background. */
function markG() {
  return `<image width="${MARK_W}" height="100" href="data:image/png;base64,${BADGE_B64}"/>`;
}

function wordG(variant) {
  // BUILD (white) + X (blue) · HUE (sky) — all in the heavy cut.
  const fill = variant === "black" ? COLORS.ink : variant === "silver" ? "url(#metal)" : COLORS.white;
  const xFill = variant === "color" || variant === "silver" ? COLORS.blue : fill;
  const hueFill = variant === "color" || variant === "silver" ? COLORS.sky : fill;
  const a = layout(heavy, "BUILDX", 10);
  const b = layout(heavy, "HUE", 10);
  const gap = 40;
  const g1 = a.glyphs.map((g, i) => `<path fill-rule="evenodd" fill="${i === 5 ? xFill : fill}" transform="translate(${g.x} 0)" d="${g.d}"/>`).join("");
  const g2 = b.glyphs.map((g) => `<path fill-rule="evenodd" fill="${hueFill}" transform="translate(${a.width + gap + g.x} 0)" d="${g.d}"/>`).join("");
  return { svg: `<g>${g1}</g><g>${g2}</g>`, width: a.width + gap + b.width };
}

const DEFS = `<defs><linearGradient id="metal" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.42" stop-color="#C9D1DC"/><stop offset="0.5" stop-color="#7F8B9B"/><stop offset="0.62" stop-color="#D7DEE6"/><stop offset="1" stop-color="#9AA6B6"/></linearGradient></defs>`;

function svgDoc(w, h, body, bg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${+w.toFixed(1)} ${+h.toFixed(1)}" width="${Math.round(w)}" height="${Math.round(h)}">${DEFS}${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ""}${body}</svg>`;
}

const files = {};

// Mark: one badge; the white, black and metallic names stay so links to them keep working.
for (const v of ["color", "white", "black", "silver"]) files[`mark-${v}.svg`] = svgDoc(MARK_W, 100, markG());

// App badge (avatar): the badge on a night-blue rounded square.
files["badge.svg"] = svgDoc(100, 100, `<rect width="100" height="100" rx="22" fill="#081634"/><g transform="translate(${50 - (MARK_W * 0.8) / 2} 10) scale(0.8)">${markG()}</g>`);

// Horizontal lockup: mark | wordmark + tagline
function horizontal(variant) {
  const cap = 100; // wordmark cap height units
  const mk = 128; // mark height
  const w = wordG(variant);
  const tagSize = 15.5;
  const tag = textPath("STUDENT INNOVATION & ROBOTICS COMMUNITY", 0, 0, tagSize, 7.2);
  const x0 = (mk * MARK_W) / 100 + 44;
  const divider = variant === "black" ? "#C3CAD3" : "#283241";
  const tagFill = variant === "black" ? "#5B6676" : "#7D8899";
  const markScaled = `<g transform="scale(${mk / 100})">${markG()}</g>`;
  const word = `<g transform="translate(${x0} 0)">${w.svg}</g>`;
  const tagG = `<path transform="translate(${x0 + 3} ${mk})" fill="${tagFill}" d="${tag.d}"/>`;
  const W = x0 + Math.max(w.width, tag.width);
  return svgDoc(W, mk, `${markScaled}<rect x="${(mk * MARK_W) / 100 + 20}" y="0" width="2.5" height="${mk}" fill="${divider}"/>${word}${tagG}`);
}
for (const v of ["color", "white", "black", "silver"]) files[`logo-horizontal-${v}.svg`] = horizontal(v);

// Stacked lockup
function stacked(variant) {
  const w = wordG(variant);
  const tag = textPath("STUDENT INNOVATION & ROBOTICS COMMUNITY", 0, 0, 15.5, 7.2);
  const slogan = textPath("BUILD • INNOVATE • COMPETE", 0, 0, 15.5, 9);
  const W = Math.max(w.width, tag.width, slogan.width) + 40;
  const mk = 260;
  const mx = (W - (mk * MARK_W) / 100) / 2;
  const wy = mk + 56;
  const tagFill = variant === "black" ? "#5B6676" : "#7D8899";
  const sloganFill = variant === "black" ? COLORS.ink : COLORS.blue;
  return svgDoc(
    W,
    wy + C + 92,
    `<g transform="translate(${mx} 0) scale(${mk / 100})">${markG()}</g>` +
      `<g transform="translate(${(W - w.width) / 2} ${wy})">${w.svg}</g>` +
      `<path transform="translate(${(W - tag.width) / 2} ${wy + C + 40})" fill="${tagFill}" d="${tag.d}"/>` +
      `<path transform="translate(${(W - slogan.width) / 2} ${wy + C + 78})" fill="${sloganFill}" d="${slogan.d}"/>`,
  );
}
for (const v of ["color", "white", "black"]) files[`logo-stacked-${v}.svg`] = stacked(v);

// Wordmark only
for (const v of ["color", "white", "black"]) {
  const w = wordG(v);
  files[`wordmark-${v}.svg`] = svgDoc(w.width, C, w.svg);
}

for (const [name, svg] of Object.entries(files)) writeFileSync(`${OUT}/${name}`, svg);

// PNG lockups for the PDFs and pictures made in the browser (an SVG with a picture inside is not drawn
// the same way everywhere).
for (const name of ["logo-horizontal-color", "logo-horizontal-white", "logo-horizontal-black", "logo-stacked-color", "logo-stacked-white", "logo-stacked-black"])
  await sharp(Buffer.from(files[`${name}.svg`]), { density: 288 }).resize({ width: name.includes("stacked") ? 1000 : 1400 }).png({ palette: true, quality: 95, effort: 10 }).toFile(`${OUT}/${name}.png`);

// The favicons and app icons (favicon*.png, favicon.svg, favicon.ico, icon-*.png, apple-touch-icon.png)
// are the badge itself, made from logo-badge.png; this script leaves them as they are.

// React component path data (single source of truth for the site)
const w = wordG("color");
const a = layout(heavy, "BUILDX", 10);
const b = layout(heavy, "HUE", 10);
const ts = `// Generated by art/brand/build.mjs — do not edit by hand.
export const BADGE = ${JSON.stringify({ width: badge.info.width, height: badge.info.height })};
export const WORDMARK = ${JSON.stringify({
  width: w.width,
  height: C,
  build: a.glyphs.slice(0, 5).map((g) => ({ x: g.x, d: g.d })),
  x: a.glyphs.slice(5).map((g) => ({ x: g.x, d: g.d })),
  hue: b.glyphs.map((g) => ({ x: a.width + 40 + g.x, d: g.d })),
})};
`;
writeFileSync("src/components/brand/logo-paths.ts", ts);
console.log("brand assets:", Object.keys(files).length + 8);
