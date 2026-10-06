/**
 * Post-production for the render library.
 * master PNG (16-bit) → grade (vignette + film grain + sharpen) → responsive AVIF/WebP renditions
 * with content-hashed names → src/content/media-library.json manifest consumed by the site.
 *
 * Usage: node art/render/post.mjs [name ...]   (defaults to every entry in library.json)
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve("art/render");
const LIB = JSON.parse(readFileSync(path.join(ROOT, "library.json"), "utf8"));
const OUT_DIR = path.resolve("public/media/library");
const MANIFEST = path.resolve("src/content/media-library.json");
const WIDTHS = [480, 768, 1080, 1440, 1920, 2560];

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
const only = process.argv.slice(2);

function grain(width, height, amount, seed = 7) {
  // Deterministic luminance noise (LCG), centred on mid-grey for a soft-light overlay.
  const buf = Buffer.alloc(width * height);
  let s = seed;
  for (let i = 0; i < buf.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const n = (s / 0x7fffffff + ((s >> 7) & 0xff) / 255) / 2;
    buf[i] = Math.max(0, Math.min(255, Math.round(128 + (n - 0.5) * 255 * amount)));
  }
  return buf;
}

function vignetteSvg(w, h, strength) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><radialGradient id="v" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="${1 - strength}"/></radialGradient></defs><rect width="100%" height="100%" fill="#000"/><rect width="100%" height="100%" fill="url(#v)"/></svg>`,
  );
}

async function processOne(name, entry) {
  const src = path.join(ROOT, "out", `${entry.master ?? name}.png`);
  if (!existsSync(src)) {
    console.warn(`skip ${name}: missing ${src}`);
    return;
  }
  const meta = await sharp(src).metadata();
  const { width: W, height: H } = meta;
  const vig = entry.vignette ?? 0.35;
  const grainAmt = entry.grain ?? 0.07;

  // 1) Grade at full resolution (8-bit sRGB working copy).
  let img = sharp(src).toColourspace("srgb");
  const layers = [];
  if (vig > 0) layers.push({ input: await sharp(vignetteSvg(W, H, vig)).resize(W, H).png().toBuffer(), blend: "multiply" });
  if (grainAmt > 0) layers.push({ input: grain(W, H, grainAmt), raw: { width: W, height: H, channels: 1 }, blend: "soft-light" });
  const graded = await img.composite(layers).sharpen({ sigma: 0.6, m1: 0.6, m2: 1.2 }).png({ compressionLevel: 6 }).toBuffer();

  // 2) Renditions.
  const hash = createHash("sha1").update(graded).digest("hex").slice(0, 8);
  const dir = path.join(OUT_DIR, name);
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(dir, { recursive: true });
  const widths = WIDTHS.filter((w) => w < W).concat(W > 2560 ? [] : [W]).filter((w, i, a) => a.indexOf(w) === i);
  const sources = { avif: [], webp: [] };
  for (const w of widths) {
    const h = Math.round((H / W) * w);
    const base = sharp(graded).resize(w, h, { kernel: "lanczos3" });
    const avif = await base.clone().avif({ quality: entry.avifQuality ?? 54, effort: 6, chromaSubsampling: "4:2:0" }).toBuffer();
    const webp = await base.clone().webp({ quality: entry.webpQuality ?? 80, effort: 6, smartSubsample: true }).toBuffer();
    writeFileSync(path.join(dir, `${name}-${hash}-${w}.avif`), avif);
    writeFileSync(path.join(dir, `${name}-${hash}-${w}.webp`), webp);
    sources.avif.push({ w, url: `/media/library/${name}/${name}-${hash}-${w}.avif`, bytes: avif.length });
    sources.webp.push({ w, url: `/media/library/${name}/${name}-${hash}-${w}.webp`, bytes: webp.length });
  }
  // Social/OG JPEG (1200 wide) for link previews.
  const og = await sharp(graded).resize(1200, Math.round((H / W) * 1200)).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  writeFileSync(path.join(dir, `${name}-${hash}-og.jpg`), og);

  const tiny = await sharp(graded).resize(24).blur(0.6).webp({ quality: 40 }).toBuffer();
  const { dominant } = await sharp(graded).stats();
  manifest[name] = {
    name,
    alt: entry.alt,
    width: W,
    height: H,
    focal: entry.focal ?? [50, 50],
    category: entry.category,
    placeholder: `data:image/webp;base64,${tiny.toString("base64")}`,
    color: `rgb(${dominant.r},${dominant.g},${dominant.b})`,
    og: `/media/library/${name}/${name}-${hash}-og.jpg`,
    sources,
  };
  const largest = sources.avif.at(-1);
  console.log(`${name}: ${W}x${H} → ${widths.length} sizes (largest avif ${(largest.bytes / 1024).toFixed(0)} KB)`);
}

const names = only.length ? only : Object.keys(LIB);
for (const n of names) await processOne(n, LIB[n]);
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
// Remove manifest entries whose folders no longer exist.
const existing = new Set(existsSync(OUT_DIR) ? readdirSync(OUT_DIR) : []);
for (const k of Object.keys(manifest)) if (!existing.has(k)) delete manifest[k];
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
