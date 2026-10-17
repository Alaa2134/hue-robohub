/**
 * أسرة BuildX: what the family sign-up form and the staff list share. The Student Welfare
 * Department's list asks for: full name, national ID, address, phone and study level.
 */
type L = { en: string; ar: string };

/** Governorates with their national-ID codes (digits 8–9 of the ID). */
export const GOVERNORATES: { code: string; label: L }[] = [
  { code: "11", label: { en: "Damietta", ar: "دمياط" } },
  { code: "01", label: { en: "Cairo", ar: "القاهرة" } },
  { code: "02", label: { en: "Alexandria", ar: "الإسكندرية" } },
  { code: "03", label: { en: "Port Said", ar: "بورسعيد" } },
  { code: "04", label: { en: "Suez", ar: "السويس" } },
  { code: "12", label: { en: "Dakahlia", ar: "الدقهلية" } },
  { code: "13", label: { en: "Sharqia", ar: "الشرقية" } },
  { code: "14", label: { en: "Qalyubia", ar: "القليوبية" } },
  { code: "15", label: { en: "Kafr El Sheikh", ar: "كفر الشيخ" } },
  { code: "16", label: { en: "Gharbia", ar: "الغربية" } },
  { code: "17", label: { en: "Monufia", ar: "المنوفية" } },
  { code: "18", label: { en: "Beheira", ar: "البحيرة" } },
  { code: "19", label: { en: "Ismailia", ar: "الإسماعيلية" } },
  { code: "21", label: { en: "Giza", ar: "الجيزة" } },
  { code: "22", label: { en: "Beni Suef", ar: "بني سويف" } },
  { code: "23", label: { en: "Fayoum", ar: "الفيوم" } },
  { code: "24", label: { en: "Minya", ar: "المنيا" } },
  { code: "25", label: { en: "Asyut", ar: "أسيوط" } },
  { code: "26", label: { en: "Sohag", ar: "سوهاج" } },
  { code: "27", label: { en: "Qena", ar: "قنا" } },
  { code: "28", label: { en: "Aswan", ar: "أسوان" } },
  { code: "29", label: { en: "Luxor", ar: "الأقصر" } },
  { code: "31", label: { en: "Red Sea", ar: "البحر الأحمر" } },
  { code: "32", label: { en: "New Valley", ar: "الوادي الجديد" } },
  { code: "33", label: { en: "Matrouh", ar: "مطروح" } },
  { code: "34", label: { en: "North Sinai", ar: "شمال سيناء" } },
  { code: "35", label: { en: "South Sinai", ar: "جنوب سيناء" } },
];
const BORN_ABROAD: L = { en: "Born abroad", ar: "مواليد خارج مصر" };

export const STUDY_LEVELS = [1, 2, 3, 4, 5] as const;

/** Arabic-Indic digits to 0-9, then digits only. */
export const digitsOnly = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632)).replace(/\D/g, "");

/** 01xxxxxxxxx (also accepts +20 / 0020 in front), or null. */
export function egyptMobile(raw: string) {
  let d = digitsOnly(raw);
  if (/^(20|0020)1[0125]\d{8}$/.test(d)) d = `0${d.slice(-10)}`;
  return /^01[0125]\d{8}$/.test(d) ? d : null;
}

export type NationalId = { birth: Date; governorate: L; male: boolean };

/**
 * Reads an Egyptian national ID: century (2 = 1900s, 3 = 2000s), birth date, governorate code,
 * and the sex digit. Null when it can't be one (same rules as the database, private.national_id_ok).
 */
export function readNationalId(raw: string, now = new Date()): NationalId | null {
  const d = digitsOnly(raw);
  if (!/^[23]\d{13}$/.test(d)) return null;
  const year = (d[0] === "2" ? 1900 : 2000) + Number(d.slice(1, 3));
  const month = Number(d.slice(3, 5));
  const day = Number(d.slice(5, 7));
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day)
    return null;
  const age = (now.getTime() - birth.getTime()) / (365.25 * 864e5);
  if (age < 14 || age > 70) return null;
  const code = d.slice(7, 9);
  const governorate = code === "88" ? BORN_ABROAD : GOVERNORATES.find((g) => g.code === code)?.label;
  if (!governorate) return null;
  return { birth, governorate, male: Number(d[12]) % 2 === 1 };
}

/**
 * The last digit of the national ID checks the other 13 (weights 2,7,6,5,4,3,2,7,6,5,4,3,2, from 11).
 * Only a warning for staff: a mismatch usually means a mistyped digit.
 */
export function nationalIdCheckOk(raw: string) {
  const d = digitsOnly(raw);
  if (!/^\d{14}$/.test(d)) return false;
  const w = [2, 7, 6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = w.reduce((t, x, i) => t + x * Number(d[i]), 0);
  return ((11 - (sum % 11)) % 11) % 10 === Number(d[13]);
}

/** The academic year running now in Egypt (it starts in September), e.g. "2026/2027". */
export function currentAcademicYear(now = new Date()) {
  const y = now.getFullYear();
  return now.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

/** The address as the list writes it: the area, then the governorate when it isn't already in it. */
export const addressOf = (m: { address: string; governorate: string }) => {
  const a = m.address.trim();
  if (!a) return m.governorate;
  return a.includes(m.governorate) ? a : `${a}، ${m.governorate}`;
};

export type FamilySettings = { open?: boolean; year?: string; family?: string; faculty?: string };
