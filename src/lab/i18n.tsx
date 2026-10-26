"use client";
/**
 * The Lab in Arabic (right-to-left) or English (left-to-right). Code, circuit diagrams and the serial
 * monitor always stay left-to-right. The choice is remembered on the device (LAB_LANG_KEY).
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { LAB_LANG_KEY } from "./lang-script";
import type { L } from "./circuit/parts";

export type Lang = "ar" | "en";

const D = {
  lab: ["BuildX Lab", "BuildX Lab"],
  tagline: ["Imagine It. Design It. Simulate It. Build It.", "تخيّلها. صمّمها. شغّلها محاكاة. ابنيها."],
  heroBody: [
    "Wire real circuits, write Arduino code that compiles with GCC and runs on a simulated ATmega328P, and design parts in 3D — all in your browser.",
    "وصّل دواير حقيقية، اكتب كود أردوينو بيتعمله كومبايل بـ GCC وبيشتغل على معالج ATmega328P متمثّل، وصمّم قطع ثلاثية الأبعاد — كله من المتصفح.",
  ],
  createCircuit: ["Create circuit", "دايرة جديدة"],
  start3d: ["Start 3D design", "تصميم 3D جديد"],
  openCode: ["Open Code Studio", "افتح الكود ستوديو"],
  explore: ["Explore projects", "استكشف المشاريع"],
  // nav
  navHome: ["Dashboard", "الرئيسية"],
  navCircuits: ["Circuits", "الدواير"],
  nav3d: ["3D Studio", "استوديو 3D"],
  navCode: ["Code Studio", "الكود ستوديو"],
  navBlocks: ["Block Code", "البرمجة بالبلوكات"],
  navProjects: ["My projects", "مشاريعي"],
  navGallery: ["Gallery", "المعرض"],
  navLearn: ["Academy", "الأكاديمية"],
  navChallenges: ["Challenges", "التحديات"],
  navClassrooms: ["Classrooms", "الفصول"],
  navRobot: ["Robot Arena", "حلبة الروبوت"],
  navArchitect: ["Project Architect", "معماري المشاريع"],
  navComponents: ["Components", "القطع"],
  navProfile: ["Profile", "البروفايل"],
  navSettings: ["Settings", "الإعدادات"],
  navAdmin: ["Admin", "الإدارة"],
  backToSite: ["BuildX HUE site", "موقع BuildX HUE"],
  // auth
  signIn: ["Sign in", "تسجيل الدخول"],
  signOut: ["Sign out", "خروج"],
  signedInAs: ["Signed in as", "داخل باسم"],
  guest: ["Guest", "زائر"],
  guestNote: [
    "You're not signed in: your work is kept on this device only. Sign in to save projects to your account and open them anywhere.",
    "إنت مش مسجّل دخول: شغلك محفوظ على الجهاز ده بس. سجّل دخول عشان مشاريعك تتحفظ في حسابك وتفتحها من أي مكان.",
  ],
  studentCode: ["Student code", "كود الطالب"],
  pin: ["PIN", "رمز الدخول"],
  studentLogin: ["Student sign-in", "دخول الطلاب"],
  teamLogin: ["Team members sign in from the BuildX App, then come back here.", "أعضاء الفريق بيسجلوا دخول من تطبيق BuildX وبعدين يرجعوا هنا."],
  openApp: ["Open the BuildX App", "افتح تطبيق BuildX"],
  wrongLogin: ["Wrong code or PIN.", "الكود أو الرمز غلط."],
  locked: ["Too many attempts. Try again later.", "محاولات كتير. جرّب بعدين."],
  // dashboard
  yourNumbers: ["Your Lab so far", "إنجازاتك في اللاب"],
  circuitsN: ["Circuits", "دواير"],
  cadN: ["3D designs", "تصميمات 3D"],
  codeN: ["Code projects", "مشاريع كود"],
  compilesN: ["Successful compiles", "كومبايل ناجح"],
  simsN: ["Simulation runs", "مرات تشغيل المحاكاة"],
  simTime: ["Time simulated", "وقت المحاكاة"],
  activeDays: ["Active days", "أيام نشاط"],
  recent: ["Recent projects", "آخر مشاريعك"],
  noRecent: ["No projects yet. Start with a circuit or an example below.", "لسه مفيش مشاريع. ابدأ بدايرة أو مثال من تحت."],
  examples: ["Start from an example", "ابدأ من مثال"],
  examplesNote: ["Ready-made circuits with working code. Opening one makes your own copy.", "دواير جاهزة بكود شغال. لما تفتح واحدة بتتعمل نسخة ليك."],
  featured: ["From the community", "من المجتمع"],
  noFeatured: ["Nobody has published a project yet — yours could be the first.", "لسه محدش نشر مشروع — ممكن يكون مشروعك الأول."],
  learningPaths: ["Learning paths", "مسارات التعلّم"],
  componentsTitle: ["Components you can simulate", "القطع اللي تقدر تشغّلها محاكاة"],
  achievements: ["Achievements", "الإنجازات"],
  viewAll: ["View all", "عرض الكل"],
  open: ["Open", "افتح"],
  // projects
  search: ["Search", "دوّر"],
  all: ["All", "الكل"],
  favorites: ["Favorites", "المفضلة"],
  trash: ["Trash", "سلة المحذوفات"],
  sharedWithMe: ["Shared with me", "متشارك معايا"],
  newProject: ["New project", "مشروع جديد"],
  untitled: ["Untitled circuit", "دايرة من غير اسم"],
  cmProps: ["Edit properties", "تعديل الخصائص"],
  cmRotCw: ["Rotate clockwise", "لف مع عقارب الساعة"],
  cmRotCcw: ["Rotate counter-clockwise", "لف عكس عقارب الساعة"],
  cmCopy: ["Copy", "نسخ"],
  cmPaste: ["Paste", "لصق"],
  cmLock: ["Lock position", "تثبيت المكان"],
  cmUnlock: ["Unlock", "فك التثبيت"],
  cmFront: ["Bring to front", "قدّام الكل"],
  cmBack: ["Send to back", "ورا الكل"],
  cmPinout: ["View pinout", "عرض الأطراف"],
  cmDocs: ["Documentation", "الشرح"],
  cmLabel: ["Add label", "إضافة اسم"],
  cmStraighten: ["Remove bends", "شيل الانحناءات"],
  cmSelectAll: ["Select all", "تحديد الكل"],
  cmZoom100: ["Zoom 100%", "تكبير 100%"],
  cmHideGrid: ["Hide grid", "إخفاء الشبكة"],
  cmShowGrid: ["Show grid", "إظهار الشبكة"],
  alignLeft: ["Align left", "محاذاة شمال"],
  alignCenterX: ["Align centres horizontally", "توسيط أفقي"],
  alignTop: ["Align top", "محاذاة لفوق"],
  alignCenterY: ["Align centres vertically", "توسيط رأسي"],
  distributeX: ["Distribute horizontally", "توزيع أفقي"],
  distributeY: ["Distribute vertically", "توزيع رأسي"],
  importFile: ["Import file", "استيراد ملف"],
  exportFile: ["Export file", "تصدير ملف"],
  duplicate: ["Duplicate", "تكرار"],
  rename: ["Rename", "تغيير الاسم"],
  del: ["Delete", "حذف"],
  restore: ["Restore", "استرجاع"],
  versions: ["Versions", "النسخ السابقة"],
  share: ["Share", "مشاركة"],
  visibility: ["Visibility", "مين يشوفه"],
  private: ["Private", "خاص"],
  unlisted: ["Anyone with the link", "أي حد معاه اللينك"],
  public: ["Public (in the gallery)", "عام (في المعرض)"],
  copyLink: ["Copy link", "انسخ اللينك"],
  copied: ["Copied", "اتنسخ"],
  updated: ["Updated", "اتعدّل"],
  by: ["by", "بواسطة"],
  emptyProjects: ["Nothing here yet.", "مفيش حاجة هنا لسه."],
  title: ["Title", "الاسم"],
  description: ["Description", "الوصف"],
  tags: ["Tags", "التاجز"],
  save: ["Save", "حفظ"],
  saved: ["Saved", "اتحفظ"],
  saving: ["Saving…", "بيتحفظ…"],
  unsaved: ["Unsaved changes", "تعديلات مش محفوظة"],
  savedLocal: ["Saved on this device", "محفوظ على الجهاز"],
  conflict: ["Someone else saved this project. Reload their version or save yours as a copy.", "حد تاني حفظ المشروع. حمّل نسخته أو احفظ نسختك كنسخة جديدة."],
  reload: ["Reload", "حمّل من جديد"],
  saveCopy: ["Save as copy", "احفظ كنسخة"],
  cancel: ["Cancel", "إلغاء"],
  close: ["Close", "قفل"],
  confirmDelete: ["Move this project to the trash?", "تنقل المشروع لسلة المحذوفات؟"],
  readOnly: ["View only", "مشاهدة بس"],
  cloneToEdit: ["Make a copy to edit", "اعمل نسخة عشان تعدّل"],
  notFound: ["This project doesn't exist or isn't shared with you.", "المشروع ده مش موجود أو مش متشارك معاك."],
  loading: ["Loading…", "بيحمّل…"],
  error: ["Something went wrong", "حصلت مشكلة"],
  retry: ["Try again", "جرّب تاني"],
  recovered: ["Recovered unsaved work from this device.", "رجّعنا شغل مكانش اتحفظ من الجهاز ده."],
  discard: ["Discard", "تجاهل"],
  // editor
  parts: ["Parts", "القطع"],
  code: ["Code", "الكود"],
  inspector: ["Inspector", "الخصائص"],
  serial: ["Serial monitor", "السيريال مونيتور"],
  diagnostics: ["Diagnostics", "التشخيص"],
  compile: ["Compile", "كومبايل"],
  compiling: ["Compiling…", "بيعمل كومبايل…"],
  startSim: ["Start simulation", "شغّل المحاكاة"],
  pause: ["Pause", "إيقاف مؤقت"],
  resume: ["Resume", "كمّل"],
  stop: ["Stop", "إيقاف"],
  reset: ["Reset", "إعادة تشغيل"],
  undo: ["Undo", "تراجع"],
  redo: ["Redo", "إعادة"],
  rotate: ["Rotate", "لف"],
  zoomIn: ["Zoom in", "تكبير"],
  zoomOut: ["Zoom out", "تصغير"],
  fit: ["Fit to screen", "ملائمة الشاشة"],
  wireColor: ["Wire colour", "لون السلك"],
  deleteSel: ["Delete selection", "احذف المحدد"],
  noSelection: ["Select a part or wire to see its settings. Drag parts from the library; drag from a pin to draw a wire.", "اختار قطعة أو سلك عشان تشوف إعداداته. اسحب القطع من المكتبة، واسحب من أي طرف عشان ترسم سلك."],
  simulated: ["Simulated", "بتتشغّل محاكاة"],
  visualOnly: ["Visual only — simulation not supported", "شكل بس — مش بتتشغّل محاكاة"],
  partial: ["Partially simulated", "محاكاة جزئية"],
  live: ["Live reading", "قراءة مباشرة"],
  send: ["Send", "ابعت"],
  clear: ["Clear", "امسح"],
  autoscroll: ["Autoscroll", "نزول تلقائي"],
  serialEmpty: ["Serial output appears here when the program prints (Serial.begin + Serial.print).", "اللي البرنامج بيطبعه (Serial.begin + Serial.print) بيظهر هنا."],
  noIssues: ["No problems found.", "مفيش مشاكل."],
  flash: ["Flash", "الفلاش"],
  ram: ["RAM", "الرام"],
  compiledIn: ["Compiled in", "اتعمل كومبايل في"],
  compileOk: ["Compiled — ready to simulate", "الكومبايل نجح — جاهز للمحاكاة"],
  compileFailed: ["Compile failed", "الكومبايل فشل"],
  toolchainLoading: ["Downloading the compiler (once, ~7 MB)…", "بنحمّل الكومبايلر (مرة واحدة، حوالي 7 ميجا)…"],
  simTimeLabel: ["Sim time", "وقت المحاكاة"],
  speed: ["Speed", "السرعة"],
  newFile: ["New file", "ملف جديد"],
  fileName: ["File name", "اسم الملف"],
  examplesCode: ["Examples", "أمثلة"],
  sound: ["Sound", "الصوت"],
  lockedWhileRunning: ["Stop the simulation to edit the circuit.", "وقّف المحاكاة عشان تعدّل الدايرة."],
  pressHint: ["Click buttons, drag knobs and sliders while it runs.", "دوس على الزراير وحرّك البوتنشوميتر والسلايدرز وهي شغالة."],
  board: ["Board", "البورد"],
  mobileNote: ["Editing works best on a larger screen. On a phone you can browse, learn and run simulations.", "التعديل أحسن على شاشة أكبر. على الموبايل تقدر تتصفح وتتعلم وتشغّل المحاكاة."],
  exportPng: ["Image (SVG)", "صورة (SVG)"],
  exportHex: ["Firmware (.hex)", "الفيرموير (.hex)"],
  exportJson: ["Project file (.json)", "ملف المشروع (.json)"],
  exportIno: ["Sketch (.ino)", "الكود (.ino)"],
  // generic
  comingNext: ["Being built", "تحت الإنشاء"],
  comingBody: [
    "This part of the Lab isn't finished yet, so it isn't switched on. It will appear here when it works for real.",
    "الجزء ده من اللاب لسه مخلصش، فمش مفعّل. هيظهر هنا لما يشتغل بجد.",
  ],
  language: ["Language", "اللغة"],
  motion: ["Reduce motion", "تقليل الحركة"],
  motionNote: ["Follows your device setting unless you choose here.", "بيمشي على إعداد جهازك إلا لو اخترت هنا."],
  gridSnap: ["Snap to grid", "المغناطيس على الشبكة"],
  licenses: ["Open-source licenses", "تراخيص المصادر المفتوحة"],
} satisfies Record<string, [string, string]>;

export type TKey = keyof typeof D;

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: TKey) => string; l: (x: L) => string; dir: "rtl" | "ltr" };
const LangCtx = createContext<Ctx | null>(null);

const initial = (): Lang => (typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "ar");

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  useEffect(() => {
    const d = document.documentElement;
    d.lang = lang;
    d.dir = lang === "en" ? "ltr" : "rtl";
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(LAB_LANG_KEY, l);
    } catch {
      /* private mode: this visit only */
    }
    setLangState(l);
  }, []);
  const t = useCallback((k: TKey) => D[k][lang === "en" ? 0 : 1], [lang]);
  const l = useCallback((x: L) => (lang === "en" ? x.en : x.ar), [lang]);
  return <LangCtx.Provider value={{ lang, setLang, t, l, dir: lang === "en" ? "ltr" : "rtl" }}>{children}</LangCtx.Provider>;
}

export function useLang() {
  const c = useContext(LangCtx);
  if (!c) throw new Error("LangProvider missing");
  return c;
}

/** Numbers and dates in the reader's language, Latin digits either way (engineering values). */
export const fmtNum = (n: number, digits = 0) => n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
export function fmtDate(iso: string, lang: Lang) {
  return new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short" });
}
