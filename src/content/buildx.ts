/**
 * BuildX HUE community profile (Community Profile & Proposal 2026 – 2027).
 * Organisation reference content only — plans and goals, never results or people.
 */
import type { IconName } from "@/components/brand/icons";

type L = { en: string; ar: string };
type Item = { icon: IconName; title: L; body: L };

export const SEASON: L = { en: "2026 – 2027", ar: "2026 – 2027" };

export const CHALLENGES: Item[] = [
  {
    icon: "book",
    title: { en: "Mostly theory", ar: "نظري أكتر من اللازم" },
    body: {
      en: "Most of what we study is theoretical, with few chances to build.",
      ar: "أغلب اللي بندرسه نظري، وفرص التطبيق قليلة.",
    },
  },
  {
    icon: "users",
    title: { en: "No team to join", ar: "مفيش فريق تنضم له" },
    body: {
      en: "It's hard to find a team and guidance for competitions.",
      ar: "صعب تلاقي فريق ومين يوجّهك في المسابقات.",
    },
  },
  {
    icon: "layers",
    title: { en: "Study vs. industry", ar: "فجوة بين الدراسة والسوق" },
    body: {
      en: "Few chances to connect what we learn with real applications.",
      ar: "فرص قليلة نربط فيها اللي بنتعلمه بالتطبيقات الحقيقية.",
    },
  },
  {
    icon: "trophy",
    title: { en: "Few competitions", ar: "مسابقات قليلة" },
    body: {
      en: "Many students miss national and international events.",
      ar: "طلاب كتير بتفوتهم الفعاليات المحلية والدولية.",
    },
  },
];

export const SOLUTIONS: Item[] = [
  {
    icon: "wrench",
    title: { en: "Hands-on projects", ar: "مشاريع عملية" },
    body: {
      en: "Build real skills by building real things.",
      ar: "تبني مهارات حقيقية وانت بتبني حاجات حقيقية.",
    },
  },
  {
    icon: "users",
    title: { en: "Strong teams", ar: "فرق قوية" },
    body: { en: "Collaborate, learn and grow together.", ar: "نتعاون ونتعلّم ونكبر مع بعض." },
  },
  {
    icon: "trophy",
    title: { en: "Competition prep", ar: "تجهيز للمسابقات" },
    body: { en: "Represent HUE locally and internationally.", ar: "تمثّل جامعة حورس محلياً ودولياً." },
  },
  {
    icon: "handshake",
    title: { en: "Industry connections", ar: "علاقات مع الصناعة" },
    body: { en: "Bridge the gap to real-world opportunities.", ar: "نقرّب المسافة بينك وبين فرص سوق الشغل." },
  },
];

export const ACTIVITIES: Item[] = [
  {
    icon: "robot",
    title: { en: "Robotics projects", ar: "مشاريع روبوتات" },
    body: { en: "Design, build and test real robots.", ar: "نصمّم ونبني ونجرّب روبوتات حقيقية." },
  },
  {
    icon: "book",
    title: { en: "Workshops & training", ar: "ورش وتدريبات" },
    body: {
      en: "Hands-on technical and soft-skills workshops.",
      ar: "ورش عملية في المهارات التقنية والشخصية.",
    },
  },
  {
    icon: "idea",
    title: { en: "Hackathons & challenges", ar: "هاكاثونات وتحديات" },
    body: { en: "Internal and external hackathons.", ar: "هاكاثونات داخلية وخارجية." },
  },
  {
    icon: "flag",
    title: { en: "Competition preparation", ar: "التجهيز للمسابقات" },
    body: {
      en: "Form teams and get ready for national and international competitions.",
      ar: "نكوّن فرق ونستعد للمسابقات المحلية والدولية.",
    },
  },
  {
    icon: "gauge",
    title: { en: "Industry visits", ar: "زيارات صناعية" },
    body: { en: "See real industry environments up close.", ar: "نشوف بيئات الشغل الحقيقية من قريب." },
  },
  {
    icon: "calendar",
    title: { en: "Community events", ar: "فعاليات المجتمع" },
    body: { en: "Tech talks, project showcases and networking.", ar: "محاضرات تقنية وعروض مشاريع وتعارف." },
  },
];

export const LEADS: { title: L; body: L }[] = [
  {
    title: { en: "Community Lead", ar: "قائد المجتمع" },
    body: {
      en: "Overall leadership, strategy and external relations.",
      ar: "القيادة العامة والاستراتيجية والعلاقات الخارجية.",
    },
  },
  {
    title: { en: "Vice Lead", ar: "نائب القائد" },
    body: {
      en: "Supports the lead and oversees daily operations.",
      ar: "بيدعم القائد ويشرف على التشغيل اليومي.",
    },
  },
];

