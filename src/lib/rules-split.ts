/**
 * Splits a competition's rules (pasted from the official PDF or page) into numbered sections, so the
 * Coach can find and cite them: a section starts at a line beginning with its number — "4.2", "4.2.1",
 * "Rule 12", "Article 3", "مادة ٥", "البند 7" — and runs to the next one. Text before the first number
 * becomes section "0". Arabic-Indic digits are kept as written in the heading but read as numbers.
 */
export type RuleSection = { ref: string; heading: string; body: string };

const DIGITS = "0-9٠-٩";
const NUM = `[${DIGITS}]+(?:\\.[${DIGITS}]+)*`;
const HEAD = new RegExp(`^\\s*(?:(?:rule|article|section|art\\.|§|مادة|المادة|بند|البند|القاعدة|قاعدة)\\s*)?(${NUM})[.)\\-:]?\\s+(.*)$`, "i");
const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

export function splitRules(text: string): RuleSection[] {
  const out: RuleSection[] = [];
  let cur: RuleSection | null = null;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw.trimEnd();
    const m = line.match(HEAD);
    // A heading: a number then text, and short enough to be a title or a numbered rule line.
    if (m && m[2].trim().length > 0 && line.length <= 400) {
      cur = { ref: toLatin(m[1]), heading: m[2].trim().slice(0, 200), body: "" };
      out.push(cur);
      continue;
    }
    if (!line.trim()) {
      if (cur && cur.body && !cur.body.endsWith("\n")) cur.body += "\n";
      continue;
    }
    if (!cur) {
      cur = { ref: "0", heading: "", body: "" };
      out.push(cur);
    }
    cur.body += (cur.body && !cur.body.endsWith("\n") ? " " : "") + line.trim();
  }
  // A numbered line with no text under it is a whole rule on one line: keep it as the body too.
  return out
    .map((s) => ({ ...s, body: (s.body.trim() || s.heading).slice(0, 8000) }))
    .filter((s) => s.body || s.heading);
}

/** The same number twice (a table of contents, a repeat) makes citations ambiguous: name the repeats. */
export function duplicateRefs(sections: RuleSection[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const s of sections) (seen.has(s.ref) ? dup : seen).add(s.ref);
  return [...dup];
}
