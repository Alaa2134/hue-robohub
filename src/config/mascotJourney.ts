/**
 * Where the BuildX guide goes and what it says, per page and per section. Everything the mascot does
 * on its own comes from here, so new sections or pages only need a new entry (no component changes).
 *
 *  - `selector`: the section that starts the scene when it scrolls into the middle of the screen.
 *  - `clip`: what the mascot does there ("Point" picks PointLeft/PointRight towards `point`).
 *  - `say`: one or more lines (English + Arabic); later lines follow after a pause.
 *  - `props`: small floating 3D objects for the section; `goggles`/`drone` are the robotics extras.
 *  - `side`: which side of the screen it prefers ("start"/"end" follow the reading direction).
 */
import type { IconName } from "@/components/brand/icons";
import type { ClipName } from "@/lib/mascot/clip-names";

export type Text = { en: string; ar: string };
export type PropName = "gears" | "nodes" | "chip" | "code" | "sensors";
export type SceneClip = ClipName | "Point";

export type SceneAction =
  | { kind: "tour"; label: Text }
  | { kind: "dismiss"; label: Text }
  | { kind: "go"; label: Text; href: string; celebrate?: boolean }
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

const tour: SceneAction = { kind: "tour", label: { en: "Show me around", ar: "يلا فرّجني" } };
const notNow: SceneAction = { kind: "dismiss", label: { en: "Not now", ar: "بعدين" } };
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
          { en: "Hey 👋 Welcome to BuildX HUE.", ar: "أهلاً أهلاً 👋 نوّرت BuildX HUE!" },
          { en: "Want me to show you around?", ar: "تيجي أفرّجك على المكان؟", actions: [tour, notNow] },
        ],
      },
      { id: "about", selector: "#why", clip: "Think", props: ["gears"], say: [{ en: "This is where ideas become real projects.", ar: "هنا بقى الأفكار بتتحوّل لمشاريع بجد." }] },
      {
        id: "tracks",
        selector: "#tracks",
        clip: "Point",
        point: "#tracks a[href*='/tracks/']",
        props: ["chip", "nodes"],
        goggles: true,
        drone: true,
        say: [{ en: "Pick your track. Robotics is my favourite 🤖", ar: "اختار التراك اللي على مزاجك. أنا بصراحة بموت في الروبوتكس 🤖" }],
      },
      { id: "activities", selector: "#activities", clip: "Typing", props: ["code"], say: [{ en: "Workshops, hackathons, build nights. Always something on.", ar: "ورش وهاكاثونات وسهرات بناء… هنا دايماً في حاجة شغّالة." }] },
      { id: "compete", selector: "#compete", clip: "Happy", props: ["sensors"], say: [{ en: "Ready to compete?", ar: "مستعد تنافس؟ إحنا مستنيينك 🏁" }] },
      { id: "events", selector: "#roadmap", clip: "Point", point: "#roadmap h2", say: [{ en: "Here's what we're building next.", ar: "بص، ده اللي بنحضّره الفترة الجاية." }] },
      { id: "team", selector: "#founders", clip: "Wave", say: [{ en: "Meet the people building BuildX.", ar: "تعالى أعرّفك على الناس اللي بيبنوا BuildX." }] },
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
  { match: /^\/about$/, scenes: [{ id: "about", selector: "main", clip: "Think", props: ["gears"], enter: true, say: [{ en: "This is where ideas become real projects.", ar: "هنا بقى الأفكار بتتحوّل لمشاريع بجد." }] }] },
  {
    match: /^\/tracks$/,
    scenes: [{ id: "tracks", selector: "main", clip: "Point", point: "main a[href*='/tracks/']", goggles: true, drone: true, props: ["chip"], enter: true, say: [{ en: "Seven tracks, one machine. Which one's yours?", ar: "سبع تراكات وآلة واحدة. إنت بقى هتختار أنهي؟" }] }],
  },
  { match: /^\/tracks\/robotics/, scenes: [{ id: "robotics", selector: "main", clip: "Happy", goggles: true, drone: true, props: ["chip", "sensors"], enter: true, say: [{ en: "Robotics! Goggles on 🥽", ar: "روبوتكس! استنى ألبس النضارة 🥽" }] }] },
  { match: /^\/tracks\/ai/, scenes: [{ id: "ai", selector: "main", clip: "Think", props: ["nodes"], enter: true }] },
  { match: /^\/tracks\/(software|programming)/, scenes: [{ id: "software", selector: "main", clip: "Typing", props: ["code"], enter: true }] },
  { match: /^\/tracks\/iot/, scenes: [{ id: "iot", selector: "main", clip: "Listening", props: ["sensors"], enter: true }] },
  { match: /^\/tracks\//, scenes: [{ id: "track", selector: "main", clip: "Idle", props: ["gears"], enter: true }] },
  { match: /^\/events/, scenes: [{ id: "events", selector: "main", clip: "LookAround", enter: true, say: [{ en: "Here's what we're building next.", ar: "بص، ده اللي بنحضّره الفترة الجاية." }] }] },
  { match: /^\/competitions$/, scenes: [{ id: "compete", selector: "main", clip: "Happy", props: ["sensors"], enter: true, say: [{ en: "Ready to compete?", ar: "مستعد تنافس؟ إحنا مستنيينك 🏁" }] }] },
  { match: /^\/competitions\//, scenes: [{ id: "team", selector: "main", clip: "Idle", props: ["sensors"], enter: true }] },
  { match: /^\/team$/, scenes: [{ id: "team", selector: "main", clip: "Wave", enter: true, say: [{ en: "Meet the people building BuildX.", ar: "تعالى أعرّفك على الناس اللي بيبنوا BuildX." }] }] },
  { match: /^\/sponsors$/, scenes: [{ id: "sponsors", selector: "main", clip: "Idle", enter: true, say: [{ en: "Our partners help turn ideas into reality.", ar: "شركاؤنا هم اللي بيساعدونا نحوّل الأفكار لحاجة حقيقية." }] }] },
  { match: /^\/projects/, scenes: [{ id: "projects", selector: "main", clip: "Typing", props: ["code"], enter: true, say: [{ en: "Real robots. Real code. Built by students.", ar: "روبوتات بجد وكود بجد… وكله من شغل الطلبة." }] }] },
  { match: /^\/bootcamp$/, scenes: [{ id: "bootcamp", selector: "main", clip: "Happy", props: ["gears"], enter: true, say: [{ en: "From basics to competition. Start here.", ar: "من الصفر لحد المسابقات. ابدأ من هنا." }] }] },
  { match: /^\/achievements$/, scenes: [{ id: "achievements", selector: "main", clip: "Celebrate", enter: true }] },
  { match: /^\/faq$/, scenes: [{ id: "faq", selector: "main", clip: "Think", enter: true, say: [{ en: "Can't find it? Click me and ask.", ar: "مش لاقي اللي بتدوّر عليه؟ دوس عليّا واسألني." }] }] },
  { match: /^\/contact$/, scenes: [{ id: "contact", selector: "main", clip: "Listening", enter: true, say: [{ en: "Say hi. We read every message.", ar: "ابعتلنا براحتك، إحنا بنقرا كل رسالة." }] }] },
  { match: /^\/join$/, scenes: [{ id: "join", selector: "main", clip: "Happy", enter: true, say: [{ en: "Ready to build with us? It takes about three minutes.", ar: "جاهز تبني معانا؟ الفورم مش هياخد منك أكتر من ٣ دقايق." }] }] },
  // Everything else (news, gallery, films, resources...): it just walks in and stays out of the way.
  { match: /./, scenes: [{ id: "page", selector: "main", clip: "Idle", enter: true }] },
];

/**
 * The guide's voice. "ar": it always speaks Egyptian Arabic, on English pages too (it's a local
 * character). "page": it follows the page's language.
 */
export const GUIDE_VOICE: "ar" | "page" = "ar";

/** Pages where the guide stays away: utility pages people come to for one thing. */
export const QUIET_ROUTES = [/^\/verify/, /^\/ticket/, /^\/brand$/, /^\/privacy$/];

/** Pages with forms: on phones the guide starts minimised there so it never sits on an input. */
export const FORM_ROUTES = [/^\/join$/, /^\/contact$/];

export type MenuItem = { id: string; label: Text; icon: IconName; href: string; section?: string };

/** The menu that opens when the mascot is clicked. `section` scrolls on the home page instead of leaving it. */
export const MENU: MenuItem[] = [
  { id: "explore", label: { en: "Explore BuildX", ar: "اتفرّج على BuildX" }, icon: "globe", href: "/about", section: "#why" },
  { id: "tracks", label: { en: "Our Tracks", ar: "التراكات" }, icon: "layers", href: "/tracks", section: "#tracks" },
  { id: "events", label: { en: "Upcoming Events", ar: "الإيفنتات الجاية" }, icon: "calendar", href: "/events" },
  { id: "competitions", label: { en: "Competitions", ar: "المسابقات" }, icon: "flag", href: "/competitions", section: "#compete" },
  { id: "team", label: { en: "Meet the Team", ar: "اتعرّف على الفريق" }, icon: "users", href: "/team", section: "#founders" },
  { id: "join", label: { en: "Become a Member", ar: "خليك عضو معانا" }, icon: "plus", href: "/join" },
  { id: "contact", label: { en: "Contact BuildX", ar: "كلّمنا" }, icon: "mail", href: "/contact" },
];

/** Short lines for the guide's own moments (not tied to a section). */
export const LINES = {
  welcomeBack: { en: "Welcome back 👋", ar: "أهلاً بيك تاني 👋 وحشتنا!" },
  sleepy: { en: "Zz… move the mouse to wake me.", ar: "Zzz… حرّك الماوس عشان أصحى." },
  awake: { en: "I'm up, I'm up!", ar: "صاحي، صاحي! 😅" },
  dance: { en: "You found my secret move 🕺", ar: "كده إنت عرفت الرقصة السرية بتاعتي 🕺" },
  zoom: { en: "Whoa, fast hands!", ar: "براحة يا عم! إيدك سريعة 😄" },
  joined: { en: "Let's go! See you inside 🎉", ar: "يلا بينا! هنستناك جوه 🎉" },
  tourDone: { en: "That's the tour. Click me anytime.", ar: "كده خلّصنا اللفّة. لو احتجتني دوس عليّا في أي وقت." },
  hidden: { en: "Guide hidden. Bring me back from the corner.", ar: "اتخبيت. رجّعني من الركن." },
  next: { en: "Next", ar: "اللي بعده" },
  stop: { en: "End tour", ar: "كفاية كده" },
} satisfies Record<string, Text>;
