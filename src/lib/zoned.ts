/**
 * Wall-clock helpers for the club's time zone (Africa/Cairo, which observes DST). `<input type=datetime-local>`
 * values carry no zone, so they are always interpreted as Cairo time — whatever the admin's device is set to.
 */
export const CLUB_TZ = "Africa/Cairo";

function offsetMinutes(at: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return (Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - at.getTime()) / 60000;
}

/** "2026-10-10T14:30" (Cairo wall clock) → Date, or null when malformed. */
export function fromZonedInput(local: string | null | undefined, tz = CLUB_TZ): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local ?? "");
  if (!m) return null;
  const wall = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  let t = wall - offsetMinutes(new Date(wall), tz) * 60000;
  const second = offsetMinutes(new Date(t), tz); // settle DST transitions
  t = wall - second * 60000;
  return new Date(t);
}

/** Date → "YYYY-MM-DDTHH:mm" in Cairo wall-clock time, for datetime-local defaults. */
export function toZonedInput(d: Date | string | null | undefined, tz = CLUB_TZ): string {
  if (!d) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(d));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

const WD = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] };
const MO = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
};

/** Numeric Cairo wall-clock parts (identical in every ICU build). */
export function zonedParts(d: Date | string, tz = CLUB_TZ) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(d));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "0";
  const y = Number(g("year"));
  const mo = Number(g("month"));
  const day = Number(g("day"));
  return { y, mo, day, hh: g("hour").padStart(2, "0"), mm: g("minute").padStart(2, "0"), wd: new Date(Date.UTC(y, mo - 1, day)).getUTCDay() };
}

/**
 * "Sun 11 Oct · 15:30" / "الأحد 11 أكتوبر الساعة 15:30" in Cairo time. Built from numeric parts and fixed names
 * because Node's ICU and browsers' ICU punctuate dates differently, which breaks hydration of client components.
 */
export function formatZoned(d: Date | string, { lang = "en", time = true }: { lang?: "en" | "ar"; time?: boolean } = {}) {
  const z = zonedParts(d);
  if (lang === "ar") return `${WD.ar[z.wd]} ${z.day} ${MO.ar[z.mo - 1]}${time ? ` الساعة ${z.hh}:${z.mm}` : ""}`;
  return `${WD.en[z.wd]} ${z.day} ${MO.en[z.mo - 1]}${time ? ` · ${z.hh}:${z.mm}` : ""}`;
}
