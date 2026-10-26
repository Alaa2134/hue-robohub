/**
 * The Competition Coach's citation check: an AI answer may cite only the rule sections it was given,
 * by their number in [brackets]. Unknown numbers are removed; an answer with none left is dropped.
 * Shared by the coach-ask Edge Function and its unit test (src/portal/coach.test.ts).
 */
export function checkCitations(text: string, refs: string[]): { text: string; cited: string[] } | null {
  const known = new Set(refs);
  const cited = new Set<string>();
  const out = text.replace(/\[([^\]\n]{1,40})\]/g, (_, ref: string) => {
    const r = ref.trim();
    if (known.has(r)) {
      cited.add(r);
      return `[${r}]`;
    }
    return "";
  });
  return cited.size ? { text: out.replace(/[ \t]{2,}/g, " ").replace(/ +([.,،؛])/g, "$1").trim(), cited: [...cited] } : null;
}
