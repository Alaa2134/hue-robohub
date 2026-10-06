/** Shared (client + server) password policy so users get instant, identical feedback. */

const COMMON = new Set([
  "password", "password1", "password123", "123456789012", "qwertyuiop", "letmein", "iloveyou", "admin123",
  "welcome1", "robohub", "robotics", "horusuniversity", "changeme", "p@ssw0rd", "passw0rd", "qwerty123",
]);

export type PasswordCheck = { ok: boolean; issues: string[]; score: 0 | 1 | 2 | 3 | 4 };

export function checkPassword(pw: string, context: string[] = []): PasswordCheck {
  const issues: string[] = [];
  if (pw.length < 12) issues.push("At least 12 characters");
  if (pw.length > 256) issues.push("At most 256 characters");
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  // Long passphrases are allowed with fewer character classes.
  if (pw.length < 20 && classes < 3) issues.push("Mix upper/lower case, numbers and symbols (or use a 20+ char passphrase)");
  const lower = pw.toLowerCase();
  if (COMMON.has(lower) || COMMON.has(lower.replace(/[^a-z]/g, ""))) issues.push("Too common");
  for (const c of context) {
    const token = c.toLowerCase().split("@")[0]?.trim();
    if (token && token.length >= 4 && lower.includes(token)) {
      issues.push("Must not contain your name or email");
      break;
    }
  }
  if (/(.)\1{3,}/.test(pw)) issues.push("Avoid repeated characters");
  const lengthScore = pw.length >= 20 ? 2 : pw.length >= 14 ? 1 : 0;
  const score = Math.max(0, Math.min(4, lengthScore + (classes >= 3 ? 2 : classes >= 2 ? 1 : 0) - (issues.length ? 1 : 0))) as PasswordCheck["score"];
  return { ok: issues.length === 0, issues, score };
}
