/**
 * Application form vocabulary, shared by the website form and the staff review screen.
 * Stored values are the keys; labels are display only.
 */
type L = { en: string; ar: string };

export const YEARS: { key: string; label: L }[] = [
  { key: "1", label: { en: "1st year", ar: "الفرقة الأولى" } },
  { key: "2", label: { en: "2nd year", ar: "الفرقة الثانية" } },
  { key: "3", label: { en: "3rd year", ar: "الفرقة الثالثة" } },
  { key: "4", label: { en: "4th year", ar: "الفرقة الرابعة" } },
  { key: "5", label: { en: "5th year", ar: "الفرقة الخامسة" } },
  { key: "grad", label: { en: "Graduate / postgraduate", ar: "خريج / دراسات عليا" } },
];

export const FACULTIES: L[] = [
  { en: "Artificial Intelligence", ar: "الذكاء الاصطناعي" },
  { en: "Engineering", ar: "الهندسة" },
  { en: "Business", ar: "إدارة الأعمال" },
  { en: "Applied Arts", ar: "الفنون التطبيقية" },
  { en: "Pharmacy", ar: "الصيدلة" },
  { en: "Dentistry", ar: "طب الأسنان" },
  { en: "Physical Therapy", ar: "العلاج الطبيعي" },
];

export const TEAM_ROLES: { key: string; label: L }[] = [
  { key: "technical", label: { en: "Technical team", ar: "الفريق التقني" } },
  { key: "operations", label: { en: "Operations", ar: "العمليات" } },
  { key: "hr", label: { en: "HR", ar: "الموارد البشرية" } },
  { key: "pr", label: { en: "PR & outreach", ar: "العلاقات العامة" } },
  { key: "media", label: { en: "Media & design", ar: "الميديا والتصميم" } },
];

export const LEVELS: { key: "beginner" | "some" | "experienced"; label: L; hint: L }[] = [
  { key: "beginner", label: { en: "Beginner", ar: "مبتدئ" }, hint: { en: "I'm just starting out", ar: "لسه ببدأ" } },
  { key: "some", label: { en: "Some experience", ar: "عندي خبرة بسيطة" }, hint: { en: "Courses or small projects", ar: "كورسات أو مشاريع صغيرة" } },
  { key: "experienced", label: { en: "Experienced", ar: "عندي خبرة كويسة" }, hint: { en: "Real projects or competitions", ar: "مشاريع حقيقية أو مسابقات" } },
];

export const HOURS: { key: "lt3" | "3to5" | "5to10" | "10plus"; label: L }[] = [
  { key: "lt3", label: { en: "Less than 3 hours", ar: "أقل من 3 ساعات" } },
  { key: "3to5", label: { en: "3 – 5 hours", ar: "3 – 5 ساعات" } },
  { key: "5to10", label: { en: "5 – 10 hours", ar: "5 – 10 ساعات" } },
  { key: "10plus", label: { en: "More than 10 hours", ar: "أكتر من 10 ساعات" } },
];

export const DAYS: { key: string; label: L }[] = [
  { key: "sat", label: { en: "Sat", ar: "السبت" } },
  { key: "sun", label: { en: "Sun", ar: "الأحد" } },
  { key: "mon", label: { en: "Mon", ar: "الاتنين" } },
  { key: "tue", label: { en: "Tue", ar: "التلات" } },
  { key: "wed", label: { en: "Wed", ar: "الأربع" } },
  { key: "thu", label: { en: "Thu", ar: "الخميس" } },
  { key: "fri", label: { en: "Fri", ar: "الجمعة" } },
];

export const HEARD_FROM: { key: string; label: L }[] = [
  { key: "friend", label: { en: "A friend", ar: "من صاحب" } },
  { key: "social", label: { en: "Social media", ar: "السوشيال ميديا" } },
  { key: "event", label: { en: "An event or orientation", ar: "فعالية أو يوم تعريف" } },
  { key: "faculty", label: { en: "Faculty / a professor", ar: "الكلية / دكتور" } },
  { key: "other", label: { en: "Other", ar: "حاجة تانية" } },
];

export const STATUSES: { key: "new" | "contacted" | "interview" | "accepted" | "waitlist" | "rejected"; ar: string; tone: string }[] = [
  { key: "new", ar: "جديد", tone: "cyan" },
  { key: "contacted", ar: "اتواصلنا", tone: "blue" },
  { key: "interview", ar: "مقابلة", tone: "violet" },
  { key: "accepted", ar: "مقبول", tone: "green" },
  { key: "waitlist", ar: "قائمة انتظار", tone: "amber" },
  { key: "rejected", ar: "مرفوض", tone: "red" },
];

export const label = <K extends string>(list: { key: K; label: L }[], key: K | string | null | undefined, locale: string) => {
  const hit = list.find((x) => x.key === key);
  return hit ? (locale === "ar" ? hit.label.ar : hit.label.en) : (key ?? "");
};
