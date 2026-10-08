/**
 * Baqloz (بقلظ), the BuildX guide: where he goes, what he says and what he reacts to. Everything he
 * does on his own comes from here, so new sections, pages or reactions only need an entry here.
 *
 *  - JOURNEY: scenes per page. A scene starts when its section reaches the middle of the screen.
 *    `clip` is what he does ("Point" picks PointLeft/PointRight towards `point`), `say` his lines
 *    (later lines follow after a pause), `props` small floating 3D objects, `goggles`/`drone` the
 *    robotics extras, `side` where he prefers to stand ("start"/"end" follow the reading direction).
 *  - SECTION_RULES: any other section on any page gets a scene too, picked from its heading.
 *  - HOVERS: what he says when the cursor rests on cards and buttons (tracks, teams, people...).
 *  - FIELD_TIPS: help while filling in forms.
 *  - PAGES, SUGGESTIONS, QUIPS, GREETINGS: the menu, suggested questions and small talk.
 */
import type { IconName } from "@/components/brand/icons";
import type { ClipName } from "@/lib/mascot/clip-names";

export type Text = { en: string; ar: string };
export type PropName = "gears" | "nodes" | "chip" | "code" | "sensors";
export type SceneClip = ClipName | "Point";

export type SceneAction =
  | { kind: "tour"; label: Text }
  | { kind: "sitetour"; label: Text }
  | { kind: "dismiss"; label: Text }
  | { kind: "go"; label: Text; href: string; section?: string; celebrate?: boolean }
  | { kind: "menu"; label: Text }
  | { kind: "next"; label: Text }
  | { kind: "stop"; label: Text };

export type Line = Text & { actions?: SceneAction[] };

export type Scene = {
  id: string;
  selector: string;
  clip: SceneClip;
  say?: Line[];
  props?: PropName[];
  goggles?: boolean;
  drone?: boolean;
  /** Element to point and look at (the first visible match). */
  point?: string;
  side?: "start" | "end";
  /** Enter by walking in from the edge (the first scene of a page). */
  enter?: boolean;
};

export type Route = { match: RegExp; scenes: Scene[] };

/** His name, shown on his bubbles and menu. */
export const GUIDE_NAME: Text = { ar: "بقلظ", en: "Baqloz" };

/**
 * The guide's voice. "ar": he always speaks Egyptian Arabic, on English pages too (he's a local
 * character). "page": he follows the page's language.
 */
export const GUIDE_VOICE: "ar" | "page" = "ar";

const siteTour: SceneAction = { kind: "sitetour", label: { en: "Let's go", ar: "يلا بينا" } };
const notNow: SceneAction = { kind: "dismiss", label: { en: "Not now", ar: "بعدين" } };
const askMe: SceneAction = { kind: "menu", label: { en: "Ask Baqloz", ar: "اسأل بقلظ" } };
const go = (href: string, ar: string, en: string, section?: string): SceneAction => ({ kind: "go", href, section, label: { ar, en } });
const joinCta: SceneAction = { kind: "go", label: { en: "Join BuildX HUE", ar: "يلا انضم لينا" }, href: "/join", celebrate: true };

