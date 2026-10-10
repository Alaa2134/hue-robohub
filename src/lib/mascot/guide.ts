/**
 * Baqloz's navigation answers: a keyword matcher (English and Arabic) that maps a question to the
 * page that answers it, with a short line and a button. The chat (chat.ts) asks his brain
 * (brain.ts) first; this is what the brain falls back on for "where is…" and "how do I…".
 *
 * Answers only point to what the site itself says (no invented dates or prices): for details they
 * send people to the right page.
 */
import { TEAMS, TRACKS, type Text } from "@/config/mascotJourney";

/** "search" opens the site search, "lang" switches language, "top" scrolls up, "tour" starts the site tour. */
export type GuideAction = "search" | "lang" | "top" | "tour" | "pagetour";
export type GuideAnswer = { text: Text; href?: string; section?: string; label?: Text; action?: GuideAction };

type Intent = { keys: string[]; answer: GuideAnswer };

const t = (ar: string, en: string): Text => ({ ar, en });

const TRACK_KEYS: Record<string, string[]> = {
  "robotics-embedded": ["robot", "robotics", "embedded", "arduino", "microcontroller", "روبوت", "روبوتكس", "روبوتات", "اردوينو", "امبيدد", "ميكروكنترولر"],
  "ai-ml": ["ai", "machine learning", "deep learning", "ml", "data science", "ذكاء", "ذكاء اصطناعي", "تعلم الاله", "داتا ساينس"],
  software: ["software", "web", "frontend", "backend", "mobile app", "flutter", "react", "سوفتوير", "ويب", "فرونت", "باك اند", "موبايل اب"],
  iot: ["iot", "internet of things", "sensor", "انترنت الاشياء", "حساس", "حساسات"],
  "3d-design": ["3d", "cad", "solidworks", "printing", "3d print", "طباعه", "طباعه ثلاثيه", "كاد", "سوليد"],
  "media-design": ["media", "graphic", "video editing", "photography", "ui", "ux", "ميديا", "جرافيك", "مونتاج", "تصوير", "ديزاين"],
  business: ["business", "startup", "entrepreneur", "marketing", "بيزنس", "ستارت اب", "ريادة", "ريادة اعمال", "ماركتنج", "تسويق"],
};

const TEAM_KEYS: Record<string, string[]> = {
  "line-follower": ["line follower", "linefollower", "لاين فولور", "متتبع الخط"],
  sumo: ["sumo", "سومو"],
  "iot-challenges": ["iot challenge", "تحدي iot", "تحديات iot"],
  "ai-hackathons": ["hackathon", "هاكاثون"],
  programming: ["programming contest", "icpc", "competitive programming", "مسابقات برمجه", "برمجه تنافسيه"],
  "green-innovation": ["green", "environment", "sustainab", "بيئه", "اخضر"],
};

