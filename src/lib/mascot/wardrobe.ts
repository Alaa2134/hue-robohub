/**
 * What Baqloz wears, from the visitor's own clock and calendar: a nightcap late at night, his
 * morning tea, sunglasses on Friday, a scarf in winter, a lantern in the evenings of Ramadan and a
 * party hat on Eid (the Hijri date comes from the browser's Umm al-Qura calendar).
 */
import type { Text } from "@/config/mascotJourney";
import type { Outfit } from "./model";

export function hijri(d: Date): { month: number; day: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { month: "numeric", day: "numeric" }).formatToParts(d);
    const month = Number(parts.find((p) => p.type === "month")?.value);
    const day = Number(parts.find((p) => p.type === "day")?.value);
    return month && day ? { month, day } : null;
  } catch {
    return null;
  }
}

export type Occasion = "night" | "morning" | "friday" | "winter" | "ramadan" | "eid" | null;

export function wardrobe(d = new Date()): { outfit: Outfit[]; occasion: Occasion } {
  const h = d.getHours();
  const month = d.getMonth();
  const hj = hijri(d);
  const ramadan = hj?.month === 9;
  const eid = !!hj && ((hj.month === 10 && hj.day <= 3) || (hj.month === 12 && hj.day >= 10 && hj.day <= 13));
  const night = h < 5 || h >= 23;
  const outfit: Outfit[] = [];
  let occasion: Occasion = null;
  if (night) outfit.push("Nightcap");
  else if (eid) outfit.push("PartyHat");
  if (month === 11 || month <= 1) outfit.push("Scarf");
  if (!night && !eid && d.getDay() === 5 && h >= 10 && h < 18) outfit.push("Sunglasses");
  if (ramadan && (h >= 17 || h < 5)) outfit.push("Lantern");
  if (h >= 6 && h < 11) outfit.push("TeaCup");
  if (eid) occasion = "eid";
  else if (ramadan) occasion = "ramadan";
  else if (night) occasion = "night";
  else if (outfit.includes("Sunglasses")) occasion = "friday";
  else if (outfit.includes("Scarf")) occasion = "winter";
  else if (outfit.includes("TeaCup")) occasion = "morning";
  return { outfit, occasion };
}

/** What he says about his outfit (once a visit). */
export const OCCASION_LINES: Record<Exclude<Occasion, null>, Text> = {
  night: { ar: "إنت لسه صاحي؟ 😴 أنا لبست طاقية النوم خلاص… بس لو عايز حاجة أنا موجود.", en: "Still up? 😴 I've got my nightcap on… but I'm here if you need me." },
  morning: { ar: "صباح الفل ☕ ثانية أخلّص الشاي بتاعي وأبقى معاك.", en: "Morning ☕ Let me finish my tea and I'm all yours." },
  friday: { ar: "جمعة مباركة 😎 النهارده يوم الأجازة… لابس النضارة الشمس.", en: "Happy Friday 😎 Day off, shades on." },
  winter: { ar: "الجو برد النهارده 🧣 لبست الكوفية بتاعة BuildX.", en: "It's cold today 🧣 BuildX scarf on." },
  ramadan: { ar: "رمضان كريم 🌙 الفانوس معايا أهو!", en: "Ramadan Kareem 🌙 Got my lantern!" },
  eid: { ar: "كل سنة وإنت طيب 🎉 عيد سعيد!", en: "Eid Mubarak 🎉" },
};
