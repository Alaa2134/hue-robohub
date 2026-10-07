/**
 * The guide's answers. A small intent matcher runs in the browser (English and Arabic, no network).
 * It sits behind a provider interface so an AI backend can take over later: set
 * NEXT_PUBLIC_MASCOT_GUIDE_URL to an endpoint you host (e.g. a Supabase Edge Function that holds its
 * own model key server-side) answering POST {question, locale, path} with {text, href?, section?}.
 * No key ever reaches the browser, and the local matcher answers whenever that endpoint can't.
 */
import type { Text } from "@/config/mascotJourney";

export type GuideAnswer = { text: Text; href?: string; section?: string; label?: Text };
export type GuideContext = { locale: "en" | "ar"; path: string };
export interface GuideProvider {
  answer(question: string, ctx: GuideContext): Promise<GuideAnswer>;
}

type Intent = { keys: string[]; answer: GuideAnswer };

const INTENTS: Intent[] = [
  {
    keys: ["join", "member", "apply", "application", "register", "sign up", "signup", "enroll", "انضم", "انضمام", "اشترك", "تسجيل", "سجل", "عضو", "عضويه", "قدم", "تقديم"],
    answer: { text: { en: "Applications go through a short form. It takes about three minutes.", ar: "التقديم من خلال فورم قصير، حوالي ٣ دقايق." }, href: "/join", label: { en: "Open the form", ar: "افتح الفورم" } },
  },
  {
    keys: ["robot", "robotics", "embedded", "arduino", "روبوت", "روبوتكس", "روبوتات", "اردوينو", "امبيدد"],
    answer: { text: { en: "Robotics & Embedded: real robots, sensors and microcontrollers. My favourite 🤖", ar: "روبوتكس وإمبيدد: روبوتات حقيقية وحساسات وميكروكنترولر. المفضّل عندي 🤖" }, href: "/tracks/robotics-embedded", label: { en: "See the track", ar: "شوف التراك" } },
  },
  {
    keys: ["track", "tracks", "learn", "course", "ai", "machine learning", "software", "iot", "design", "business", "تراك", "تراكات", "مسار", "مسارات", "اتعلم", "ذكاء", "برمجه", "سوفتوير", "تصميم"],
    answer: { text: { en: "There are seven tracks, from robotics and AI to design and business.", ar: "في سبع تراكات، من الروبوتكس والذكاء الاصطناعي لحد التصميم والبيزنس." }, href: "/tracks", section: "#tracks", label: { en: "Show the tracks", ar: "ورّيني التراكات" } },
  },
  {
    keys: ["event", "events", "workshop", "hackathon", "session", "when", "next", "schedule", "فعاليه", "فعاليات", "ايفنت", "ورشه", "ورش", "هاكاثون", "امتى", "ميعاد", "مواعيد", "الجاي"],
    answer: { text: { en: "Workshops, hackathons and build nights. Here's what's coming up.", ar: "ورش وهاكاثونات وليالي بناء. ده اللي جاي." }, href: "/events", label: { en: "Upcoming events", ar: "الفعاليات الجاية" } },
  },
  {
    keys: ["compete", "competition", "competitions", "contest", "sumo", "line follower", "race", "sprint", "مسابقه", "مسابقات", "منافسه", "تنافس", "سومو", "لاين فولور", "سباق"],
    answer: { text: { en: "We build and race robots in national competitions. Ready to compete?", ar: "بنبني روبوتات وبنشارك في مسابقات. جاهز تنافس؟" }, href: "/competitions", section: "#compete", label: { en: "Competition teams", ar: "فرق المسابقات" } },
  },
  {
    keys: ["team", "people", "founder", "founders", "who", "members", "mentor", "فريق", "الفريق", "مين", "مؤسس", "المؤسسين", "اعضاء", "منتور"],
    answer: { text: { en: "Meet the people building BuildX.", ar: "قابل الناس اللي بيبنوا BuildX." }, href: "/team", section: "#founders", label: { en: "Meet the team", ar: "قابل الفريق" } },
  },
  {
    keys: ["sponsor", "sponsors", "partner", "partners", "support", "fund", "راعي", "رعاه", "الرعاه", "شريك", "شركاء", "دعم", "تمويل"],
    answer: { text: { en: "Our partners help turn ideas into reality. Interested in partnering?", ar: "شركاؤنا بيساعدونا نحوّل الأفكار لواقع. مهتم تبقى شريك؟" }, href: "/sponsors", section: "#partners", label: { en: "Partners", ar: "الشركاء" } },
  },
  {
    keys: ["bootcamp", "beginner", "start", "basics", "new", "no experience", "بوتكامب", "مبتدئ", "ابدا", "ابتدي", "اساسيات", "معنديش خبره"],
    answer: { text: { en: "New to this? The bootcamp takes you from the basics to competition.", ar: "جديد؟ البوتكامب بياخدك من الأساسيات للمنافسة." }, href: "/bootcamp", label: { en: "The bootcamp", ar: "البوتكامب" } },
  },
  {
    keys: ["project", "projects", "portfolio", "built", "مشروع", "مشاريع", "بورتفوليو"],
    answer: { text: { en: "Real robots, real code, built by students.", ar: "روبوتات حقيقية وكود حقيقي، من صنع الطلاب." }, href: "/projects", label: { en: "See projects", ar: "شوف المشاريع" } },
  },
  {
    keys: ["contact", "email", "phone", "reach", "talk", "where", "location", "address", "campus", "تواصل", "ايميل", "رقم", "تليفون", "كلم", "فين", "مكان", "عنوان"],
    answer: { text: { en: "Send us a message and the team will get back to you.", ar: "ابعتلنا رسالة والفريق هيرد عليك." }, href: "/contact", label: { en: "Contact BuildX", ar: "تواصل معانا" } },
  },
  {
    keys: ["cost", "price", "free", "fee", "pay", "faq", "question", "سعر", "فلوس", "مجاني", "مجانا", "بكام", "رسوم", "سؤال", "اسئله"],
    answer: { text: { en: "The FAQ covers fees, time and what you need.", ar: "الأسئلة الشائعة فيها الرسوم والمواعيد واللي محتاجه." }, href: "/faq", label: { en: "Open the FAQ", ar: "افتح الأسئلة" } },
  },
  {
    keys: ["about", "what is", "buildx", "club", "community", "عن", "ايه هو", "ايه هي", "مين انتو", "نادي", "مجتمع"],
    answer: { text: { en: "BuildX HUE is Horus University's student community for robotics and innovation.", ar: "BuildX HUE مجتمع طلابي في جامعة حورس للروبوتكس والابتكار." }, href: "/about", section: "#why", label: { en: "About BuildX", ar: "عن BuildX" } },
  },
  {
    keys: ["hi", "hello", "hey", "salam", "اهلا", "هاي", "السلام", "ازيك", "مرحبا"],
    answer: { text: { en: "Hey 👋 Ask me about tracks, events, competitions or joining.", ar: "أهلاً 👋 اسألني عن التراكات أو الفعاليات أو المسابقات أو الانضمام." } },
  },
];

const FALLBACK: GuideAnswer = {
  text: { en: "I'm not sure about that one. The FAQ or the team can help.", ar: "مش متأكد من دي. الأسئلة الشائعة أو الفريق هيساعدوك." },
  href: "/faq",
  label: { en: "Open the FAQ", ar: "افتح الأسئلة" },
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
      if (hit) score += key.length > 4 ? 2 : 1;
    }
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }
  return best?.answer ?? FALLBACK;
}

export const localGuide: GuideProvider = {
  answer: async (q) => matchIntent(q),
};

function remoteGuide(url: string): GuideProvider {
  return {
    async answer(question, ctx) {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 6000);
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: question.slice(0, 300), ...ctx }), signal: ctl.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(String(res.status));
        const d = (await res.json()) as { text?: string; href?: string; section?: string };
        if (!d.text) throw new Error("empty");
        const local = matchIntent(question);
        return { text: { en: d.text, ar: d.text }, href: d.href ?? local.href, section: d.section ?? local.section, label: local.label };
      } catch {
        return matchIntent(question);
      }
    },
  };
}

export function guideProvider(): GuideProvider {
  const url = process.env.NEXT_PUBLIC_MASCOT_GUIDE_URL;
  return url ? remoteGuide(url) : localGuide;
}