/** Paths are compared without the locale prefix and without a trailing slash ("/" for home). */
export const JOURNEY: Route[] = [
  {
    match: /^\/$/,
    scenes: [
      {
        id: "hero",
        selector: "#hero",
        clip: "Wave",
        enter: true,
        side: "end",
        say: [
          { en: "Hey 👋 I'm Baqloz, your guide at BuildX HUE!", ar: "أهلاً أهلاً 👋 أنا بقلظ، مرشدك في BuildX HUE!" },
          { en: "Want me to take you on a tour of the site?", ar: "تيجي آخدك جولة جوه الموقع؟", actions: [siteTour, notNow] },
        ],
      },
      {
        id: "latest",
        selector: "section[aria-labelledby='latest-title']",
        clip: "LookAround",
        say: [{ en: "Fresh news and events. Don't miss a thing.", ar: "آخر الأخبار والإيفنتات هنا… متفوّتش حاجة 👀" }],
      },
      {
        id: "about",
        selector: "#why",
        clip: "Think",
        props: ["gears"],
        point: "#why h2",
        say: [
          { en: "This is where ideas become real projects.", ar: "هنا بقى الأفكار بتتحوّل لمشاريع بجد." },
          { en: "Too much theory at uni? Here we build with our hands.", ar: "الكلام النظري في الكلية كتير؟ هنا بنشتغل بإيدينا 🔧" },
        ],
      },
      {
        id: "tracks",
        selector: "#tracks",
        clip: "Point",
        point: "#tracks a[href*='/tracks/']",
        props: ["chip", "nodes"],
        goggles: true,
        drone: true,
        say: [
          { en: "Pick your track. Robotics is my favourite 🤖", ar: "اختار التراك اللي على مزاجك. أنا بصراحة بموت في الروبوتكس 🤖" },
          { en: "Hover a card and I'll tell you about it.", ar: "قرّب الماوس من أي كارت وأنا أحكيلك عنه." },
        ],
      },
      { id: "activities", selector: "#activities", clip: "Typing", props: ["code"], say: [{ en: "Workshops, hackathons, build nights. Always something on.", ar: "ورش وهاكاثونات وسهرات بناء… هنا دايماً في حاجة شغّالة." }] },
      {
        id: "compete",
        selector: "#compete",
        clip: "Happy",
        props: ["sensors"],
        say: [
          { en: "Ready to compete? 🏁", ar: "مستعد تنافس؟ إحنا مستنيينك 🏁" },
          { en: "Pick a team on the left to see its robot.", ar: "اختار فريق من القايمة وشوف الروبوت بتاعه." },
        ],
      },
      { id: "events", selector: "#roadmap", clip: "Point", point: "#roadmap h2", say: [{ en: "Here's what we're building next.", ar: "بص، ده اللي بنحضّره الفترة الجاية." }] },
      { id: "goals", selector: "#goals", clip: "Happy", say: [{ en: "Our goals for the year. We'll hit them together 💪", ar: "دي أهدافنا للسنة… ومع بعض هنحققها 💪" }] },
      { id: "voices", selector: "section[aria-labelledby='voices-title']", clip: "Listening", say: [{ en: "Hear it from the students themselves.", ar: "اسمع من الطلبة نفسهم… كلامهم أحلى من أي إعلان." }] },
      {
        id: "team",
        selector: "#founders",
        clip: "Wave",
        say: [{ en: "Meet the people building BuildX.", ar: "تعالى أعرّفك على الناس اللي بيبنوا BuildX.", actions: [go("/team", "شوف الفريق كله", "Whole team")] }],
      },
      { id: "sponsors", selector: "#partners", clip: "Idle", say: [{ en: "Our partners help turn ideas into reality.", ar: "شركاؤنا هم اللي بيساعدونا نحوّل الأفكار لحاجة حقيقية." }] },
      {
        id: "join",
        selector: "section[aria-labelledby='footer-cta']",
        clip: "Happy",
        point: "section[aria-labelledby='footer-cta'] a[href$='/join'], section[aria-labelledby='footer-cta'] a[href*='/join/']",
        say: [{ en: "Ready to build with us?", ar: "جاهز تبني معانا؟", actions: [joinCta] }],
      },
    ],
  },
  {
    match: /^\/about$/,
    scenes: [
      { id: "about", selector: "main", clip: "Think", props: ["gears"], enter: true, say: [{ en: "This is the BuildX story. Where ideas become real projects.", ar: "دي حكاية BuildX… المكان اللي الأفكار فيه بتبقى مشاريع بجد." }] },
      { id: "structure", selector: "#structure", clip: "Point", point: "#structure h2", props: ["gears"], say: [{ en: "Students lead students here. You could be one of them.", ar: "هنا الطلبة هم اللي بيقودوا الطلبة… وممكن تبقى واحد منهم." }] },
    ],
  },
  {
    match: /^\/tracks$/,
    scenes: [
      {
        id: "tracks",
        selector: "main",
        clip: "Point",
        point: "main a[href*='/tracks/']",
        goggles: true,
        drone: true,
        props: ["chip"],
        enter: true,
        say: [
          { en: "Seven tracks, one machine. Which one's yours?", ar: "سبع تراكات وآلة واحدة. إنت بقى هتختار أنهي؟" },
          { en: "Not sure? Ask me and I'll help you choose.", ar: "محتار؟ اسألني وأنا أساعدك تختار.", actions: [askMe] },
        ],
      },
    ],
  },
  { match: /^\/tracks\/robotics/, scenes: [{ id: "robotics", selector: "main", clip: "Happy", goggles: true, drone: true, props: ["chip", "sensors"], enter: true, say: [{ en: "Robotics! Goggles on 🥽", ar: "روبوتكس! استنى ألبس النضارة 🥽 ده الملعب بتاعي." }] }] },
  { match: /^\/tracks\/ai/, scenes: [{ id: "ai", selector: "main", clip: "Think", props: ["nodes"], enter: true, say: [{ en: "AI & Machine Learning: teaching machines to think 🧠", ar: "الذكاء الاصطناعي… هنا بنعلّم الآلات تفكّر 🧠" }] }] },
  { match: /^\/tracks\/software/, scenes: [{ id: "software", selector: "main", clip: "Typing", props: ["code"], enter: true, say: [{ en: "Software: from your first line of code to real apps 💻", ar: "السوفتوير… من أول سطر كود لحد أبلكيشن حقيقي 💻" }] }] },
  { match: /^\/tracks\/iot/, scenes: [{ id: "iot", selector: "main", clip: "Listening", props: ["sensors"], enter: true, say: [{ en: "IoT: sensors, connections and smart things 📡", ar: "إنترنت الأشياء… حساسات وأجهزة بتكلّم بعضها 📡" }] }] },
  { match: /^\/tracks\/3d/, scenes: [{ id: "3d", selector: "main", clip: "Think", props: ["gears"], enter: true, say: [{ en: "3D design: if you can imagine it, you can print it 🛠️", ar: "التصميم الـ 3D… اللي تتخيّله تقدر تطبعه 🛠️" }] }] },
  { match: /^\/tracks\/media/, scenes: [{ id: "media", selector: "main", clip: "Happy", enter: true, say: [{ en: "Media & design: making BuildX look this good 🎨", ar: "الميديا والديزاين… هما اللي مخليين BuildX شكلها حلو كده 🎨" }] }] },
  { match: /^\/tracks\/business/, scenes: [{ id: "business", selector: "main", clip: "Think", props: ["gears"], enter: true, say: [{ en: "Business: turning projects into startups 🚀", ar: "البيزنس… إزاي المشروع يبقى ستارت أب 🚀" }] }] },
  { match: /^\/tracks\//, scenes: [{ id: "track", selector: "main", clip: "Idle", props: ["gears"], enter: true }] },
  {
    match: /^\/events/,
    scenes: [
      { id: "events", selector: "main", clip: "LookAround", enter: true, say: [{ en: "Here's what we're building next. Book your spot early!", ar: "بص، ده اللي بنحضّره الفترة الجاية. احجز مكانك بدري!" }] },
      { id: "roadmap", selector: "#roadmap", clip: "Point", point: "#roadmap h2", say: [{ en: "A year full of opportunities. Pick yours.", ar: "سنة كاملة مليانة فرص… اختار اللي يناسبك." }] },
    ],
  },
  {
    match: /^\/competitions$/,
    scenes: [{ id: "compete", selector: "main", clip: "Happy", props: ["sensors"], enter: true, say: [{ en: "Ready to compete? These teams represent Horus University 🏁", ar: "مستعد تنافس؟ الفرق دي بتمثّل جامعة حورس 🏁" }] }],
  },
  { match: /^\/competitions\/sumo/, scenes: [{ id: "sumo", selector: "main", clip: "Jump", props: ["sensors"], enter: true, say: [{ en: "Sumo robots: push or get pushed 💥", ar: "روبوتات السومو… يا تزُق يا تتزق 💥" }] }] },
  { match: /^\/competitions\/line-follower/, scenes: [{ id: "lf", selector: "main", clip: "Run", props: ["sensors"], enter: true, say: [{ en: "Line follower: pure speed and precision ⚡", ar: "اللاين فولور… سرعة ودقة وبس ⚡" }] }] },
  { match: /^\/competitions\/ai/, scenes: [{ id: "ai-hack", selector: "main", clip: "Think", props: ["nodes"], enter: true, say: [{ en: "AI hackathons: think, model, ship.", ar: "هاكاثونات الـ AI… فكّر، ودرّب، وسلّم." }] }] },
  { match: /^\/competitions\/iot/, scenes: [{ id: "iot-ch", selector: "main", clip: "Listening", props: ["sensors"], enter: true, say: [{ en: "IoT challenges: sense, connect, solve.", ar: "تحديات الـ IoT… حس، ووصّل، وحل." }] }] },
  { match: /^\/competitions\/programming/, scenes: [{ id: "prog", selector: "main", clip: "Typing", props: ["code"], enter: true, say: [{ en: "Programming contests: fast fingers, sharper minds.", ar: "مسابقات البرمجة… صوابع سريعة ودماغ أسرع 😎" }] }] },
  { match: /^\/competitions\/green/, scenes: [{ id: "green", selector: "main", clip: "Happy", props: ["gears"], enter: true, say: [{ en: "Green innovation: tech that's good for the planet 🌱", ar: "الابتكار الأخضر… تكنولوجيا بتحافظ على الكوكب 🌱" }] }] },
  { match: /^\/competitions\//, scenes: [{ id: "team", selector: "main", clip: "Idle", props: ["sensors"], enter: true }] },
  {
    match: /^\/team$/,
    scenes: [{ id: "team", selector: "main", clip: "Wave", enter: true, say: [{ en: "Meet the people building BuildX. Click anyone to see their work.", ar: "تعالى أعرّفك على الناس اللي بيبنوا BuildX… دوس على أي حد تشوف شغله." }] }],
  },
  { match: /^\/team\//, scenes: [{ id: "member", selector: "main", clip: "Wave", enter: true, say: [{ en: "One of the BuildX crew 👋", ar: "واحد من شلّة BuildX 👋 شوف شغله." }] }] },
  {
    match: /^\/sponsors$/,
    scenes: [{ id: "sponsors", selector: "main", clip: "Idle", enter: true, say: [{ en: "Our partners help turn ideas into reality. Interested? Let's talk.", ar: "شركاؤنا هم اللي بيساعدونا نحوّل الأفكار لحاجة حقيقية. مهتم؟ يلا نتكلم.", actions: [go("/contact", "كلّمنا", "Contact us")] }] }],
  },
  { match: /^\/projects$/, scenes: [{ id: "projects", selector: "main", clip: "Typing", props: ["code"], enter: true, say: [{ en: "Real robots. Real code. Built by students.", ar: "روبوتات بجد وكود بجد… وكله من شغل الطلبة." }] }] },
  { match: /^\/projects\//, scenes: [{ id: "project", selector: "main", clip: "Typing", props: ["code"], enter: true, say: [{ en: "A student project, start to finish 👀", ar: "مشروع من شغل الطلبة من الأول للآخر 👀" }] }] },
  { match: /^\/bootcamp$/, scenes: [{ id: "bootcamp", selector: "main", clip: "Happy", props: ["gears"], enter: true, say: [{ en: "From basics to competition. Start here.", ar: "من الصفر لحد المسابقات. ابدأ من هنا." }] }] },
  { match: /^\/achievements$/, scenes: [{ id: "achievements", selector: "main", clip: "Celebrate", enter: true, say: [{ en: "Our wins so far 🏆 More to come!", ar: "إنجازاتنا لحد دلوقتي 🏆 واللي جاي أحلى إن شاء الله!" }] }] },
  { match: /^\/news/, scenes: [{ id: "news", selector: "main", clip: "LookAround", enter: true, say: [{ en: "What's new at BuildX 📰", ar: "إيه الجديد في BuildX؟ 📰" }] }] },
  { match: /^\/gallery$/, scenes: [{ id: "gallery", selector: "main", clip: "LookAround", enter: true, say: [{ en: "Behind the scenes 📸 Click a photo to enlarge it.", ar: "صور من الكواليس 📸 دوس على أي صورة تكبّرها." }] }] },
  { match: /^\/films$/, scenes: [{ id: "films", selector: "main", clip: "Listening", enter: true, say: [{ en: "Grab some popcorn 🍿", ar: "هات الفشار 🍿 وشغّل الفيديو." }] }] },
  { match: /^\/resources$/, scenes: [{ id: "resources", selector: "main", clip: "Typing", props: ["code"], enter: true, say: [{ en: "Free resources to learn from. Bookmark this page!", ar: "مصادر تتعلم منها ببلاش… احفظ الصفحة دي عندك!" }] }] },
  { match: /^\/faq$/, scenes: [{ id: "faq", selector: "main", clip: "Think", enter: true, say: [{ en: "Can't find it? Click me and ask.", ar: "مش لاقي اللي بتدوّر عليه؟ دوس عليّا واسألني.", actions: [askMe] }] }] },
  { match: /^\/contact$/, scenes: [{ id: "contact", selector: "main", clip: "Listening", enter: true, say: [{ en: "Say hi. We read every message.", ar: "ابعتلنا براحتك، إحنا بنقرا كل رسالة." }] }] },
  { match: /^\/join\/status/, scenes: [{ id: "status", selector: "main", clip: "Think", enter: true, say: [{ en: "Type your reference code to see where your application is.", ar: "اكتب كود الطلب وأنا أقولك طلبك وصل لفين." }] }] },
  {
    match: /^\/join$/,
    scenes: [
      {
        id: "join",
        selector: "main",
        clip: "Happy",
        enter: true,
        say: [
          { en: "Ready to build with us? It takes about three minutes.", ar: "جاهز تبني معانا؟ الفورم مش هياخد منك أكتر من ٣ دقايق." },
          { en: "I'll help with each field as you go.", ar: "وأنا معاك خانة بخانة لو احتجت مساعدة 😉" },
        ],
      },
    ],
  },
  { match: /^\/verify/, scenes: [{ id: "verify", selector: "main", clip: "Think", enter: true, say: [{ en: "Type the certificate code or scan its QR and I'll tell you if it's genuine.", ar: "اكتب كود الشهادة أو امسح الـ QR وأنا أقولك أصلية ولا لأ 🔍" }] }] },
  { match: /^\/ticket/, scenes: [{ id: "ticket", selector: "main", clip: "Happy", enter: true, say: [{ en: "Your ticket! Show the QR at the door 🎟️", ar: "دي التذكرة بتاعتك! ورّي الـ QR على الباب 🎟️" }] }] },
  { match: /^\/brand$/, scenes: [{ id: "brand", selector: "main", clip: "Think", enter: true, say: [{ en: "Our brand kit. Download the logos and use them right 😄", ar: "دي هوية BuildX… نزّل اللوجوهات واستخدمها صح 😄" }] }] },
  { match: /^\/privacy$/, scenes: [{ id: "privacy", selector: "main", clip: "Idle", enter: true, say: [{ en: "Your data is safe with us. Here's how.", ar: "بياناتك في أمان معانا… وده إزاي." }] }] },
  // Anything else: he walks in; its sections still get scenes from SECTION_RULES.
  { match: /./, scenes: [{ id: "page", selector: "main", clip: "Idle", enter: true }] },
];

/** Pages where the guide stays away (none right now: he guides everywhere, quietly on utility pages). */
export const QUIET_ROUTES: RegExp[] = [];

/** Pages with forms: on phones the guide starts minimised there so it never sits on an input. */
export const FORM_ROUTES = [/^\/join$/, /^\/contact$/];

/**
 * Every other section on every page (one with a heading) gets a scene from its heading: the first
 * rule that matches the heading text, else one of the SECTION_FALLBACK lines ({h} = the heading).
 */
export const SECTION_RULES: { match: RegExp; clip: SceneClip; props?: PropName[]; goggles?: boolean; say: Text }[] = [
  { match: /robot|روبوت/i, clip: "Happy", goggles: true, props: ["chip"], say: { ar: "روبوتات! ده الملعب بتاعي 🤖", en: "Robots! This is my playground 🤖" } },
  { match: /\bai\b|machine learning|artificial|ذكاء/i, clip: "Think", props: ["nodes"], say: { ar: "الذكاء الاصطناعي… خليني أفكّر شوية 🤔", en: "AI… let me think about that 🤔" } },
  { match: /compet|race|sumo|مسابق|منافس|تنافس/i, clip: "Happy", props: ["sensors"], say: { ar: "هنا الحماس كله 🏁 الفرق بتتمرن طول السنة عشان اليوم ده.", en: "This is where it gets exciting 🏁" } },
  { match: /team|people|founder|member|crew|فريق|الناس|المؤسس|أعضاء/i, clip: "Wave", say: { ar: "دول الناس اللي بيعملوا السحر هنا ✨ دوس على أي حد تشوف شغله.", en: "The people behind the magic ✨ Click anyone to see their work." } },
  { match: /partner|sponsor|tier|شرك|رعا|باق/i, clip: "Idle", say: { ar: "الشراكة معانا بتفرق مع الطلبة بجد. لو شركتك مهتمة كلّمنا.", en: "Partnering with us really helps students. Interested? Get in touch." } },
  { match: /roadmap|year|season|timeline|plan|journey|سنة|موسم|خطة|رحلة/i, clip: "Point", say: { ar: "بص على الخطة… السنة مليانة فرص، اختار اللي يناسبك.", en: "Here's the plan: a year full of chances." } },
  { match: /workshop|session|activit|ورش|أنشطة|جلسات|سيشن/i, clip: "Typing", props: ["code"], say: { ar: "ورش وسيشنز ومسابقات… كل أسبوع في جديد.", en: "Workshops, sessions, contests: something new every week." } },
  { match: /bootcamp|basics|stage|بوتكامب|أساسيات|مرحلة/i, clip: "Happy", props: ["gears"], say: { ar: "البوتكامب أحسن بداية لو لسه جديد… خطوة خطوة.", en: "The bootcamp is the best place to start, step by step." } },
  { match: /track|تراك|مسار/i, clip: "Point", props: ["chip", "nodes"], say: { ar: "كل تراك ليه طريق واضح من الأساسيات لحد المشاريع.", en: "Every track has a clear path from basics to projects." } },
  { match: /value|stand for|mission|vision|قيم|رسالة|رؤية/i, clip: "Think", say: { ar: "دي القيم اللي ماشيين عليها… مش مجرد كلام.", en: "The values we actually live by." } },
  { match: /structure|leading|lead|هيكل|قيادة/i, clip: "Think", props: ["gears"], say: { ar: "الطلبة هم اللي بيديروا كل حاجة هنا… وإنت ممكن تبقى منهم.", en: "Students run everything here, and you could too." } },
  { match: /impact|why|learning|ليه|تأثير/i, clip: "Think", props: ["gears"], say: { ar: "النظري كتير… هنا بنتعلم بإيدينا.", en: "Less theory, more building." } },
  { match: /goal|target|هدف|أهداف/i, clip: "Happy", say: { ar: "دي أهدافنا… ومع بعض هنحققها 💪", en: "Our goals. We'll hit them together 💪" } },
  { match: /voice|testimonial|student.*say|قالوا|آراء/i, clip: "Listening", say: { ar: "اسمع من الطلبة نفسهم… كلامهم أحلى من أي إعلان.", en: "Hear it from the students themselves." } },
  { match: /latest|news|أخبار|آخر/i, clip: "LookAround", say: { ar: "آخر الأخبار هنا… متفوّتش حاجة.", en: "Latest news here. Don't miss out." } },
  { match: /gallery|photo|صور|معرض/i, clip: "LookAround", say: { ar: "صور من الكواليس 📸 دوس على أي صورة تكبّرها.", en: "Behind the scenes 📸" } },
  { match: /film|video|فيلم|فيديو/i, clip: "Listening", say: { ar: "شغّل الفيديو وعلّي الصوت 🎬", en: "Play it loud 🎬" } },
  { match: /project|مشروع|مشاريع/i, clip: "Typing", props: ["code"], say: { ar: "مشاريع حقيقية من شغل الطلبة… دوس على أي واحد تشوف تفاصيله.", en: "Real student projects. Click one for details." } },
  { match: /achiev|result|award|إنجاز|نتائج|جوائز/i, clip: "Celebrate", say: { ar: "إنجازاتنا 🏆 وإن شاء الله اللي جاي أحلى.", en: "Our wins 🏆 More coming." } },
  { match: /resource|مصادر/i, clip: "Typing", props: ["code"], say: { ar: "مصادر تتعلم منها ببلاش… احفظ الصفحة دي.", en: "Free resources. Bookmark this!" } },
  { match: /question|faq|أسئلة|سؤال/i, clip: "Think", say: { ar: "أغلب الأسئلة إجابتها هنا… ولو مش لاقي، اسألني أنا.", en: "Most answers are here. Or just ask me." } },
  { match: /contact|reach|تواصل|كلّمنا/i, clip: "Listening", say: { ar: "ابعتلنا وإحنا هنرد عليك في أقرب وقت.", en: "Message us and we'll get back to you." } },
  { match: /apply|join|تقديم|انضم/i, clip: "Happy", say: { ar: "املا الفورم براحتك… لو وقفت في حاجة أنا جنبك.", en: "Fill it in at your pace. I'm right here." } },
  { match: /logo|colou?r|typograph|icon|brand|r \+ h|لوجو|ألوان|خط|أيقون|هوية/i, clip: "Think", say: { ar: "الهوية البصرية بتاعتنا… استخدمها صح وإحنا نبقى مبسوطين 😄", en: "Our visual identity. Use it well 😄" } },
  { match: /event|فعالي|إيفنت/i, clip: "Point", say: { ar: "إيفنتات جاية! احجز مكانك بدري.", en: "Events coming up. Book early!" } },
  { match: /spec|robot$|the robot|المواصفات/i, clip: "Think", goggles: true, say: { ar: "دي مواصفات الروبوت… هندسة على أصولها ⚙️", en: "The specs. Proper engineering ⚙️" } },
];

export const SECTION_FALLBACK: Text[] = [
  { ar: "بص هنا: «{h}» 👀", en: "Look here: “{h}” 👀" },
  { ar: "«{h}»… كمّل نزول، فيه حاجات حلوة.", en: "“{h}”… keep scrolling, it gets better." },
  { ar: "ده قسم «{h}». لو عندك سؤال عنه دوس عليّا.", en: "This is “{h}”. Questions? Click me." },
];

/** What each track and competition team is about (hover lines, answers). */
export const TRACKS: Record<string, Text> = {
  "robotics-embedded": { ar: "روبوتكس وإمبيدد: روبوتات بجد وحساسات وميكروكنترولر 🤖 ده المفضّل عندي!", en: "Robotics & Embedded: real robots, sensors, microcontrollers 🤖" },
  "ai-ml": { ar: "الذكاء الاصطناعي: بايثون وموديلز وداتا… هنا بنعلّم الآلات تفكّر 🧠", en: "AI & ML: Python, models and data 🧠" },
  software: { ar: "السوفتوير: ويب وموبايل وباك إند… من أول سطر كود لأبلكيشن حقيقي 💻", en: "Software: web, mobile, back end 💻" },
  iot: { ar: "إنترنت الأشياء: حساسات وأجهزة بتكلّم بعضها على النت 📡", en: "IoT: sensors and connected devices 📡" },
  "3d-design": { ar: "التصميم الـ 3D: كاد وطباعة 3D وتصنيع… اللي تتخيّله يتعمل 🛠️", en: "3D design: CAD, printing, making 🛠️" },
  "media-design": { ar: "الميديا والديزاين: تصوير ومونتاج وجرافيك… الشكل الحلو ده من عندهم 🎨", en: "Media & design: photo, video, graphics 🎨" },
  business: { ar: "البيزنس وريادة الأعمال: إزاي المشروع يبقى ستارت أب 🚀", en: "Business: from project to startup 🚀" },
};

export const TEAMS: Record<string, Text> = {
  "line-follower": { ar: "اللاين فولور: روبوت بيمشي على خط بأقصى سرعة ⚡", en: "Line follower: a robot racing along a line ⚡" },
  sumo: { ar: "السومو: روبوتات بتتخانق في حلبة… اللي يطلع برّه يخسر 💥", en: "Sumo: robots pushing each other out of the ring 💥" },
  "iot-challenges": { ar: "تحديات الـ IoT: مشاكل حقيقية بحلول ذكية 📡", en: "IoT challenges: real problems, smart solutions 📡" },
  "ai-hackathons": { ar: "هاكاثونات الـ AI: سباق مع الوقت عشان أحسن موديل 🧠", en: "AI hackathons: racing the clock 🧠" },
  programming: { ar: "مسابقات البرمجة: مسائل وكود وسرعة تفكير 💻", en: "Programming contests: problems, code, speed 💻" },
  "green-innovation": { ar: "الابتكار الأخضر: تكنولوجيا بتفيد البيئة 🌱", en: "Green innovation: tech for the planet 🌱" },
};

const slugOf = (el: Element, part: string) => (el.getAttribute("href") ?? "").split(`/${part}/`)[1]?.split(/[/?#]/)[0] ?? "";
/** The first short line of an element's text (a person's or a project's name on its card). */
const nameOf = (el: Element) => (el.textContent ?? "").split(/\n|·|\|/).map((s) => s.trim()).find((s) => s.length > 1 && s.length < 40) ?? "";

export type Hover = { selector: string; line: (el: Element) => Text | null; clip?: ClipName; goggles?: boolean };

/** What he says when the cursor rests on something (desktop). Each thing once per page. */
export const HOVERS: Hover[] = [
  { selector: "a[href*='/tracks/']", line: (el) => TRACKS[slugOf(el, "tracks")] ?? null, goggles: true },
  { selector: "a[href*='/competitions/'], [id^='garage-tab-']", line: (el) => TEAMS[slugOf(el, "competitions") || (el.id ?? "").replace("garage-tab-", "")] ?? null, clip: "Happy" },
  { selector: "a[href*='/team/']", line: (el) => (nameOf(el) ? { ar: `ده ${nameOf(el)} 👋 دوس تشوف شغله.`, en: `That's ${nameOf(el)} 👋 Click to see their work.` } : null), clip: "Wave" },
  { selector: "a[href*='/projects/']", line: (el) => (nameOf(el) ? { ar: `«${nameOf(el)}»… مشروع من شغل الطلبة 👀`, en: `“${nameOf(el)}”, a student project 👀` } : null), clip: "Typing" },
  { selector: "a[href*='/events/']", line: () => ({ ar: "إيفنت حلو! دوس عشان تعرف التفاصيل وتحجز مكانك 🎟️", en: "Nice event! Click for details and to book 🎟️" }) },
  { selector: "a[href*='/news/']", line: () => ({ ar: "خبر جديد… اقراه 📰", en: "Fresh news. Read it 📰" }) },
  { selector: "a[href$='/bootcamp'], a[href$='/bootcamp/']", line: () => ({ ar: "البوتكامب: أحسن بداية لو لسه جديد 🚀", en: "The bootcamp: the best place to start 🚀" }) },
  { selector: "a[href$='/contact'], a[href$='/contact/'], a[href^='mailto:']", line: () => ({ ar: "عندك سؤال؟ ابعتلنا على طول ✉️", en: "Questions? Message us ✉️" }) },
  { selector: "a[hreflang]", line: (el) => (el.getAttribute("hreflang") === "ar" ? { ar: "عايز تقرا بالعربي؟ أنا معاك في الحالتين 😉", en: "Prefer Arabic? I'm with you either way 😉" } : { ar: "عايز تقرا بالإنجليزي؟ أنا هفضل أتكلم مصري برضه 😄", en: "Switching to English? I'll still be here 😄" }) },
  { selector: "a[href*='instagram'], a[href*='facebook'], a[href*='linkedin'], a[href*='tiktok'], a[href*='youtube'], a[href*='x.com'], a[href*='twitter']", line: () => ({ ar: "تابعنا عشان تلحق كل جديد 📱", en: "Follow us to catch everything new 📱" }) },
  { selector: "a[download], a[href$='.svg'], a[href$='.png'], a[href$='.zip']", line: () => ({ ar: "خده براحتك 😉", en: "Help yourself 😉" }) },
  { selector: "a[href*='/app'], a[href*='/app/']", line: () => ({ ar: "ده تطبيق BuildX… للطلبة والفريق.", en: "The BuildX app, for students and the team." }) },
];

/** Help while filling in forms (by the field's name; then by its type). */
export const FIELD_TIPS: Record<string, Text> = {
  fullName: { ar: "اكتب اسمك الرباعي زي ما هتحب يظهر في الشهادة 😉", en: "Your full name, as you'd like it on your certificate 😉" },
  name: { ar: "اكتب اسمك عشان نعرف نرد عليك.", en: "Your name, so we know who to reply to." },
  email: { ar: "إيميل بتفتحه فعلاً… الرد هيجيلك عليه.", en: "An email you actually check: the reply goes there." },
  phone: { ar: "رقم موبايل، ويا ريت يكون عليه واتساب 📱", en: "A mobile number, ideally on WhatsApp 📱" },
  academicYear: { ar: "إنت في سنة كام؟ كل السنين مرحّب بيها.", en: "Your year: everyone's welcome." },
  trackId: { ar: "اختار التراك اللي شادّك أكتر… تقدر تغيّر بعدين.", en: "Pick the track you like most; you can change later." },
  experience: { ar: "مفيش إجابة غلط… حتى لو لسه بادئ من الصفر عادي جداً.", en: "No wrong answer: starting from zero is fine." },
  skills: { ar: "اكتب أي حاجة بتعرفها، حتى لو بسيطة.", en: "List anything you know, even small things." },
  motivation: { ar: "قول بصراحة ليه عايز تنضم… دي أهم خانة 💙", en: "Tell us honestly why you want to join. This one matters most 💙" },
  availability: { ar: "قد إيه وقتك يسمح في الأسبوع؟ بنظبط معاك.", en: "How much time per week? We'll work with it." },
  portfolioUrl: { ar: "لو عندك بورتفوليو حطه… ولو مفيش عادي.", en: "Got a portfolio? Add it. If not, no worries." },
  githubUrl: { ar: "لينك الجيت هاب لو عندك 💻", en: "Your GitHub link, if you have one 💻" },
  consent: { ar: "علّم هنا عشان نقدر نتواصل معاك.", en: "Tick this so we can contact you." },
  organization: { ar: "الشركة أو الجهة اللي بتمثلها (لو فيه).", en: "Your company or organisation, if any." },
  topic: { ar: "اختار الموضوع عشان رسالتك توصل للشخص الصح.", en: "Pick a topic so it reaches the right person." },
  message: { ar: "اكتب رسالتك براحتك… بنقرا كل كلمة.", en: "Write freely. We read every word." },
  full_name: { ar: "اكتب اسمك الرباعي زي ما هتحب يظهر في الشهادة 😉", en: "Your full name, as you'd like it on your certificate 😉" },
  faculty: { ar: "كليتك إيه؟ كل الكليات مرحّب بيها، مش الهندسة بس.", en: "Your faculty: everyone's welcome, not just engineering." },
  academic_year: { ar: "إنت في سنة كام؟ كل السنين مرحّب بيها.", en: "Your year: everyone's welcome." },
  student_number: { ar: "الرقم الجامعي لو فاكره… مش إجباري.", en: "Your student number if you know it (optional)." },
  portfolio_url: { ar: "لو عندك بورتفوليو أو جيت هاب حطه… ولو مفيش عادي.", en: "Portfolio or GitHub link, if you have one." },
  goals: { ar: "عايز توصل لإيه السنة دي؟ احلم براحتك 🚀", en: "What do you want to achieve this year? Dream big 🚀" },
  "ph:BXC-1A2B3C4D": { ar: "الكود مكتوب تحت الـ QR في الشهادة.", en: "The code is printed under the QR on the certificate." },
  "ph:BX-1A2B3C": { ar: "كود الطلب جالك بعد ما قدّمت، ومعاه رقم الموبايل اللي سجّلت بيه.", en: "Your reference came after you applied, with the phone you used." },
  type_email: { ar: "إيميل بتفتحه فعلاً.", en: "An email you check." },
  type_tel: { ar: "رقم موبايل.", en: "A mobile number." },
  type_search: { ar: "اكتب اللي بتدوّر عليه.", en: "Type what you're looking for." },
};

export const LINE_INVALID: Text = { ar: "في خانة ناقصة أو مش مظبوطة… بص على اللي باللون الأحمر 👀", en: "Something's missing; check the field in red 👀" };

/** The menu's "go to" list, and the pages counted for "explored the whole site". */
export type PageLink = { id: string; label: Text; icon: IconName; href: string; section?: string };
export const PAGES: PageLink[] = [
  { id: "about", label: { ar: "عن BuildX", en: "About" }, icon: "globe", href: "/about", section: "#why" },
  { id: "tracks", label: { ar: "التراكات", en: "Tracks" }, icon: "layers", href: "/tracks", section: "#tracks" },
  { id: "competitions", label: { ar: "المسابقات", en: "Competitions" }, icon: "flag", href: "/competitions", section: "#compete" },
  { id: "bootcamp", label: { ar: "البوتكامب", en: "Bootcamp" }, icon: "rocket", href: "/bootcamp" },
  { id: "events", label: { ar: "الإيفنتات الجاية", en: "Upcoming events" }, icon: "calendar", href: "/events" },
  { id: "projects", label: { ar: "المشاريع", en: "Projects" }, icon: "cpu", href: "/projects" },
  { id: "team", label: { ar: "اتعرّف على الفريق", en: "The team" }, icon: "users", href: "/team", section: "#founders" },
  { id: "achievements", label: { ar: "الإنجازات", en: "Achievements" }, icon: "award", href: "/achievements" },
  { id: "news", label: { ar: "الأخبار", en: "News" }, icon: "news", href: "/news" },
  { id: "gallery", label: { ar: "الصور", en: "Gallery" }, icon: "image", href: "/gallery" },
  { id: "sponsors", label: { ar: "الشركاء", en: "Partners" }, icon: "handshake", href: "/sponsors", section: "#partners" },
  { id: "faq", label: { ar: "الأسئلة الشائعة", en: "FAQ" }, icon: "idea", href: "/faq" },
  { id: "verify", label: { ar: "تحقق من شهادة", en: "Verify a certificate" }, icon: "shield", href: "/verify" },
  { id: "contact", label: { ar: "كلّمنا", en: "Contact" }, icon: "mail", href: "/contact" },
  { id: "join", label: { ar: "خليك عضو معانا", en: "Become a member" }, icon: "plus", href: "/join" },
];

/** Suggested questions in the menu, by page (paths as in JOURNEY). */
export const SUGGESTIONS: { match: RegExp; ask: Text[] }[] = [
  { match: /^\/tracks/, ask: [{ ar: "أبدأ بأنهي تراك؟", en: "Which track should I start with?" }, { ar: "يعني إيه إمبيدد؟", en: "What is embedded?" }, { ar: "لازم أكون شاطر برمجة؟", en: "Do I need to code already?" }] },
  { match: /^\/competitions/, ask: [{ ar: "إزاي أدخل فريق مسابقات؟", en: "How do I join a competition team?" }, { ar: "يعني إيه سومو؟", en: "What is sumo?" }, { ar: "إيه هو اللاين فولور؟", en: "What is a line follower?" }] },
  { match: /^\/join/, ask: [{ ar: "التقديم بفلوس؟", en: "Is it free?" }, { ar: "هيردوا عليا إمتى؟", en: "When will I hear back?" }, { ar: "أتابع طلبي إزاي؟", en: "How do I track my application?" }] },
  { match: /^\/events/, ask: [{ ar: "أحجز في إيفنت إزاي؟", en: "How do I book an event?" }, { ar: "الإيفنتات فين؟", en: "Where are events held?" }] },
  { match: /^\/verify/, ask: [{ ar: "ألاقي كود الشهادة فين؟", en: "Where's the certificate code?" }] },
  { match: /^\/sponsors/, ask: [{ ar: "إزاي أبقى شريك؟", en: "How do I become a partner?" }] },
  { match: /./, ask: [{ ar: "إزاي أنضم؟", en: "How do I join?" }, { ar: "إيه التراكات؟", en: "What are the tracks?" }, { ar: "الإيفنت الجاي إمتى؟", en: "When's the next event?" }, { ar: "إنت مين؟", en: "Who are you?" }] },
];

/** Small talk when he's been quiet for a while (at most a couple per page). */
export const QUIPS: Text[] = [
  { ar: "لو محتاج أي حاجة أنا هنا… دوس عليّا 😉", en: "Need anything? Just click me 😉" },
  { ar: "بتحب الروبوتكس ولا الـ AI أكتر؟ 🤔", en: "Robotics or AI, which one's more you? 🤔" },
  { ar: "نصيحة: لو لسه جديد ابدأ بالبوتكامب.", en: "Tip: new here? Start with the bootcamp." },
  { ar: "متنساش تتابعنا على السوشيال 📱", en: "Don't forget to follow us 📱" },
  { ar: "على فكرة… تقدر تسألني أي سؤال عن BuildX.", en: "By the way, you can ask me anything about BuildX." },
  { ar: "دوس عليّا خمس مرات ورا بعض… وشوف هيحصل إيه 🤫", en: "Click me five times in a row… 🤫" },
  { ar: "أنا بقلظ… وأنا هنا عشانك 💙", en: "I'm Baqloz, and I'm here for you 💙" },
];

/** Greeting by time of day (first visit to a page in a session). */
export function greeting(hour: number): Text {
  if (hour < 5) return { ar: "سهران؟ أنا كمان 😄", en: "Up late? Me too 😄" };
  if (hour < 12) return { ar: "صباح الفل ☀️", en: "Good morning ☀️" };
  if (hour < 17) return { ar: "نهارك سعيد 🌤️", en: "Good afternoon 🌤️" };
  return { ar: "مساء الفل 🌙", en: "Good evening 🌙" };
}

/** Short lines for the guide's own moments (not tied to a section). */
export const LINES = {
  welcomeBack: { en: "Welcome back 👋 I missed you!", ar: "أهلاً بيك تاني 👋 وحشتنا!" },
  sleepy: { en: "Zz… move the mouse to wake me.", ar: "Zzz… حرّك الماوس عشان أصحى." },
  awake: { en: "I'm up, I'm up!", ar: "صاحي، صاحي! 😅" },
  dance: { en: "You found my secret move 🕺", ar: "كده إنت عرفت الرقصة السرية بتاعتي 🕺" },
  zoom: { en: "Whoa, fast hands!", ar: "براحة يا عم! إيدك سريعة 😄" },
  joined: { en: "Let's go! See you inside 🎉", ar: "يلا بينا! هنستناك جوه 🎉" },
  tourDone: { en: "That's the tour. Click me anytime.", ar: "كده خلّصنا اللفّة. لو احتجتني دوس عليّا في أي وقت." },
  hidden: { en: "Guide hidden. Bring me back from the corner.", ar: "اتخبيت. رجّعني من الركن." },
  next: { en: "Next", ar: "اللي بعده" },
  stop: { en: "End tour", ar: "كفاية كده" },
  backAgain: { en: "Back again? 😄", ar: "رجعت تاني؟ 😄 شكلها عجبتك." },
  explored: { en: "You've seen the whole site! 🏆 You're one of us now.", ar: "كده إنت لفّيت الموقع كله! 🏆 بقيت واحد مننا خلاص." },
  copied: { en: "Copied!", ar: "اتنسخ!" },
  invite: { en: "Want me to take you on a tour of the site?", ar: "تيجي آخدك جولة جوه الموقع؟" },
  letsGo: { en: "Let's go", ar: "يلا بينا" },
  notNow: { en: "Not now", ar: "بعدين" },
  tourStart: { en: "Off we go! Follow me 🚶", ar: "حلو! امشي ورايا بقى 🚶 وأنا هحكيلك على كل حاجة." },
  tourEnd: {
    en: "That's the whole tour 🎉 Any question at all, click me and ask. I'm always here.",
    ar: "كده لفّينا الموقع كله 🎉 أي سؤال في دماغك دوس عليّا واسألني… أنا موجود على طول.",
  },
  askMe: { en: "Ask Baqloz", ar: "اسأل بقلظ" },
} satisfies Record<string, Text>;

/**
 * The site tour: Baqloz walks the visitor through the whole site, page by page, and says what each
 * page is for. `section` scrolls to a part of the page; `point` is what he looks and points at.
 */
export type TourStop = { href: string; section?: string; point?: string; clip?: SceneClip; props?: PropName[]; goggles?: boolean; say: Text[] };
export const SITE_TOUR: TourStop[] = [
  {
    href: "/",
    section: "#hero",
    clip: "Wave",
    say: [
      { ar: "دي الصفحة الرئيسية… منها توصل لأي حاجة في BuildX على طول.", en: "This is the home page. Everything at BuildX starts here." },
      { ar: "فوق في الهيدر هتلاقي كل الصفحات، وزرار البحث لو مستعجل.", en: "Every page is in the header up top, plus search if you're in a hurry." },
    ],
  },
  {
    href: "/about",
    clip: "Think",
    props: ["gears"],
    say: [
      { ar: "هنا تعرف إحنا مين: BuildX HUE، مجتمع طلابي في جامعة حورس للروبوتكس والابتكار.", en: "Who we are: BuildX HUE, Horus University's student community for robotics and innovation." },
      { ar: "شعارنا Build • Innovate • Compete… يعني نتعلم بإيدينا، ونبتكر، وننافس بجد.", en: "Our motto: Build • Innovate • Compete. Learn by doing, invent, and compete for real." },
    ],
  },
  {
    href: "/tracks",
    clip: "Point",
    point: "main a[href*='/tracks/']",
    props: ["chip", "nodes"],
    goggles: true,
    say: [
      { ar: "دي التراكات… كل تراك طريق كامل من الصفر لحد مشروع حقيقي.", en: "The tracks: each one takes you from zero to a real project." },
      { ar: "روبوتكس، AI، سوفتوير، IoT، 3D، ميديا، وبيزنس. لو محتار اسألني وأنا أرشحلك على حسب اهتمامك 😉", en: "Robotics, AI, software, IoT, 3D, media and business. Not sure? Ask me and I'll suggest one 😉" },
    ],
  },
  {
    href: "/competitions",
    clip: "Jump",
    props: ["sensors"],
    say: [
      { ar: "فرق المسابقات… هنا بنجهّز روبوتات ومشاريع وننزل بيها مسابقات بجد 🏆", en: "Competition teams: we build robots and projects and take them to real contests 🏆" },
      { ar: "سومو، لاين فولور، هاكاثونات AI، برمجة… اختار الفريق اللي يشبهك.", en: "Sumo, line follower, AI hackathons, programming… pick the team that fits you." },
    ],
  },
  {
    href: "/bootcamp",
    clip: "Happy",
    props: ["gears"],
    say: [{ ar: "البوتكامب: أسابيع مكثّفة بتبدأ فيها من الأساسيات خطوة بخطوة لحد ما تبقى جاهز للمسابقات.", en: "The bootcamp: intensive weeks, from the basics step by step until you're competition-ready." }],
  },
  {
    href: "/events",
    clip: "LookAround",
    say: [
      { ar: "الإيفنتات: ورش، هاكاثونات، وسهرات بناء.", en: "Events: workshops, hackathons and build nights." },
      { ar: "تقدر تسجّل في أي إيفنت من هنا وتاخد تذكرة QR على موبايلك.", en: "Register for any event here and get a QR ticket on your phone." },
    ],
  },
  {
    href: "/projects",
    clip: "Typing",
    props: ["code"],
    say: [{ ar: "المشاريع اللي أعضاؤنا عملوها بإيديهم… مين عارف، يمكن مشروعك يبقى هنا السنة الجاية 👀", en: "Projects our members built themselves. Maybe yours is here next year 👀" }],
  },
  {
    href: "/team",
    clip: "Wave",
    say: [{ ar: "ودول الناس اللي ورا BuildX… الفريق. دوس على أي حد وشوف شغله.", en: "And these are the people behind BuildX. Click anyone to see their work." }],
  },
  {
    href: "/verify",
    clip: "Think",
    say: [{ ar: "معاك شهادة من عندنا؟ هنا تتأكد إنها أصلية بالكود أو بالـ QR اللي عليها.", en: "Got a BuildX certificate? Check it's genuine here with its code or QR." }],
  },
  {
    href: "/faq",
    clip: "Think",
    say: [{ ar: "عندك سؤال؟ أغلب الإجابات هنا… ولو ملقتهاش، اسألني أنا 😄", en: "Got a question? Most answers are here. And if not, ask me 😄" }],
  },
  {
    href: "/join",
    clip: "Celebrate",
    say: [
      { ar: "وآخر محطة… وأهم محطة 😄 هنا تقدّم وتبقى واحد مننا.", en: "Last stop, and the best one 😄 Apply here and become one of us." },
      { ar: "الفورم سهل، وأنا هكون جنبك في كل خانة لو احتجتني.", en: "The form is easy, and I'll help with every field if you need me." },
    ],
  },
];
