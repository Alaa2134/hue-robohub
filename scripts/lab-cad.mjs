// BuildX Lab's 3D Studio geometry kernel: manifold-3d (Apache-2.0) copied to public/lab/cad with
// content-hashed names, so browsers cache it forever and pick up a new version immediately.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
// The package's exports map hides package.json, so find it by path.
const pkg = path.join(root, "node_modules/manifold-3d");
const out = path.join(root, "public/lab/cad");
const hash = (b) => createHash("sha256").update(b).digest("hex").slice(0, 10);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const files = {};
for (const [key, ext] of [["js", ".mjs"], ["wasm", ".wasm"]]) {
  const data = readFileSync(path.join(pkg, `manifold.${key}`));
  files[key] = `manifold.${hash(data)}${ext}`;
  writeFileSync(path.join(out, files[key]), data);
}
// Saira Bold (SIL Open Font License), the site's display face, for extruded 3D text.
const font = readFileSync(path.join(root, "node_modules/@fontsource/saira/files/saira-latin-700-normal.woff"));
files.font = `saira-700.${hash(font)}.woff`;
writeFileSync(path.join(out, files.font), font);
const version = JSON.parse(readFileSync(path.join(pkg, "package.json"), "utf8")).version;
writeFileSync(path.join(out, "manifold.json"), JSON.stringify({ version, files }));
console.log(`[lab-cad] manifold-3d ${version} → public/lab/cad`);
