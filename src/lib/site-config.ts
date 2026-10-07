/**
 * CMS-editable site configuration. Defaults live here; the `settings` table overrides them per key.
 * Everything a non-developer may need to change about the public site is reachable from these keys.
 */

export type Localized = { en: string; ar?: string };

export type HeroConfig = {
  eyebrow: Localized;
  lines: [Localized, Localized, Localized];
  subtitle: Localized;
  primaryCta: { label: Localized; href: string };
  secondaryCta: { label: Localized; href: string };
  /** Optional hero film (videos.id). When set it replaces the 3D scene on capable devices. */
  videoId?: string | null;
};

export type ContactConfig = {
  email: string;
  phone: string;
  whatsapp: string;
  address: Localized;
  hours: Localized;
  mapUrl: string;
};

export type SocialConfig = {
  linkedin: string;
  facebook: string;
  instagram: string;
  youtube: string;
  github: string;
};

export type AboutConfig = {
  vision: Localized;
  mission: Localized;
  story: Localized;
  values: Array<{ title: Localized; body: Localized }>;
};

export type HomepageConfig = {
  manifesto: Localized;
  sections: {
    tracks: boolean;
    anatomy: boolean;
    projects: boolean;
    teams: boolean;
    bootcamp: boolean;
    achievements: boolean;
    events: boolean;
    sponsors: boolean;
  };
};

export type RecruitmentConfig = {
  open: boolean;
  headline: Localized;
  closedMessage: Localized;
};

export type SeoConfig = { description: string; descriptionAr?: string; keywords: string[] };

export type SiteConfig = {
  "site.hero": HeroConfig;
  "site.contact": ContactConfig;
  "site.socials": SocialConfig;
  "site.about": AboutConfig;
  "site.homepage": HomepageConfig;
  "site.recruitment": RecruitmentConfig;
  "site.seo": SeoConfig;
};

export type SettingKey = keyof SiteConfig;

export const SITE_NAME = "BuildX HUE";
export const SITE_SUBTITLE = "Student Innovation & Robotics Community";
export const SITE_SLOGAN = "Build • Innovate • Compete";