export const UNITS: Item[] = [
  {
    icon: "cpu",
    title: { en: "Technical Team", ar: "الفريق التقني" },
    body: { en: "Manages all technical tracks and projects.", ar: "بيدير كل المسارات والمشاريع التقنية." },
  },
  {
    icon: "calendar",
    title: { en: "Operations Team", ar: "فريق العمليات" },
    body: { en: "Organizes events, logistics and resources.", ar: "بينظّم الفعاليات واللوجستيات والموارد." },
  },
  {
    icon: "users",
    title: { en: "HR Team", ar: "فريق الموارد البشرية" },
    body: {
      en: "Recruitment, member experience and internal activities.",
      ar: "الاستقطاب وتجربة الأعضاء والأنشطة الداخلية.",
    },
  },
  {
    icon: "globe",
    title: { en: "PR & Outreach Team", ar: "فريق العلاقات العامة" },
    body: { en: "Communication, marketing and partnerships.", ar: "التواصل والتسويق والشراكات." },
  },
  {
    icon: "image",
    title: { en: "Media & Design Team", ar: "فريق الميديا والتصميم" },
    body: {
      en: "Content, visual identity and event coverage.",
      ar: "المحتوى والهوية البصرية وتغطية الفعاليات.",
    },
  },
];

export const MEMBERS: { title: L; body: L } = {
  title: { en: "Members", ar: "الأعضاء" },
  body: {
    en: "Active participants in tracks, projects, events and community activities — that's you.",
    ar: "مشاركين فعّالين في المسارات والمشاريع والفعاليات وأنشطة المجتمع — وده انت.",
  },
};

export const FACULTY: { title: L; body: L } = {
  title: { en: "Faculty support", ar: "دعم أعضاء هيئة التدريس" },
  body: {
    en: "Guided by faculty advisors from the Faculty of Artificial Intelligence, so the community stays aligned with the university's vision and academic values.",
    ar: "بتوجيه من مستشارين من كلية الذكاء الاصطناعي، عشان المجتمع يفضل ماشي مع رؤية الجامعة وقيمها الأكاديمية.",
  },
};

export const PLANNED_EVENTS: { when: L | null; icon: IconName; title: L; body: L }[] = [
  {
    when: { en: "Sep 2026", ar: "سبتمبر 2026" },
    icon: "users",
    title: { en: "Orientation Day", ar: "يوم التعريف" },
    body: {
      en: "Meet the community, the tracks and the opportunities.",
      ar: "نعرّفك بالمجتمع والمسارات والفرص.",
    },
  },
  {
    when: { en: "Oct – Nov 2026", ar: "أكتوبر – نوفمبر 2026" },
    icon: "wrench",
    title: { en: "Technical workshops", ar: "ورش تقنية" },
    body: {
      en: "Hardware, software, AI, 3D printing and more.",
      ar: "هاردوير وبرمجة وذكاء اصطناعي وطباعة ثلاثية الأبعاد وغيرها.",
    },
  },
  {
    when: null,
    icon: "trophy",
    title: { en: "BuildX Internal Challenge", ar: "تحدّي BuildX الداخلي" },
    body: {
      en: "A university-level competition to build and innovate.",
      ar: "مسابقة على مستوى الجامعة للبناء والابتكار.",
    },
  },
  {
    when: { en: "Jan – Mar 2027", ar: "يناير – مارس 2027" },
    icon: "flag",
    title: { en: "Competition preparation camps", ar: "معسكرات التحضير للمسابقات" },
    body: {
      en: "Training and team building for national and international competitions.",
      ar: "تدريب وبناء فرق للمسابقات المحلية والدولية.",
    },
  },
  {
    when: { en: "Feb – Apr 2027", ar: "فبراير – أبريل 2027" },
    icon: "gauge",
    title: { en: "Industry visits", ar: "زيارات صناعية" },
    body: { en: "Visits to leading companies and factories.", ar: "زيارات لشركات ومصانع كبيرة." },
  },
  {
    when: null,
    icon: "idea",
    title: { en: "Tech talks & guest speakers", ar: "محاضرات وضيوف" },
    body: {
      en: "Experts from industry, startups and academia.",
      ar: "خبراء من الصناعة والشركات الناشئة والجامعات.",
    },
  },
  {
    when: null,
    icon: "image",
    title: { en: "Project exhibition", ar: "معرض المشاريع" },
    body: { en: "Showcasing student projects and prototypes.", ar: "بنعرض مشاريع ونماذج الطلاب." },
  },
];

