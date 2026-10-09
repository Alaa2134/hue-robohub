import type { IconName } from "@/components/brand/icons";

/**
 * The team's visit to Robotex & NDTX Expo 2026 (from the organisers' brochure, expo.ndtcorner.com).
 * Applications go through the website form "robotex-2026", managed in the BuildX App → الفورمات.
 */
export const EXPO_FORM = "robotex-2026";
export const EXPO_SITE = "https://expo.ndtcorner.com";

const ar = {
  meta: { title: "زيارة معرض Robotex 2026", description: "BuildX HUE رايح زيارة لمعرض Robotex & NDTX 2026 للروبوتات والذكاء الاصطناعي والأتمتة الصناعية، 14–16 نوفمبر في مركز مصر للمعارض الدولية. قدّم من هنا." },
  eyebrow: "زيارة BuildX HUE",
  title: "Robotex & NDTX Expo 2026",
  body: "رايحين مع بعض لأول نسخة من معرض الروبوتات والذكاء الاصطناعي الصناعي في أفريقيا، جنب معرض NDTX للفحص والجودة. قدّم، واستنى القبول، وإحنا نرتّب الباقي.",
  apply: "قدّم على الزيارة",
  track: "تابع طلبك",
  facts: [
    { k: "14–16", t: "نوفمبر 2026", d: "المواعيد" },
    { k: "EIEC", t: "القاهرة الجديدة", d: "مركز مصر للمعارض الدولية" },
    { k: "+100", t: "عارض", d: "في نسخة 2025 من NDTX" },
    { k: "+7,000", t: "زائر", d: "في نسخة 2025" },
  ],
  aboutEyebrow: "عن المعرض",
  aboutTitle: "معرضين في مكان واحد",
  about: [
    { name: "ROBOTEX 26", tag: "النسخة الأولى", body: "معرض ومؤتمر دولي لتكنولوجيا الروبوتات والذكاء الاصطناعي والأنظمة الذكية وحلول المصانع الحديثة: أذرع روبوتية وروبوتات تعاونية، رؤية الآلة، الطائرات المسيرة، والتحول الرقمي." },
    { name: "NDTX 26", tag: "النسخة التالتة", body: "أكبر معرض في أفريقيا والشرق الأوسط للفحص غير الإتلافي (NDT) واللحام والتفتيش الهندسي والجودة والتآكل وتكامل الأصول، بحضور شركات ومتخصصين من البترول والطاقة والطيران والإنشاءات." },
  ],
  seeEyebrow: "هتشوف إيه",
  seeTitle: "أهم مجالات المعرض",
  see: [
    { icon: "robot", t: "الروبوتات الصناعية", b: "أذرع روبوتية، روبوتات تعاونية، أنظمة ذاتية التشغيل وتطبيقاتها." },
    { icon: "ai", t: "الذكاء الاصطناعي ورؤية الآلة", b: "الفحص بالذكاء الاصطناعي، تحليل الصور والقرارات الذكية." },
    { icon: "autonomous", t: "الطائرات المسيرة والأنظمة الذاتية", b: "طائرات صناعية وتشغيل عن بُعد وحلول ذاتية للبيئات الصناعية." },
    { icon: "sensor", t: "الفحص الروبوتي", b: "الفحص غير الإتلافي الآلي والمسح الروبوتي ومنصات الفحص المتقدمة." },
    { icon: "gauge", t: "الجودة والقياس والمعايرة", b: "رؤية الآلة وأنظمة الجودة الآلية." },
    { icon: "cpu", t: "التحول الرقمي والمصانع الذكية", b: "تحليل البيانات والحلول الرقمية لإدارة الأصول." },
  ] as { icon: IconName; t: string; b: string }[],
  stepsEyebrow: "الزيارة ماشية إزاي",
  stepsTitle: "4 خطوات وتبقى في المعرض",
  steps: [
    { t: "قدّم", b: "املأ الفورم تحت. هيظهرلك كود طلب، احتفظ بيه." },
    { t: "الفريق بيراجع", b: "بنراجع الطلبات ونبعتلك على واتساب أول ما تتقبل." },
    { t: "سجّل في موقع المعرض", b: "بعد القبول، من «تابع طلبك» هتلاقي زرار التسجيل كزائر في موقع المعرض. سجّل واضغط «سجّلت»." },
    { t: "يوم الزيارة", b: "هنبعتلك ميعاد ومكان التجمع. تعالى في ميعادك ومعاك البادج أو الإيميل بتاع التسجيل." },
  ],
  applyEyebrow: "التقديم",
  applyTitle: "قدّم على الزيارة",
  statusEyebrow: "تابع طلبك",
  statusTitle: "اعرف حالة طلبك",
  statusBody: "اكتب كود الطلب ورقم الموبايل اللي قدّمت بيه. لو اتقبلت هتلاقي خطوة التسجيل في موقع المعرض هنا.",
  faqEyebrow: "أسئلة",
  faqTitle: "قبل ما تقدّم",
  faq: [
    { q: "الزيارة لمين؟", a: "لطلاب BuildX HUE وأي طالب مهتم بالروبوتات والذكاء الاصطناعي والهندسة. الأولوية لطلاب الفريق." },
    { q: "التسجيل في المعرض بفلوس؟", a: "التسجيل كزائر بيكون من موقع المعرض نفسه، وبنبعتلك اللينك بعد القبول. أي تفاصيل عن المواصلات بتوصلك على واتساب." },
    { q: "أقدر أروح لوحدي؟", a: "أيوه، اختار «هوصل المعرض لوحدي» في الفورم، وقابلنا هناك في الميعاد اللي هنبعته." },
    { q: "نسيت كود الطلب", a: "قدّم تاني بنفس رقم الموبايل، وهيظهرلك نفس الكود." },
  ],
  official: "موقع المعرض الرسمي",
};

