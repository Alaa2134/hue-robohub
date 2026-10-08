/**
 * Playing with Baqloz: the quiz questions, the badges you collect, and what the guide remembers about
 * your games on this device (localStorage, nothing leaves the browser). The games themselves live in
 * the guide: the quiz in his menu, the hoop and hide-and-seek on the page (MascotController).
 */
import type { Text } from "@/config/mascotJourney";

export type QuizQuestion = { q: Text; options: Text[]; answer: number; why: Text };

const t = (ar: string, en: string): Text => ({ ar, en });

/** General tech and BuildX questions (BuildX facts are the ones the site itself states). */
export const QUIZ: QuizQuestion[] = [
  { q: t("الأردوينو أونو جواه ميكروكنترولر اسمه إيه؟", "Which microcontroller is on the Arduino Uno?"), options: [t("ATmega328P", "ATmega328P"), t("ESP32", "ESP32"), t("Raspberry Pi", "Raspberry Pi")], answer: 0, why: t("الأونو جواه ATmega328P، والـ ESP32 بورد تانية خالص 💡", "The Uno runs on an ATmega328P; the ESP32 is a different board 💡") },
  { q: t("أنهي حساس بيقيس المسافة بالموجات فوق الصوتية؟", "Which sensor measures distance with ultrasound?"), options: [t("HC-SR04", "HC-SR04"), t("LDR", "LDR"), t("DHT11", "DHT11")], answer: 0, why: t("الـ HC-SR04 بيبعت موجة ويستنى صداها… زي الخفاش بالظبط 🦇", "The HC-SR04 sends a pulse and times the echo, like a bat 🦇") },
  { q: t("روبوت اللاين فولور بيشوف الخط غالباً بإيه؟", "How does a line follower usually see the line?"), options: [t("حساسات IR", "IR sensors"), t("GPS", "GPS"), t("ميكروفون", "A microphone")], answer: 0, why: t("حساسات الـ IR بتفرّق بين الأبيض والأسود من انعكاس الضوء.", "IR sensors tell black from white by reflected light.") },
  { q: t("أشهر لغة برمجة في الذكاء الاصطناعي؟", "The most popular language for AI?"), options: [t("Python", "Python"), t("HTML", "HTML"), t("CSS", "CSS")], answer: 0, why: t("بايثون ومكتباتها زي PyTorch وscikit-learn هما الأساس 🐍", "Python, with PyTorch and scikit-learn 🐍") },
  { q: t("LED اختصار لإيه؟", "What does LED stand for?"), options: [t("Light Emitting Diode", "Light Emitting Diode"), t("Low Energy Device", "Low Energy Device"), t("Light Electric Display", "Light Electric Display")], answer: 0, why: t("دايود بيطلّع ضوء… وعشان كده ليه رجل موجبة ورجل سالبة.", "A diode that gives off light, so it has a + and a − leg.") },
  { q: t("قانون أوم: الجهد V يساوي…", "Ohm's law: voltage V equals…"), options: [t("I × R", "I × R"), t("I ÷ R", "I ÷ R"), t("R ÷ I", "R ÷ I")], answer: 0, why: t("V = I × R… أول قانون هتحتاجه في أي دايرة ⚡", "V = I × R, the first law of every circuit ⚡") },
  { q: t("الـ PWM بنستخدمه عشان…", "PWM is used to…"), options: [t("نتحكم في سرعة الموتور أو إضاءة الـ LED", "control motor speed or LED brightness"), t("نخزّن داتا", "store data"), t("نتصل بالواي فاي", "connect to Wi-Fi")], answer: 0, why: t("بنشغّل ونطفّي بسرعة جداً، والنسبة بينهم بتحدد القوة.", "Switching on and off very fast; the ratio sets the power.") },
  { q: t("أنهي موتور بيلف بزاوية محددة بالظبط؟", "Which motor turns to an exact angle?"), options: [t("سيرفو", "Servo"), t("موتور DC عادي", "Plain DC motor"), t("مروحة كمبيوتر", "PC fan")], answer: 0, why: t("السيرفو جواه فيدباك بيعرفه هو فين بالظبط 🎯", "A servo has feedback that knows exactly where it is 🎯") },
  { q: t("IoT اختصار لإيه؟", "What does IoT stand for?"), options: [t("Internet of Things", "Internet of Things"), t("Input Output Tech", "Input Output Tech"), t("Internal Operating Tool", "Internal Operating Tool")], answer: 0, why: t("إنترنت الأشياء: أجهزة وحساسات بتكلّم بعض على النت 📡", "Devices and sensors talking over the internet 📡") },
  { q: t("الـ ESP32 مميز عن الأردوينو أونو بإيه؟", "What does an ESP32 have that an Uno doesn't?"), options: [t("واي فاي وبلوتوث", "Wi-Fi and Bluetooth"), t("حجمه أكبر وبس", "It's just bigger"), t("مبيتبرمجش", "It can't be programmed")], answer: 0, why: t("عشان كده هو نجم مشاريع الـ IoT ⭐", "That's why it's the IoT favourite ⭐") },
  { q: t("في مسابقة السومو، المطلوب إيه؟", "In robot sumo, the goal is to…"), options: [t("تزق الروبوت التاني برّه الحلبة", "push the other robot out of the ring"), t("تمشي على خط", "follow a line"), t("تطير أعلى مسافة", "fly the highest")], answer: 0, why: t("يا تزُق يا تتزق 💥", "Push or get pushed 💥") },
  { q: t("طابعات الـ 3D المنتشرة بتطبع بخامة إيه غالباً؟", "Common 3D printers mostly print with…"), options: [t("PLA", "PLA"), t("ورق", "Paper"), t("زجاج", "Glass")], answer: 0, why: t("الـ PLA بلاستيك سهل في الطباعة ومعمول من النشا 🌽", "PLA is an easy plastic made from starch 🌽") },
  { q: t("Git بنستخدمه في إيه؟", "What is Git for?"), options: [t("نحفظ نسخ الكود ونشتغل عليه كفريق", "versioning code and teamwork"), t("تصميم جرافيك", "graphic design"), t("تشغيل الموتور", "driving motors")], answer: 0, why: t("كل تعديل محفوظ… ولو بوّظت حاجة ترجع بسهولة 😅", "Every change is saved, so mistakes are easy to undo 😅") },
  { q: t("CPU اختصار لإيه؟", "What does CPU stand for?"), options: [t("Central Processing Unit", "Central Processing Unit"), t("Computer Power Unit", "Computer Power Unit"), t("Central Program Utility", "Central Program Utility")], answer: 0, why: t("المخ اللي بينفّذ الأوامر 🧠", "The brain that runs the instructions 🧠") },
  { q: t("أنهي حساس بيقيس الحرارة والرطوبة؟", "Which sensor reads temperature and humidity?"), options: [t("DHT11", "DHT11"), t("HC-SR04", "HC-SR04"), t("Servo", "Servo")], answer: 0, why: t("الـ DHT11 صغير ورخيص وموجود في مشاريع كتير 🌡️", "The DHT11 is small, cheap and everywhere 🌡️") },
  { q: t("الـ Machine Learning ببساطة يعني…", "Machine learning, simply put, means…"), options: [t("الآلة بتتعلم من الداتا", "the machine learns from data"), t("الآلة بتصلّح نفسها", "the machine repairs itself"), t("تكبير الصور", "making images bigger")], answer: 0, why: t("بتديها أمثلة كتير، فتتعلم توقّع لوحدها.", "Give it many examples and it learns to predict.") },
  { q: t("لغة HTML بنستخدمها في…", "HTML is used for…"), options: [t("بناء صفحات الويب", "building web pages"), t("تشغيل الروبوت", "running robots"), t("تدريب الموديلات", "training models")], answer: 0, why: t("الموقع اللي إنت فيه دلوقتي متبني بيها 😉", "This very site is built with it 😉") },
  { q: t("بطاريات الـ LiPo مشهورة في…", "LiPo batteries are popular in…"), options: [t("الدرونز والروبوتات", "drones and robots"), t("الساعات الحيطة", "wall clocks"), t("الريموت كنترول بتاع التلفزيون", "TV remotes")], answer: 0, why: t("خفيفة وبتدي تيار عالي… بس لازم تتعامل معاها بحرص ⚠️", "Light with high current, but handle with care ⚠️") },
  { q: t("شعار BuildX HUE إيه؟", "What's the BuildX HUE motto?"), options: [t("Build • Innovate • Compete", "Build • Innovate • Compete"), t("Code • Sleep • Repeat", "Code • Sleep • Repeat"), t("Learn • Play • Win", "Learn • Play • Win")], answer: 0, why: t("نتعلم بإيدينا، ونبتكر، وننافس بجد 💪", "Learn by building, invent, compete for real 💪") },
  { q: t("BuildX HUE تبع أنهي جامعة؟", "BuildX HUE belongs to which university?"), options: [t("جامعة حورس", "Horus University"), t("جامعة القاهرة", "Cairo University"), t("الجامعة الأمريكية", "The American University")], answer: 0, why: t("مجتمع طلابي في جامعة حورس – مصر 🇪🇬", "A student community at Horus University, Egypt 🇪🇬") },
  { q: t("عندنا كام تراك في BuildX؟", "How many tracks does BuildX have?"), options: [t("٧", "7"), t("٣", "3"), t("١٢", "12")], answer: 0, why: t("روبوتكس، AI، سوفتوير، IoT، 3D، ميديا، وبيزنس.", "Robotics, AI, software, IoT, 3D, media and business.") },
  { q: t("اسم مرشد الموقع إيه؟ 😄", "What's the site guide's name? 😄"), options: [t("بقلظ", "Baqloz"), t("روبي", "Robby"), t("زيكو", "Ziko")], answer: 0, why: t("أيوه أنا 😎 متنساش الاسم تاني.", "That's me 😎 Don't forget it.") },
  { q: t("لو عايز تتأكد إن شهادة BuildX أصلية تروح فين؟", "Where do you check a BuildX certificate is genuine?"), options: [t("صفحة التحقق (verify)", "The verify page"), t("صفحة الأخبار", "The news page"), t("صفحة الفريق", "The team page")], answer: 0, why: t("اكتب الكود أو امسح الـ QR اللي على الشهادة 🔍", "Type the code or scan the QR on it 🔍") },
];

