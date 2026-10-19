/**
 * Arduino sketch → C++ the way the Arduino builder does it: the .ino files are joined into one
 * translation unit that starts with #include <Arduino.h>, and each function defined in them gets a
 * prototype above the first definition (so functions can be called before they appear). #line
 * directives keep every compiler message pointing at the user's own file and line.
 */

export type SourceFile = { name: string; text: string };
export type Diagnostic = { file: string; line: number; col: number; severity: "error" | "warning" | "note"; message: string };

export const FILE_NAME = /^[A-Za-z_][\w-]{0,40}\.(ino|h|hpp|cpp|c)$/;
const KEYWORDS = new Set(["if", "else", "while", "for", "switch", "do", "return", "sizeof", "case", "catch", "new", "delete"]);

/** Comments, strings and characters blanked out (same length, newlines kept), so scanning ignores them. */
export function blank(code: string): string {
  let out = "";
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    const n = code[i + 1];
    if (c === "/" && n === "/") {
      while (i < code.length && code[i] !== "\n") (out += " "), i++;
    } else if (c === "/" && n === "*") {
      out += "  ";
      i += 2;
      while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) (out += code[i] === "\n" ? "\n" : " "), i++;
      if (i < code.length) (out += "  "), (i += 2);
    } else if (c === '"' || c === "'") {
      out += c;
      i++;
      while (i < code.length && code[i] !== c && code[i] !== "\n") {
        if (code[i] === "\\") (out += " "), i++;
        if (i < code.length) (out += " "), i++;
      }
      if (i < code.length) (out += code[i]), i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Top-level function definitions: header text (e.g. "int add(int a, int b)") and where it starts. */
export function functionDefinitions(code: string): { header: string; name: string; start: number }[] {
  const src = blank(code);
  const found: { header: string; name: string; start: number }[] = [];
  let depth = 0;
  let paren = 0;
  let stmtStart = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "#" && depth === 0 && /(^|\n)[ \t]*$/.test(src.slice(Math.max(0, i - 80), i))) {
      // Preprocessor line (with backslash continuations): never part of a header.
      while (i < src.length && !(src[i] === "\n" && src[i - 1] !== "\\")) i++;
      stmtStart = i + 1;
      continue;
    }
    if (c === "(") paren++;
    else if (c === ")") paren = Math.max(0, paren - 1);
    else if (c === "{") {
      if (depth === 0 && paren === 0) {
        const raw = src.slice(stmtStart, i);
        const header = raw.replace(/\s+/g, " ").trim();
        const m = header.match(/^((?:[\w:<>,*&]+\s+|[*&]\s*)+?)([A-Za-z_]\w*)\s*\(([^()]*)\)\s*(const\s*)?$/);
        if (m && !/^(?:class|struct|enum|union|namespace|typedef|template|extern|using)\b/.test(header) && !KEYWORDS.has(m[2]) && !/[=;]/.test(m[1]) && !m[1].trim().split(/\s+/).some((w) => KEYWORDS.has(w))) {
          const lead = raw.length - raw.trimStart().length;
          found.push({ header, name: m[2], start: stmtStart + lead });
        }
      }
      depth++;
    } else if (c === "}") {
      depth = Math.max(0, depth - 1);
      if (depth === 0) stmtStart = i + 1;
    } else if (c === ";" && depth === 0 && paren === 0) stmtStart = i + 1;
  }
  return found;
}

const lineAt = (text: string, index: number) => text.slice(0, index).split("\n").length;

