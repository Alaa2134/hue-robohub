/**
 * What each Lab challenge is worth, its name and the skill it shows. The database keeps the same slugs
 * and points (public.lab_challenges, in supabase/migrations/20261026200000_academy.sql) and accepts
 * passes only for these. Kept free of the simulator so the website (Skill Passport) can use it.
 */
export type Skill = "programming" | "electronics" | "robotics";
type Info = { points: number; title: { en: string; ar: string }; skill: Skill };

export const CHALLENGE_INFO: Record<string, Info> = {
  "blink-2hz": { points: 10, title: { en: "Faster blink", ar: "ليد بيرمش أسرع" }, skill: "programming" },
  "button-hold": { points: 10, title: { en: "Hold to light", ar: "دوس ونوّر" }, skill: "electronics" },
  "serial-echo": { points: 10, title: { en: "Talk over serial", ar: "اتكلم على السيريال" }, skill: "programming" },
  "traffic-cycle": { points: 20, title: { en: "Traffic light", ar: "إشارة مرور" }, skill: "programming" },
  "dimmer-knob": { points: 20, title: { en: "Knob dimmer", ar: "تحكم في الإضاءة بالبوتنشوميتر" }, skill: "electronics" },
  "night-light": { points: 20, title: { en: "Night light", ar: "نور الليل" }, skill: "electronics" },
  "servo-sweep": { points: 20, title: { en: "Servo sweep", ar: "سيرفو بيلف" }, skill: "robotics" },
  "buzzer-a4": { points: 20, title: { en: "Tuning note", ar: "نغمة الضبط" }, skill: "programming" },
  "seg7-seven": { points: 30, title: { en: "Show a 7", ar: "اعرض رقم 7" }, skill: "electronics" },
  "robot-oval": { points: 20, title: { en: "Robot lap — Oval", ar: "لفة الروبوت — بيضاوي" }, skill: "robotics" },
  "robot-rounded": { points: 30, title: { en: "Robot lap — Tight corners", ar: "لفة الروبوت — زوايا ضيقة" }, skill: "robotics" },
  "robot-wavy": { points: 30, title: { en: "Robot lap — S-bends", ar: "لفة الروبوت — منحنيات S" }, skill: "robotics" },
};

export const CHALLENGE_POINTS: Record<string, number> = Object.fromEntries(Object.entries(CHALLENGE_INFO).map(([k, v]) => [k, v.points]));