/** A round: `n` questions in random order, each with its options shuffled. */
export function quizRound(n = 8): QuizQuestion[] {
  const pick = [...QUIZ].sort(() => Math.random() - 0.5).slice(0, n);
  return pick.map((x) => {
    const order = x.options.map((_, i) => i).sort(() => Math.random() - 0.5);
    return { ...x, options: order.map((i) => x.options[i]), answer: order.indexOf(x.answer) };
  });
}

export type BadgeId = "explorer" | "tourist" | "thrower" | "hooper" | "brain" | "seeker" | "quick" | "streak" | "chatter";
export const BADGES: { id: BadgeId; icon: string; name: Text; how: Text }[] = [
  { id: "tourist", icon: "🧭", name: t("السائح", "Tourist"), how: t("خلّص الجولة الكاملة مع بقلظ", "Finish the full tour with Baqloz") },
  { id: "explorer", icon: "🗺️", name: t("المستكشف", "Explorer"), how: t("لف كل صفحات الموقع", "Visit every page of the site") },
  { id: "chatter", icon: "💬", name: t("الفضولي", "Curious"), how: t("اسأل بقلظ ٥ أسئلة", "Ask Baqloz 5 questions") },
  { id: "brain", icon: "🧠", name: t("العبقري", "Genius"), how: t("جيب ٧ من ٨ أو أكتر في الكويز", "Score 7/8 or more in the quiz") },
  { id: "hooper", icon: "🏀", name: t("نجم السلة", "Hoop star"), how: t("جيب ٥ أهداف في جولة سلة واحدة", "Score 5 in one hoop round") },
  { id: "seeker", icon: "🙈", name: t("المحقق", "Detective"), how: t("لاقي بقلظ في الاستغماية", "Find Baqloz at hide-and-seek") },
  { id: "quick", icon: "⚡", name: t("عين الصقر", "Eagle eye"), how: t("لاقيه في أقل من ١٥ ثانية", "Find him in under 15 seconds") },
  { id: "thrower", icon: "🤾", name: t("قلبك جامد", "Heartless"), how: t("ارمي بقلظ ٥ مرات 😅", "Throw Baqloz 5 times 😅") },
  { id: "streak", icon: "🔥", name: t("مواظب", "Regular"), how: t("ادخل الموقع ٣ أيام ورا بعض", "Visit 3 days in a row") },
];

