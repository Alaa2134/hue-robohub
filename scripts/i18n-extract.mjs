#!/usr/bin/env node
/**
 * The app's English: collects every Arabic text the BuildX App shows (string literals, JSX text, and
 * template strings with ${…} turned into {0}, {1}…) and keeps src/portal/i18n/en.json in step:
 * new texts are added with an empty translation, texts no longer in the code are dropped.
 *
 *   node scripts/i18n-extract.mjs           update en.json, list what still needs English
 *   node scripts/i18n-extract.mjs --check   fail when a text has no English (CI)
 *   node scripts/i18n-extract.mjs --dump f  write the untranslated texts (with their files) to f
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(root, "src/portal/i18n/en.json");
const AR = /[\u0600-\u06FF]/;
const EXTRA = ["src/lib/site-pages.ts", "src/lib/zoned.ts", "src/components/forms/site-forms.tsx"];

export const norm = (s) => s.replace(/\s+/g, " ").trim();

function files() {
  const dir = path.join(root, "src/portal");
  return [
    ...readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => path.join(dir, f)),
    ...EXTRA.map((f) => path.join(root, f)),
  ];
}

function collect() {
  const keys = new Map(); // key -> first file
  const add = (raw, file) => {
    const k = norm(raw);
    if (!k || !AR.test(k) || k.length > 600) return;
    if (!keys.has(k)) keys.set(k, path.relative(root, file));
  };
  for (const file of files()) {
    const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (n) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
        // Strings that never reach the screen: imports and object keys used as ids.
        if (!ts.isImportDeclaration(n.parent) && !ts.isExportDeclaration(n.parent)) add(n.text, file);
      } else if (ts.isJsxText(n)) {
        add(n.text, file);
      } else if (ts.isTemplateExpression(n)) {
        let k = n.head.text;
        n.templateSpans.forEach((s, i) => (k += `{${i}}` + s.literal.text));
        add(k, file);
      }
      ts.forEachChild(n, visit);
    };
    visit(src);
  }
  return keys;
}

const keys = collect();
const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const next = {};
const missing = [];
for (const k of [...keys.keys()].sort()) {
  next[k] = old[k] ?? "";
  if (!next[k]) missing.push(`${keys.get(k)}: ${k}`);
}

const dump = process.argv.indexOf("--dump");
if (dump > 0) {
  // For translating: every text with the file it first shows up in.
  writeFileSync(process.argv[dump + 1], JSON.stringify([...keys].filter(([k]) => !next[k])));
} else if (process.argv.includes("--check")) {
  const stale = Object.keys(old).filter((k) => !(k in next)).length;
  const added = Object.keys(next).filter((k) => !(k in old)).length;
  if (missing.length || stale || added) {
    console.error(`The app's English is out of date (${missing.length} without English, ${added} new, ${stale} unused).`);
    console.error("Run: node scripts/i18n-extract.mjs, then fill in the empty texts in src/portal/i18n/en.json");
    for (const m of missing.slice(0, 30)) console.error("  " + m);
    process.exit(1);
  }
  console.log(`App English: ${Object.keys(next).length} texts, all translated.`);
} else {
  writeFileSync(OUT, JSON.stringify(next, null, 1) + "\n");
  console.log(`${Object.keys(next).length} texts, ${missing.length} need English.`);
}