export const ROADMAP: { q: string; when: L; title: L; items: L[] }[] = [
  {
    q: "Q1",
    when: { en: "Sep – Nov 2026", ar: "سبتمبر – نوفمبر 2026" },
    title: { en: "Build the foundation", ar: "بناء الأساس" },
    items: [
      { en: "Orientation & recruitment", ar: "التعريف والتسجيل" },
      { en: "Introductory workshops", ar: "ورش تمهيدية" },
      { en: "Forming interest groups", ar: "تكوين مجموعات الاهتمام" },
      { en: "First internal challenge", ar: "أول تحدٍّ داخلي" },
    ],
  },
  {
    q: "Q2",
    when: { en: "Dec 2026 – Feb 2027", ar: "ديسمبر 2026 – فبراير 2027" },
    title: { en: "Develop & train", ar: "التطوير والتدريب" },
    items: [
      { en: "Technical bootcamps", ar: "معسكرات تقنية" },
      { en: "Project development", ar: "تطوير المشاريع" },
      { en: "Competition preparation", ar: "التحضير للمسابقات" },
      { en: "Industry visits", ar: "زيارات صناعية" },
    ],
  },
  {
    q: "Q3",
    when: { en: "Mar – May 2027", ar: "مارس – مايو 2027" },
    title: { en: "Compete & showcase", ar: "المنافسة والعرض" },
    items: [
      { en: "National & international competitions", ar: "مسابقات محلية ودولية" },
      { en: "BuildX Hackathon", ar: "هاكاثون BuildX" },
      { en: "Project exhibition", ar: "معرض المشاريع" },
      { en: "Guest talks & networking", ar: "محاضرات وتعارف" },
    ],
  },
  {
    q: "Q4",
    when: { en: "Jun – Aug 2027", ar: "يونيو – أغسطس 2027" },
    title: { en: "Evaluate & grow", ar: "التقييم والنمو" },
    items: [
      { en: "Impact assessment", ar: "تقييم الأثر" },
      { en: "Community expansion", ar: "توسيع المجتمع" },
      { en: "New partnerships", ar: "شراكات جديدة" },
      { en: "Plan for next year", ar: "خطة السنة الجاية" },
    ],
  },
];

/** Targets for the season — goals, not results. */
export const GOALS: { value: string; label: L; note: L }[] = [
  {
    value: "100+",
    label: { en: "Active members", ar: "عضو نشط" },
    note: { en: "by the end of 2026 – 2027", ar: "بنهاية 2026 – 2027" },
  },
  {
    value: "10+",
    label: { en: "Competitions", ar: "مسابقة" },
    note: { en: "national & international", ar: "محلية ودولية" },
  },
  {
    value: "20+",
    label: { en: "Workshops", ar: "ورشة" },
    note: { en: "technical, soft skills & industry", ar: "تقنية ومهارات وصناعة" },
  },
  {
    value: "15+",
    label: { en: "Projects", ar: "مشروع" },
    note: { en: "robotics, AI, IoT, software & more", ar: "روبوتات وAI وIoT وبرمجيات وأكتر" },
  },
  {
    value: "5+",
    label: { en: "Industry partners", ar: "شريك من الصناعة" },
    note: { en: "companies, sponsors & organizations", ar: "شركات ورعاة ومؤسسات" },
  },
];

export const PARTNERSHIP: Item[] = [
  {
    icon: "calendar",
    title: { en: "Event sponsorship", ar: "رعاية الفعاليات" },
    body: { en: "Support our events, competitions and workshops.", ar: "ادعم فعالياتنا ومسابقاتنا وورشنا." },
  },
  {
    icon: "cpu",
    title: { en: "Equipment support", ar: "دعم بالمعدات" },
    body: { en: "Provide tools, components and technology.", ar: "وفّر أدوات ومكوّنات وتكنولوجيا." },
  },
  {
    icon: "rocket",
    title: { en: "Internships & training", ar: "تدريب وفرص عمل" },
    body: {
      en: "Offer internships, training programs and industry exposure.",
      ar: "قدّم فرص تدريب وبرامج تأهيل واحتكاك بالصناعة.",
    },
  },
  {
    icon: "users",
    title: { en: "Mentorship", ar: "إرشاد" },
    body: {
      en: "Technical and career guidance from industry experts.",
      ar: "توجيه تقني ومهني من خبراء الصناعة.",
    },
  },
  {
    icon: "layers",
    title: { en: "Collaborative projects", ar: "مشاريع مشتركة" },
    body: { en: "Work on real-world projects with our teams.", ar: "اشتغل على مشاريع حقيقية مع فرقنا." },
  },
  {
    icon: "eye",
    title: { en: "Brand visibility", ar: "ظهور للعلامة" },
    body: {
      en: "Presence at events, media coverage and university promotion.",
      ar: "تواجد في الفعاليات والتغطية الإعلامية ودعاية الجامعة.",
    },
  },
];

export const JOIN_STEPS: { title: L; body: L }[] = [
  {
    title: { en: "Pick a track", ar: "اختار مسار" },
    body: { en: "Choose the one that matches your interests.", ar: "اختار المسار اللي يناسب اهتمامك." },
  },
  {
    title: { en: "Send us a message", ar: "ابعتلنا رسالة" },
    body: {
      en: "Your name, faculty, year and the track you like.",
      ar: "اسمك وكليتك وسنتك والمسار اللي عاجبك.",
    },
  },
  {
    title: { en: "Come to Orientation", ar: "احضر يوم التعريف" },
    body: { en: "Meet the community and the tracks.", ar: "اتعرّف على المجتمع والمسارات." },
  },
  {
    title: { en: "Start building", ar: "ابدأ البناء" },
    body: { en: "Join a team and work on a real project.", ar: "انضم لفريق واشتغل على مشروع حقيقي." },
  },
];

export const l = (x: L, locale: string) => (locale === "ar" ? x.ar : x.en);