const en: typeof ar = {
  meta: { title: "Robotex 2026 expo visit", description: "BuildX HUE is visiting Robotex & NDTX Expo 2026 (industrial robotics, AI and automation), 14–16 November at the Egypt International Exhibition Center. Apply here." },
  eyebrow: "A BuildX HUE visit",
  title: "Robotex & NDTX Expo 2026",
  body: "We're going together to the first edition of Africa's industrial robotics and AI expo, next to NDTX, the testing and quality expo. Apply, wait for your acceptance, and we'll arrange the rest.",
  apply: "Apply for the visit",
  track: "Check your application",
  facts: [
    { k: "14–16", t: "November 2026", d: "Dates" },
    { k: "EIEC", t: "New Cairo", d: "Egypt International Exhibition Center" },
    { k: "100+", t: "exhibitors", d: "at NDTX 2025" },
    { k: "7,000+", t: "visitors", d: "in 2025" },
  ],
  aboutEyebrow: "The expo",
  aboutTitle: "Two expos in one place",
  about: [
    { name: "ROBOTEX 26", tag: "1st edition", body: "An international expo and conference on robotics, AI, smart systems and modern factories: robot arms and cobots, machine vision, drones and digital transformation." },
    { name: "NDTX 26", tag: "3rd edition", body: "The largest expo in Africa and the Middle East for non-destructive testing, welding, engineering inspection, quality, corrosion and asset integrity, with companies and experts from oil and gas, power, aviation and construction." },
  ],
  seeEyebrow: "What you'll see",
  seeTitle: "The expo's main areas",
  see: [
    { icon: "robot", t: "Industrial robots", b: "Robot arms, cobots, autonomous systems and their applications." },
    { icon: "ai", t: "AI and machine vision", b: "AI inspection, image analysis and smart decisions." },
    { icon: "autonomous", t: "Drones and autonomous systems", b: "Industrial drones, remote operation and autonomous solutions." },
    { icon: "sensor", t: "Robotic inspection", b: "Automated NDT, robotic scanning and advanced inspection platforms." },
    { icon: "gauge", t: "Quality, measurement and calibration", b: "Machine vision and automated quality systems." },
    { icon: "cpu", t: "Digital transformation and smart factories", b: "Data analysis and digital asset management." },
  ],
  stepsEyebrow: "How the visit works",
  stepsTitle: "Four steps to the expo",
  steps: [
    { t: "Apply", b: "Fill in the form below. You'll get a reference code; keep it." },
    { t: "The team reviews", b: "We review applications and message you on WhatsApp once you're accepted." },
    { t: "Register on the expo site", b: "Once accepted, “Check your application” shows the button to register as a visitor on the expo site. Register, then tap “I've registered”." },
    { t: "Visit day", b: "We'll send the meeting time and place. Come on time with your badge or registration email." },
  ],
  applyEyebrow: "Apply",
  applyTitle: "Apply for the visit",
  statusEyebrow: "Check your application",
  statusTitle: "Your application status",
  statusBody: "Enter your reference code and the mobile number you applied with. If you're accepted, the expo registration step is here.",
  faqEyebrow: "Questions",
  faqTitle: "Before you apply",
  faq: [
    { q: "Who is the visit for?", a: "BuildX HUE students and any student interested in robotics, AI and engineering. Team students come first." },
    { q: "Does the expo registration cost anything?", a: "Visitors register on the expo's own site; we send you the link once you're accepted. Transport details come on WhatsApp." },
    { q: "Can I go on my own?", a: "Yes, choose “I'll get to the expo myself” in the form and meet us there at the time we send." },
    { q: "I lost my reference code", a: "Apply again with the same mobile number and you'll see the same code." },
  ],
  official: "Official expo website",
};

export const expoVisit = (locale: string) => (locale === "ar" ? ar : en);
