import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";
import opentype from "opentype.js";
import { makeGlyphs, layout, C } from "./glyphs.mjs";
import { MARK, MARK_W, PLATE } from "./mark.mjs";

const OUT = "public/brand";
mkdirSync(OUT, { recursive: true });

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
    d += g.getPath(cx, y, size).toPathData(2);
    cx += (g.advanceWidth / mono.unitsPerEm) * size + spacing;
  }
  return { d, width: cx - x - spacing };
}

/** Mark group (100 units). variant: color | white | black | silver */
function markG(variant) {
  const fill = variant === "black" ? COLORS.ink : variant === "silver" ? "url(#metal)" : COLORS.white;
  const axis = variant === "color" || variant === "silver" ? COLORS.blue : fill;
  return `<path fill-rule="evenodd" fill="${fill}" d="${MARK.body}"/><path fill="${axis}" d="${MARK.axis}"/>`;
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

// Mark
for (const v of ["color", "white", "black", "silver"]) files[`mark-${v}.svg`] = svgDoc(MARK_W, 100, markG(v));

// Badge / plate (favicon, avatar): dark plate, mark knocked in white with blue axis
const badge = (plateFill = "#0A1A44", stroke = "#1E3A7A") =>
  `<path d="${PLATE}" fill="${plateFill}" stroke="${stroke}" stroke-width="2"/><g transform="translate(${50 - (MARK_W * 0.52) / 2} 24) scale(0.52)">${markG("color")}</g>`;
files["badge.svg"] = svgDoc(100, 100, badge());
files["favicon.svg"] = svgDoc(100, 100, badge());

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
  const body = `<g>${markG(variant).replace(/^/, "")}</g>`;
  const markScaled = `<g transform="scale(${mk / 100})">${markG(variant)}</g>`;
  const word = `<g transform="translate(${x0} 0)">${w.svg}</g>`;
  const tagG = `<path transform="translate(${x0 + 3} ${mk})" fill="${tagFill}" d="${tag.d}"/>`;
  const W = x0 + Math.max(w.width, tag.width);
  void body;
  return svgDoc(W, mk, `${markScaled}<rect x="${(mk * MARK_W) / 100 + 20}" y="0" width="2.5" height="${mk}" fill="${divider}"/>${word}${tagG}`);
}
for (const v of ["color", "white", "black", "silver"]) files[`logo-horizontal-${v}.svg`] = horizontal(v);

// Stacked lockup
function stacked(variant) {
  const w = wordG(variant);
  const tag = textPath("STUDENT INNOVATION & ROBOTICS COMMUNITY", 0, 0, 15.5, 7.2);
  const slogan = textPath("BUILD • INNOVATE • COMPETE", 0, 0, 15.5, 9);
  const W = Math.max(w.width, tag.width, slogan.width) + 40;
  const mk = 150;
  const mx = (W - (mk * MARK_W) / 100) / 2;
  const wy = mk + 56;
  const tagFill = variant === "black" ? "#5B6676" : "#7D8899";
  const sloganFill = variant === "black" ? COLORS.ink : COLORS.blue;
  return svgDoc(
    W,
    wy + C + 92,
    `<g transform="translate(${mx} 0) scale(${mk / 100})">${markG(variant)}</g>` +
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

// Raster: favicons, PWA icons, apple touch, social avatar
const png = (svg, size, file, bg) => sharp(Buffer.from(svg)).resize(size, size).flatten(bg ? { background: bg } : false).png().toFile(file);
await png(files["favicon.svg"], 32, `${OUT}/favicon-32.png`);
await png(files["favicon.svg"], 16, `${OUT}/favicon-16.png`);
await png(files["favicon.svg"], 48, `${OUT}/favicon-48.png`);

const appIcon = (size, padPct = 0.18) =>
  svgDoc(
    100,
    100,
    `<rect width="100" height="100" fill="#071233"/><radialGradient id="g" cx="0.5" cy="0.38" r="0.7"><stop offset="0" stop-color="#16408F"/><stop offset="1" stop-color="#071233"/></radialGradient><rect width="100" height="100" fill="url(#g)"/><g transform="translate(${50 - ((1 - padPct * 2) * MARK_W) / 2} ${50 - (1 - padPct * 2) * 50}) scale(${(1 - padPct * 2)})">${markG("color")}</g>`,
  );
await png(appIcon(512, 0.24), 512, `${OUT}/icon-512.png`);
await png(appIcon(192, 0.24), 192, `${OUT}/icon-192.png`);
await png(appIcon(512, 0.3), 512, `${OUT}/icon-maskable-512.png`);
await png(appIcon(180, 0.22), 180, `${OUT}/apple-touch-icon.png`);

// ICO (PNG-compressed entries)
const ico16 = await sharp(Buffer.from(files["favicon.svg"])).resize(16, 16).png().toBuffer();
const ico32 = await sharp(Buffer.from(files["favicon.svg"])).resize(32, 32).png().toBuffer();
const ico48 = await sharp(Buffer.from(files["favicon.svg"])).resize(48, 48).png().toBuffer();
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(([size, buf], i) => {
    dir.writeUInt8(size % 256, i * 16);
    dir.writeUInt8(size % 256, i * 16 + 1);
    dir.writeUInt16LE(1, i * 16 + 4);
    dir.writeUInt16LE(32, i * 16 + 6);
    dir.writeUInt32LE(buf.length, i * 16 + 8);
    dir.writeUInt32LE(offset, i * 16 + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...images.map(([, b]) => b)]);
}
writeFileSync("public/favicon.ico", ico([[16, ico16], [32, ico32], [48, ico48]]));

// React component path data (single source of truth for the site)
const w = wordG("color");
const a = layout(heavy, "BUILDX", 10);
const b = layout(heavy, "HUE", 10);
const ts = `// Generated by art/brand/build.mjs — do not edit by hand.
export const MARK_PATHS = ${JSON.stringify({ body: MARK.body, axis: MARK.axis, width: MARK_W, height: 100 })};
export const PLATE_PATH = ${JSON.stringify(PLATE)};
export const WORDMARK = ${JSON.stringify({
  width: w.width,
  height: C,
  build: a.glyphs.slice(0, 5).map((g) => ({ x: g.x, d: g.d })),
  x: a.glyphs.slice(5).map((g) => ({ x: g.x, d: g.d })),
  hue: b.glyphs.map((g) => ({ x: a.width + 40 + g.x, d: g.d })),
})};
`;
writeFileSync("src/components/brand/logo-paths.ts", ts);
writeFileSync("art/render/textures/mark.json", JSON.stringify({ body: MARK.body, axis: MARK.axis, width: MARK_W }));
console.log("brand assets:", Object.keys(files).length + 9);