export const defaultSiteConfig: SiteConfig = {
  "site.hero": {
    eyebrow: {
      en: "Student Innovation & Robotics Community · Horus University",
      ar: "مجتمع الابتكار والروبوتات الطلابي · جامعة حورس",
    },
    lines: [
      { en: "Build.", ar: "ابنِ." },
      { en: "Innovate.", ar: "ابتكر." },
      { en: "Compete.", ar: "نافس." },
    ],
    subtitle: {
      en: "A student-led community for everyone who loves robotics, AI and technology. Learn by building real projects, join a team, and represent Horus University in competitions.",
      ar: "مجتمع طلابي لكل اللي بيحب الروبوتات والذكاء الاصطناعي والتكنولوجيا. اتعلّم بتنفيذ مشاريع حقيقية، انضم لفريق، ومثّل جامعة حورس في المسابقات.",
    },
    primaryCta: { label: { en: "Join BuildX HUE", ar: "انضم لـ BuildX HUE" }, href: "/join" },
    secondaryCta: { label: { en: "Explore the tracks", ar: "اكتشف المسارات" }, href: "/tracks" },
    videoId: null,
  },
  "site.contact": {
    email: "alaa00saber@gmail.com",
    phone: "01065316500",
    whatsapp: "201065316500",
    address: {
      en: "Horus University — Egypt, New Damietta",
      ar: "جامعة حورس — مصر، دمياط الجديدة",
    },
    hours: { en: "Faculty of Artificial Intelligence", ar: "كلية الذكاء الاصطناعي" },
    mapUrl: "",
  },
  "site.socials": { linkedin: "", facebook: "", instagram: "", youtube: "", github: "" },
  "site.about": {
    vision: {
      en: "To be the leading student community at Horus University for robotics and technology — recognised locally and internationally for innovation, impactful projects and student success.",
      ar: "إننا نكون المجتمع الطلابي الأول في جامعة حورس في الروبوتات والتكنولوجيا، ومعروفين محلياً ودولياً بالابتكار والمشاريع المؤثرة ونجاح الطلاب.",
    },
    mission: {
      en: "To empower students through hands-on learning, collaboration and real-world projects in robotics, AI and emerging technologies — preparing them for national and international competitions and future careers.",
      ar: "إننا نمكّن الطلاب بالتعلّم العملي والتعاون والمشاريع الحقيقية في الروبوتات والذكاء الاصطناعي والتقنيات الحديثة، ونجهّزهم للمسابقات المحلية والدولية ولشغل المستقبل.",
    },
    story: {
      en: "BuildX HUE is a student-led community at Horus University that brings together students who are passionate about robotics, technology, engineering and innovation. We learn together, build real-world projects, and prepare for national and international competitions.",
      ar: "BuildX HUE مجتمع بيقوده الطلاب في جامعة حورس، بيجمع كل اللي شغوف بالروبوتات والتكنولوجيا والهندسة والابتكار. بنتعلّم مع بعض، وبنبني مشاريع حقيقية، وبنستعد للمسابقات المحلية والدولية.",
    },
    values: [
      { title: { en: "Innovation", ar: "الابتكار" }, body: { en: "Turning ideas into real solutions.", ar: "نحوّل الأفكار لحلول حقيقية." } },
      { title: { en: "Teamwork", ar: "الشغل الجماعي" }, body: { en: "We are stronger together.", ar: "إحنا أقوى مع بعض." } },
      { title: { en: "Excellence", ar: "التميّز" }, body: { en: "Always aiming higher.", ar: "دايماً بنطمح لأعلى." } },
      { title: { en: "Learning by doing", ar: "التعلّم بالتطبيق" }, body: { en: "Hands-on experience matters.", ar: "التجربة العملية هي اللي بتفرق." } },
      { title: { en: "Leadership", ar: "القيادة" }, body: { en: "Creating the leaders of tomorrow.", ar: "بنصنع قادة المستقبل." } },
      { title: { en: "Community", ar: "المجتمع" }, body: { en: "A supportive and welcoming place for everyone.", ar: "مكان داعم ومرحّب بالجميع." } },
    ],
  },
  "site.homepage": {
    manifesto: {
      en: "Learn. Build. Compete. Lead.",
      ar: "اتعلّم. ابنِ. نافس. قود.",
    },
    sections: {
      tracks: true,
      anatomy: true,
      projects: true,
      teams: true,
      bootcamp: true,
      achievements: true,
      events: true,
      sponsors: true,
    },
  },
  "site.recruitment": {
    open: true,
    headline: { en: "Let's build the next generation of innovators.", ar: "يلا نبني الجيل الجاي من المبتكرين." },
    closedMessage: {
      en: "Applications are closed for this cycle. Follow us to hear when the next intake opens.",
      ar: "التقديم مقفول في الدورة دي. تابعنا عشان تعرف إمتى التقديم الجاي.",
    },
  },
  "site.seo": {
    description:
      "BuildX HUE is a student-led innovation and robotics community at Horus University – Egypt. Join a track — robotics, AI, software, IoT, 3D design, media or business — build real projects and compete.",
    descriptionAr:
      "BuildX HUE مجتمع طلابي للابتكار والروبوتات في جامعة حورس – مصر. اختار مسارك — روبوتات، ذكاء اصطناعي، برمجة، إنترنت الأشياء، تصميم 3D، ميديا أو بيزنس — واتعلّم وابني مشاريع حقيقية ونافس.",
    keywords: ["BuildX HUE", "robotics", "Horus University", "AI", "IoT", "student community", "Egypt", "روبوتات", "جامعة حورس", "ذكاء اصطناعي", "مجتمع طلابي", "دمياط الجديدة"],
  },
};

export const SETTING_KEYS = Object.keys(defaultSiteConfig) as SettingKey[];

export function pick(l: Localized | undefined, locale: string): string {
  if (!l) return "";
  return (locale === "ar" && l.ar) || l.en;
}