/** Every library the sketch includes (header names, e.g. "Servo.h"). */
export function includesOf(files: SourceFile[]): Set<string> {
  const out = new Set<string>();
  for (const f of files) for (const m of blank(f.text).matchAll(/^[ \t]*#[ \t]*include[ \t]*[<"]([^>"\n]+)[>"]/gm)) out.add(m[1].trim());
  // blank() hides the name inside quotes; read it from the original text at the same place.
  for (const f of files) for (const m of f.text.matchAll(/^[ \t]*#[ \t]*include[ \t]*"([^"\n]+)"/gm)) out.add(m[1].trim());
  return out;
}

/**
 * The C++ the compiler sees for the .ino files of a sketch (main first, then the others by name).
 * Returns null when there is no .ino file.
 */
export function sketchToCpp(files: SourceFile[], main?: string): string | null {
  const inos = files.filter((f) => f.name.endsWith(".ino"));
  if (!inos.length) return null;
  inos.sort((a, b) => (a.name === main ? -1 : b.name === main ? 1 : a.name.localeCompare(b.name)));
  let firstProtoDone = false;
  const parts: string[] = ["#include <Arduino.h>"];
  const allDefs = inos.flatMap((f) => functionDefinitions(f.text).map((d) => ({ ...d, file: f })));
  for (const f of inos) {
    let text = f.text;
    if (!firstProtoDone) {
      const defs = functionDefinitions(text);
      if (defs.length || allDefs.length) {
        // Outside every body: what's left are top-level declarations.
        let clean = blank(inos.map((x) => x.text).join("\n"));
        for (let prev = ""; prev !== clean; ) (prev = clean), (clean = clean.replace(/\{[^{}]*\}/g, "\u0001"));
        const protos = allDefs
          .filter((d) => !/=/.test(d.header.slice(d.header.indexOf("(")))) // default arguments: the user declares those
          .filter((d) => {
            // Already declared somewhere with a prototype (name(...);)? Then leave it.
            const re = new RegExp(`\\b${d.name}\\s*\\([^(){};]*\\)\\s*(?:const\\s*)?;`);
            return !re.test(clean);
          })
          .map((d) => `${d.header};`);
        const unique = [...new Set(protos)];
        const at = defs.length ? defs[0].start : text.length;
        const line = lineAt(text, at);
        // Prototypes go at the start of the line holding the first definition.
        const lineStart = text.lastIndexOf("\n", at - 1) + 1;
        if (unique.length) text = `${text.slice(0, lineStart)}${unique.join("\n")}\n#line ${line} "${f.name}"\n${text.slice(lineStart)}`;
        firstProtoDone = true;
      }
    }
    parts.push(`#line 1 "${f.name}"`, text);
  }
  return parts.join("\n") + "\n";
}

const DIAG = /^(?:\/build\/src\/)?([^\s:][^:\n]*):(\d+):(\d+): (fatal error|error|warning|note): (.*)$/;
const DIAG_NOCOL = /^(?:\/build\/src\/)?([^\s:][^:\n]*):(\d+): (fatal error|error|warning|note): (.*)$/;

/** Compiler and linker messages → editor diagnostics (anything unrecognised is kept in `rest`). */
export function parseDiagnostics(lines: string[]): { diagnostics: Diagnostic[]; rest: string[] } {
  const diagnostics: Diagnostic[] = [];
  const rest: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/^\[[\w-]+\] /, "");
    const m = line.match(DIAG) ?? line.match(DIAG_NOCOL);
    if (m) {
      const hasCol = m.length === 6;
      const sev = (hasCol ? m[4] : m[3]) as string;
      diagnostics.push({
        file: m[1].replace(/^\/build\/(?:src\/)?/, ""),
        line: Number(m[2]),
        col: hasCol ? Number(m[3]) : 1,
        severity: sev === "fatal error" ? "error" : (sev as Diagnostic["severity"]),
        message: (hasCol ? m[5] : m[4]) as string,
      });
      continue;
    }
    const undef = line.match(/undefined reference to [`'‘]([^'’]+)['’]/);
    if (undef) {
      diagnostics.push({ file: "", line: 0, col: 0, severity: "error", message: `undefined reference to '${undef[1]}' (declared but never defined, or a library that isn't available)` });
      continue;
    }
    if (/region [`'‘]?text['’]? overflowed|section .* will not fit/.test(line)) {
      diagnostics.push({ file: "", line: 0, col: 0, severity: "error", message: "The program is too big for the ATmega328P's 32 KB of flash." });
      continue;
    }
    if (line.trim()) rest.push(line);
  }
  return { diagnostics, rest };
}