export type Progress = {
  badges: BadgeId[];
  throws: number;
  asked: number;
  quizBest: number;
  hoopBest: number;
  seekBest: number | null;
  streak: number;
  lastDay: string;
};

const KEY = "bx-guide-play";
const empty: Progress = { badges: [], throws: 0, asked: 0, quizBest: 0, hoopBest: 0, seekBest: null, streak: 0, lastDay: "" };

function load(): Progress {
  try {
    return { ...empty, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Progress>) };
  } catch {
    return { ...empty };
  }
}

const listeners = new Set<(b: BadgeId) => void>();
const changed = new Set<() => void>();

export const play = {
  get: load,
  /** Update the saved progress; returns the new value. */
  update(fn: (p: Progress) => Partial<Progress>): Progress {
    const p = load();
    const next = { ...p, ...fn(p) };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    changed.forEach((f) => f());
    return next;
  },
  /** Earn a badge (once). Listeners (the guide) celebrate it. */
  award(id: BadgeId): boolean {
    if (load().badges.includes(id)) return false;
    play.update((p) => ({ badges: [...p.badges, id] }));
    listeners.forEach((f) => f(id));
    return true;
  },
  onBadge(fn: (b: BadgeId) => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  onChange(fn: () => void) {
    changed.add(fn);
    return () => void changed.delete(fn);
  },
};

/** Days in a row with a visit (counted once a day). Returns the streak and whether today is new. */
export function visitToday(now = new Date()): { streak: number; fresh: boolean } {
  const day = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const today = day(now);
  const p = load();
  if (p.lastDay === today) return { streak: p.streak, fresh: false };
  const yesterday = day(new Date(now.getTime() - 86_400_000));
  const streak = p.lastDay === yesterday ? p.streak + 1 : 1;
  play.update(() => ({ streak, lastDay: today }));
  if (streak >= 3) play.award("streak");
  return { streak, fresh: true };
}