export const INTENTS: Intent[] = [
  // Who and what.
  { keys: ["who are you", "your name", "baqloz", "انت مين", "اسمك", "بقلظ", "مين انت"], answer: { text: t("أنا بقلظ 👋 مرشدك في BuildX HUE. بلفّ معاك الموقع وأجاوبك على أي سؤال.", "I'm Baqloz 👋 your BuildX HUE guide. I show you around and answer questions.") } },
  { keys: ["what can you do", "help", "تقدر تعمل", "بتعمل ايه", "ساعدني", "مساعده"], answer: { text: t("أقدر أفرّجك على الموقع، أوصّلك لأي صفحة، أساعدك تملا الفورم، وأجاوب على أسئلتك عن التراكات والإيفنتات والمسابقات والانضمام.", "I can show you around, take you anywhere, help with forms, and answer questions about tracks, events, competitions and joining.") } },
  { keys: ["hi", "hello", "hey", "salam", "اهلا", "هاي", "السلام", "مرحبا", "ازيك", "عامل ايه", "اخبارك"], answer: { text: t("الحمد لله تمام 😄 وإنت؟ اسألني عن التراكات أو الإيفنتات أو المسابقات أو إزاي تنضم.", "I'm great 😄 Ask me about tracks, events, competitions or joining.") } },
  { keys: ["thanks", "thank you", "شكرا", "متشكر", "تسلم", "ميرسي"], answer: { text: t("العفو يا باشا 🙏 أنا موجود في أي وقت.", "Anytime 🙏") } },
  { keys: ["joke", "funny", "نكته", "ضحكني", "هزار"], answer: { text: t("مرة روبوت دخل امتحان… جاب صفر عشان قال 0 و1 بس 😂", "A robot took an exam… and only answered in 0s and 1s 😂") } },
  { keys: ["another joke", "one more joke", "نكته تانيه", "كمان نكته", "قول نكته"], answer: { text: t("مرة واحد سأل الروبوت: إنت بتحب إيه؟ قاله: البايتات… بس مش بايتات الكحك 🍪😂", "Someone asked a robot what it loves. \"Bytes,\" it said. \"Not the cookie kind\" 🍪😂") } },
  { keys: ["are you a robot", "are you real", "انت روبوت", "انت حقيقي", "انت بني ادم", "انت انسان"], answer: { text: t("أنا مش روبوت ومش بني آدم… أنا بقلظ 😄 كائن فروي بيحب الروبوتات والطلبة.", "Not a robot, not a human: I'm Baqloz 😄 a furry fan of robots and students.") } },
  { keys: ["who made you", "who created you", "مين عملك", "مين صممك", "مين اخترعك", "اتعملت ازاي"], answer: { text: t("فريق BuildX هو اللي عملني… عشان محدش يتوه في الموقع تاني 💙", "The BuildX team made me, so nobody gets lost on the site again 💙") } },
  { keys: ["how old are you", "your age", "عندك كام سنه", "سنك كام", "عمرك كام"], answer: { text: t("أنا لسه صغير… بس بتعلم بسرعة الصاروخ 🚀", "I'm still young, but I learn at rocket speed 🚀") } },
  { keys: ["what do you like", "favorite", "بتحب ايه", "حاجتك المفضله", "بتحب مين"], answer: { text: t("بحب الروبوتات، والشاي بالنعناع، والطلبة اللي بيسألوا كتير 😄", "Robots, mint tea, and students who ask lots of questions 😄") } },
  { keys: ["do you sleep", "are you tired", "بتنام", "انت تعبان", "مش بتتعب"], answer: { text: t("بنام لما محدش بيحرّك الماوس… بس صحياني خفيف، أي حركة وأقوم 😴", "I nap when nobody moves the mouse, but I'm a light sleeper 😴") } },
  { keys: ["i love you", "you are cute", "بحبك", "انت عسول", "انت كيوت", "انت لذيذ"], answer: { text: t("وأنا كمان بحبك 🥹💙 يلا بقى نكمّل نلف في الموقع؟", "Aw, love you too 🥹💙 Shall we keep exploring?") } },
  { keys: ["you are smart", "good job", "انت ذكي", "انت شاطر", "برافو عليك", "عاش"], answer: { text: t("ده من ذوقك 😊 بس الشطارة الحقيقية عند الفريق.", "That's kind 😊 The real brains are the team.") } },
  { keys: ["i am bored", "bored", "زهقان", "مزهق", "ملل", "زهقت"], answer: { text: t("زهقان؟ تعالى نلعب! افتح قايمتي ودوس على «العب» 🎮", "Bored? Let's play! Open my menu and tap Play 🎮") } },
  { keys: ["i am sad", "sad", "زعلان", "متضايق", "مخنوق", "حزين"], answer: { text: t("سلامتك من الزعل 💙 خد نفس عميق… وكل حاجة بتتحل. ولو حابب تتكلم مع حد من الفريق، ابعتلنا.", "Sorry you're down 💙 Take a breath; things work out. Want to talk to the team? Message us."), href: "/contact", label: t("كلّمنا", "Contact us") } },
  { keys: ["good morning", "صباح الخير", "صباح الفل", "صباحو"], answer: { text: t("صباح الفل والياسمين ☀️ يومك حلو إن شاء الله!", "Good morning ☀️ Have a great day!") } },
  { keys: ["good night", "تصبح علي خير", "تصبحي علي خير", "هنام"], answer: { text: t("وإنت من أهله 🌙 نام كويس وتعالى بكرة نكمّل.", "Good night 🌙 Sleep well, see you tomorrow.") } },
  { keys: ["can you speak english", "do you speak", "بتتكلم انجليزي", "بتعرف انجليزي"], answer: { text: t("بفهم الإنجليزي كويس… بس بحب أرد بالمصري 😄", "I understand English fine, but I like answering in Egyptian 😄") } },
  { keys: ["what is robotics", "يعني ايه روبوتكس", "الروبوتكس يعني ايه"], answer: { text: t("الروبوتكس إنك تبني آلة تحس (حساسات)، وتفكر (كود)، وتتحرك (موتورات). كل ده هتتعلمه معانا خطوة خطوة 🤖", "Robotics: machines that sense (sensors), think (code) and move (motors). You'll learn it all with us 🤖"), href: "/tracks/robotics-embedded", label: t("تراك الروبوتكس", "Robotics track") } },
  { keys: ["what is arduino", "يعني ايه اردوينو", "الاردوينو ده ايه"], answer: { text: t("الأردوينو بوردة صغيرة بتكتب عليها كود يتحكم في لمبات وموتورات وحساسات… أحسن بداية في الإلكترونيات 🔌", "Arduino is a small board you program to control lights, motors and sensors: the best start in electronics 🔌"), href: "/tracks/robotics-embedded", label: t("تراك الروبوتكس", "Robotics track") } },

  // Joining and applying.
  { keys: ["join", "member", "apply", "application", "register", "sign up", "signup", "enroll", "انضم", "انضمام", "اشترك", "تسجيل", "سجل", "عضو", "عضويه", "قدم", "تقديم", "ابدا ازاي"], answer: { text: t("التقديم بفورم صغير، مش هياخد منك أكتر من ٣ دقايق.", "Apply with a short form; it takes about three minutes."), href: "/join", label: t("افتح الفورم", "Open the form") } },
  { keys: ["status", "my application", "track application", "reference", "حاله الطلب", "طلبي", "اتابع", "متابعه", "وصل لفين", "كود الطلب"], answer: { text: t("تقدر تتابع طلبك بكود الطلب اللي جالك بعد التقديم.", "Track your application with the reference you got after applying."), href: "/join/status", label: t("تابع طلبك", "Track it") } },
  { keys: ["when will", "hear back", "reply", "response", "هيردوا", "الرد", "امتى يردوا", "هيكلموني"], answer: { text: t("الفريق بيراجع كل الطلبات وبيرد على الإيميل. وتقدر تتابع طلبك أول بأول.", "The team reviews every application and replies by email. You can track yours anytime."), href: "/join/status", label: t("تابع طلبك", "Track it") } },
  { keys: ["requirement", "need to know", "experience", "beginner", "no experience", "محتاج اكون", "لازم اكون", "شروط", "مبتدئ", "معنديش خبره", "من الصفر", "مش بعرف"], answer: { text: t("مش محتاج خبرة خالص! ناس كتير بدأت من الصفر، والبوتكامب معمول عشان كده.", "No experience needed. Many started from zero; that's what the bootcamp is for."), href: "/bootcamp", label: t("البوتكامب", "The bootcamp") } },

  // Tracks and teams (specific ones are added below).
  { keys: ["track", "tracks", "learn", "course", "تراك", "تراكات", "مسار", "مسارات", "اتعلم", "كورس"], answer: { text: t("عندنا سبع تراكات، من الروبوتكس والـ AI لحد الديزاين والبيزنس. قرّب الماوس من أي كارت وأنا أحكيلك عنه.", "Seven tracks, from robotics and AI to design and business."), href: "/tracks", section: "#tracks", label: t("ورّيني التراكات", "Show the tracks") } },
  { keys: ["which track", "choose", "best track", "start with", "اختار", "انهي تراك", "ابدا بانهي", "احسن تراك", "محتار"], answer: { text: t("لو بتحب الهاردوير ابدأ بالروبوتكس، لو بتحب الداتا الـ AI، لو بتحب التطبيقات السوفتوير، ولو فنان الميديا. ومش لازم تقرر دلوقتي 😉", "Hardware → robotics, data → AI, apps → software, creative → media. No need to decide now 😉"), href: "/tracks", label: t("قارن التراكات", "Compare tracks") } },
  { keys: ["compete", "competition", "competitions", "contest", "race", "مسابقه", "مسابقات", "منافسه", "تنافس", "سباق"], answer: { text: t("بنبني روبوتات وبننزل بيها مسابقات باسم جامعة حورس. عندنا فرق لاين فولور وسومو وIoT وAI وبرمجة وابتكار أخضر.", "We build robots and compete for Horus University: line follower, sumo, IoT, AI, programming and green innovation teams."), href: "/competitions", section: "#compete", label: t("فرق المسابقات", "Competition teams") } },
  { keys: ["join team", "competition team", "ادخل فريق", "انضم لفريق", "فريق مسابقات"], answer: { text: t("قدّم الأول وقول في الفورم إنك مهتم بالمسابقات، والفريق هيرشحك للتيم المناسب.", "Apply and mention competitions in the form; the team will place you."), href: "/join", label: t("قدّم دلوقتي", "Apply now") } },

  // Activities.
  { keys: ["event", "events", "workshop", "hackathon", "session", "when", "next", "schedule", "فعاليه", "فعاليات", "ايفنت", "ايفنتات", "ورشه", "ورش", "امتى", "ميعاد", "مواعيد", "الجاي"], answer: { text: t("ورش وهاكاثونات وسهرات بناء. بص على اللي جاي.", "Workshops, hackathons and build nights. Here's what's coming up."), href: "/events", label: t("الإيفنتات الجاية", "Upcoming events") } },
  { keys: ["book", "ticket", "register event", "reserve", "احجز", "حجز", "تذكره", "تيكت"], answer: { text: t("افتح الإيفنت ودوس «احجز»، هيوصلك تيكت بـ QR تورّيه على الباب 🎟️", "Open the event and book: you'll get a QR ticket for the door 🎟️"), href: "/events", label: t("الإيفنتات", "Events") } },
  { keys: ["bootcamp", "بوتكامب"], answer: { text: t("البوتكامب بياخدك من الصفر لحد المسابقات، خطوة خطوة.", "The bootcamp takes you from zero to competition, step by step."), href: "/bootcamp", label: t("البوتكامب", "The bootcamp") } },
  { keys: ["project", "projects", "portfolio", "built", "مشروع", "مشاريع", "بورتفوليو", "اتعمل"], answer: { text: t("روبوتات بجد وكود بجد… وكله من شغل الطلبة.", "Real robots, real code, built by students."), href: "/projects", label: t("شوف المشاريع", "See projects") } },
  { keys: ["achievement", "award", "won", "result", "prize", "انجاز", "انجازات", "جوايز", "كسبنا", "نتايج", "مركز"], answer: { text: t("دي إنجازاتنا لحد دلوقتي 🏆", "Our wins so far 🏆"), href: "/achievements", label: t("الإنجازات", "Achievements") } },
  { keys: ["news", "blog", "اخبار", "خبر", "جديد"], answer: { text: t("آخر أخبار BuildX هنا 📰", "The latest BuildX news 📰"), href: "/news", label: t("الأخبار", "News") } },
  { keys: ["gallery", "photo", "picture", "صور", "صوره", "معرض"], answer: { text: t("صور من الإيفنتات والكواليس 📸", "Photos from events and behind the scenes 📸"), href: "/gallery", label: t("الصور", "Gallery") } },
  { keys: ["video", "film", "youtube", "فيديو", "فيلم", "يوتيوب"], answer: { text: t("الفيديوهات كلها هنا 🎬", "All our videos 🎬"), href: "/films", label: t("الفيديوهات", "Films") } },
  { keys: ["resource", "material", "pdf", "مصادر", "ماتريال", "مذاكره"], answer: { text: t("مصادر تتعلم منها ببلاش 📚", "Free learning resources 📚"), href: "/resources", label: t("المصادر", "Resources") } },

  // People and partners.
  { keys: ["team", "people", "founder", "founders", "who runs", "members", "mentor", "فريق", "الفريق", "مين", "مؤسس", "المؤسسين", "اعضاء", "منتور"], answer: { text: t("تعالى أعرّفك على الناس اللي بيبنوا BuildX.", "Meet the people building BuildX."), href: "/team", section: "#founders", label: t("اتعرّف على الفريق", "Meet the team") } },
  { keys: ["sponsor", "sponsors", "partner", "partners", "support", "fund", "راعي", "رعاه", "الرعاه", "شريك", "شركاء", "دعم", "تمويل", "ابقى شريك"], answer: { text: t("شركاؤنا هم اللي بيساعدونا نحوّل الأفكار لحاجة حقيقية. حابب تبقى شريك؟ كلّمنا.", "Our partners help turn ideas into reality. Want to partner? Talk to us."), href: "/sponsors", section: "#partners", label: t("الشراكة", "Partnering") } },

  // Practical.
  { keys: ["contact", "email", "phone", "reach", "talk", "whatsapp", "تواصل", "ايميل", "رقم", "تليفون", "كلم", "اكلمكم", "واتساب"], answer: { text: t("ابعتلنا رسالة والفريق هيرد عليك في أقرب وقت.", "Send us a message and the team will get back to you."), href: "/contact", label: t("كلّمنا", "Contact us") } },
  { keys: ["where", "location", "address", "campus", "university", "فين", "مكان", "عنوان", "الجامعه", "حورس"], answer: { text: t("إحنا في جامعة حورس – مصر. تفاصيل المكان والمواعيد بتكون في صفحة كل إيفنت.", "We're at Horus University, Egypt. Each event page has its place and time."), href: "/contact", label: t("كلّمنا", "Contact us") } },
  { keys: ["cost", "price", "free", "fee", "pay", "money", "سعر", "فلوس", "مجاني", "مجانا", "ببلاش", "بكام", "رسوم", "تمن"], answer: { text: t("كل تفاصيل الفلوس والمواعيد في الأسئلة الشائعة.", "Fees and timing are in the FAQ."), href: "/faq", label: t("الأسئلة الشائعة", "FAQ") } },
  { keys: ["faq", "question", "questions", "اسئله", "سؤال", "اسئله شائعه"], answer: { text: t("الأسئلة الشائعة فيها أغلب الإجابات.", "The FAQ answers most questions."), href: "/faq", label: t("الأسئلة الشائعة", "FAQ") } },
  { keys: ["certificate", "verify", "qr", "شهاده", "شهادات", "تحقق", "اتاكد"], answer: { text: t("كل شهادة ليها كود وQR… اكتب الكود وأنا أقولك أصلية ولا لأ 🔍", "Every certificate has a code and QR; enter it to verify 🔍"), href: "/verify", label: t("تحقق من شهادة", "Verify") } },
  { keys: ["app", "application app", "download app", "تطبيق", "ابلكيشن", "ابليكيشن", "الابلكيشن"], answer: { text: t("عندنا تطبيق BuildX للطلبة والفريق: حضور وتاسكات ونقط وشهادات 📱", "The BuildX app: attendance, tasks, points and certificates 📱"), href: "/app", label: t("افتح التطبيق", "Open the app") } },
  { keys: ["social", "instagram", "facebook", "linkedin", "tiktok", "follow", "سوشيال", "انستجرام", "فيسبوك", "لينكدان", "تيك توك", "تابع"], answer: { text: t("لينكات السوشيال في آخر الصفحة تحت 📱", "Our social links are in the footer 📱") } },
  { keys: ["privacy", "data", "خصوصيه", "بياناتي", "بيانات"], answer: { text: t("بياناتك في أمان معانا… التفاصيل هنا.", "Your data is safe; details here."), href: "/privacy", label: t("الخصوصية", "Privacy") } },
  { keys: ["brand", "logo", "colors", "لوجو", "شعار", "هويه", "الوان"], answer: { text: t("اللوجوهات والألوان والخطوط كلها في صفحة الهوية.", "Logos, colours and fonts are on the brand page."), href: "/brand", label: t("الهوية", "Brand") } },
  { keys: ["about", "what is", "buildx", "club", "community", "عن", "ايه هو", "ايه هي", "مين انتو", "نادي", "مجتمع"], answer: { text: t("BuildX HUE ده مجتمع طلبة في جامعة حورس، بنعمل روبوتكس وابتكار.", "BuildX HUE is Horus University's student community for robotics and innovation."), href: "/about", section: "#why", label: t("عن BuildX", "About BuildX") } },

  // Site controls.
  { keys: ["search", "find", "ابحث", "بحث", "دور", "الاقي"], answer: { text: t("افتحلك البحث؟ اكتب أي حاجة وهتلاقيها.", "Open search? Type anything."), action: "search", label: t("افتح البحث", "Open search") } },
  { keys: ["english", "arabic", "language", "انجليزي", "عربي", "اللغه", "غير اللغه"], answer: { text: t("تحب أقلب اللغة؟ أنا هفضل أتكلم مصري في الحالتين 😄", "Switch language? I'll still speak Egyptian 😄"), action: "lang", label: t("غيّر اللغة", "Switch language") } },
  { keys: ["top", "up", "beginning", "فوق", "الاول", "اطلع"], answer: { text: t("يلا نطلع لفوق ⬆️", "Back to the top ⬆️"), action: "top", label: t("اطلع لفوق", "To the top") } },
];

// One intent per track and per competition team, with what each is about.
for (const [slug, keys] of Object.entries(TRACK_KEYS))
  if (TRACKS[slug]) INTENTS.push({ keys, answer: { text: TRACKS[slug], href: `/tracks/${slug}`, label: t("شوف التراك", "See the track") } });
for (const [slug, keys] of Object.entries(TEAM_KEYS))
  if (TEAMS[slug]) INTENTS.push({ keys, answer: { text: TEAMS[slug], href: `/competitions/${slug}`, label: t("شوف الفريق", "See the team") } });

export const FALLBACK: GuideAnswer = {
  text: t("دي مش عارفها بصراحة 😅 جرّب البحث، أو الأسئلة الشائعة، أو ابعت للفريق.", "Not sure about that one 😅 Try search, the FAQ, or message the team."),
  action: "search",
  label: t("افتح البحث", "Open search"),
};

/** Lowercase, drop Arabic diacritics and unify letter variants so "إنضمام" matches "انضمام". */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchIntent(question: string): GuideAnswer {
  const q = ` ${normalize(question)} `;
  let best: Intent | null = null;
  let bestScore = 0;
  for (const intent of INTENTS) {
    let score = 0;
    for (const k of intent.keys) {
      const key = normalize(k);
      // Short keys must be whole words ("ai" shouldn't match "said", "عن" not "عندي"); longer ones match inside words.
      const hit = key.length <= 3 ? q.includes(` ${key} `) : q.includes(key);
      // Longer, more specific keys count more ("which track" beats "track").
      if (hit) score += key.includes(" ") ? 3 : key.length > 4 ? 2 : 1;
    }
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }
  return best?.answer ?? FALLBACK;
}
