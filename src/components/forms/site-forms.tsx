"use client";
/**
 * The website's forms on the live (static) site, straight to Supabase like the application form:
 * "Contact us" and sponsorship requests (they land in the BuildX App's inbox), the "tell me when
 * applications open" waitlist, and the forms the team builds in the app (team tryouts, renewals,
 * surveys…), which open and close from there.
 */
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/brand/icons";
import { inputCls } from "@/components/command/field";
import { cn } from "@/lib/cn";
import { MediaError, mediaErrorText, prepareMedia, type MediaKind } from "@/lib/client-media";
import { readNationalId } from "@/content/family";
import { asciiDigits } from "@/lib/format";
import { NO_SHOW } from "@/lib/no-show";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

type Locale = "ar" | "en";
const L = (l: string): Locale => (l === "ar" ? "ar" : "en");

async function rpc<T>(fn: string, body: unknown): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as T;
}

const C = {
  ar: {
    name: "الاسم",
    email: "البريد الإلكتروني",
    phone: "رقم الموبايل / واتساب",
    org: "الجهة / الشركة",
    topic: "الموضوع",
    message: "رسالتك",
    optional: "اختياري",
    send: "ابعت",
    sending: "بنبعت…",
    oneOf: "اكتب الإيميل أو رقم الموبايل عشان نعرف نرد عليك.",
    required: "الخانة دي مطلوبة.",
    short: (n: number) => `اكتب ${n} حروف على الأقل.`,
    badEmail: "الإيميل مش مظبوط.",
    badPhone: "الرقم مش مظبوط.",
    badUrl: "اكتب رابط كامل يبدأ بـ https://",
    badNumber: "اكتب رقم.",
    badDate: "اختار تاريخ.",
    badOption: "اختار من الاختيارات.",
    badMember: "رقم العضوية ده مش موجود أو العضوية مش مفعّلة. اتأكد من الرقم اللي على كارنيه BuildX.",
    memberPh: "مثلاً 2024001",
    notMember: "مش عضو في الكميونيتي؟",
    askInterview: "اطلب انترفيو مع منظم الموقع",
    tooLong: "الكلام طويل زيادة.",
    fileChoose: "اختار ملف",
    fileHint: "الصور والفيديو بيتضغطوا قبل ما يتبعتوا.",
    fileWorking: "بنجهّز الملف وبنضغطه…",
    fileUp: "بنرفع الملف…",
    fileDone: (name: string, before: string, after: string) => `✓ ${name} · ${before} ← ${after}`,
    fileWait: "استنى لحد ما الملف يخلص رفع.",
    fileBad: "الملف ماوصلش، ارفعه تاني.",
    errors: { rate_limited: "بعت كذا مرة في وقت قصير. استنى شوية وجرّب تاني.", busy: "في ضغط دلوقتي. جرّب بعد دقيقة.", invalid: "في بيانات مش مظبوطة. راجعها وجرّب تاني.", network: "مقدرناش نوصل. اتأكد من النت وجرّب تاني.", closed: "الفورم ده اتقفل.", not_found: "الفورم ده مش موجود.", banned: NO_SHOW.ar.banned },
    sentTitle: "وصلتنا رسالتك ✅",
    sentBody: "بنقرا كل رسالة ونرد خلال أيام قليلة.",
    another: "ابعت رسالة تانية",
    topics: { general: "عام", partnership: "شراكة / رعاية", media: "إعلام", workshop: "طلب ورشة", other: "حاجة تانية" },
    tier: "الباقة اللي مهتمين بيها",
    tiers: { strategic: "شريك استراتيجي", gold: "راعي ذهبي", silver: "راعي فضي", technical: "شريك تقني (أجهزة / أدوات / مكان)", unsure: "لسه مش متأكدين" },
    site: "موقع الشركة",
    interest: "مهتمين بإيه؟",
    interests: ["مسابقة معيّنة", "ورش وتدريب", "إيفنت", "توظيف وتدريب صيفي", "حاجة تانية"],
    sponsorMsg: "احكيلنا عن الشركة وإزاي حابين تدعمونا",
    sponsorTitle: "طلب رعاية",
    sponsorSent: "شكراً لاهتمامكم 🤝 فريق الشراكات هيتواصل معاكم قريب.",
    deck: "حمّل ملف الرعاية (PDF)",
    wlTitle: "بلّغني أول ما التقديم يفتح",
    wlBody: "سيب رقمك أو إيميلك، وأول ما التقديم يفتح هنبعتلك.",
    wlSend: "بلّغني",
    wlDone: "تمام ✅ أول ما التقديم يفتح هتعرف.",
    wlDup: "إنت مسجّل قبل كده ✅ هنبلّغك أول ما يفتح.",
    closedTitle: "الفورم ده مقفول دلوقتي",
    opensAt: (d: string) => `هيفتح ${d}`,
    closesAt: (d: string) => `بيقفل ${d}`,
    formSent: "وصلنا ردك ✅ شكراً!",
    payFee: (n: string) => `رسوم: ${n} جنيه`,
    payHow: "إزاي تدفع",
    payPaid: (n: string) => `الرسوم (${n} جنيه) اتدفعت ✓`,
    payDue: (n: string) => `الرسوم (${n} جنيه) لسه متدفعتش`,
    payRef: "اكتب كود الطلب في رسالة التحويل عشان نعرف إنها منك.",
    formDup: "إنت بعت الفورم ده قبل كده ✅",
    loading: "بنحمّل الفورم…",
    yes: "أيوه",
    choose: "اختار…",
    back: "كل الفورمات",
    noForms: "مفيش فورمات مفتوحة دلوقتي. تابعنا عشان تعرف أول ما يفتح فورم جديد.",
    fill: "املأ الفورم",
    soon: "قريباً",
    applyTeam: "قدّم على الفريق",
    teamOpen: "التقديم على الفريق ده مفتوح دلوقتي!",
    refLabel: "كود الطلب",
    refHint: "احتفظ بالكود ده: بيه وبرقم موبايلك تتابع حالة طلبك.",
    checkStatus: "تابع حالة طلبك",
    stTitle: "حالة طلبك",
    stRef: "كود الطلب",
    stPhone: "أو رقم الموبايل اللي قدّمت بيه",
    stCheck: "اعرف حالتي",
    stChecking: "بندوّر…",
    stNotFound: "مش لاقيين طلب بالكود أو الرقم ده. الكود هو اللي ظهرلك بعد ما بعت الفورم وبيبدأ بـ F- (زي F-1A2B3C4D)، والرقم لازم يكون نفس اللي كتبته في الفورم.",
    stNeedOne: "اكتب كود الطلب أو رقم الموبايل.",
    stListNote: "علشان تشوف الـ QR وتفاصيل طلبك اكتب كود الطلب (بيبدأ بـ F-)، وده بيوصلك في رسالة الواتساب.",
    stJoinCode: "ده كود طلب انضمام (BX-…). تابعه من صفحة «تابع طلب الانضمام».",
    stRefHint: "اكتب كود الطلب أو رقم الموبايل، واحد منهم بس يكفي. الكود بيبدأ بـ F- وبيوصلك في رسالة الواتساب.",
    st: { new: "طلبك وصل وبيتراجع ⏳", waiting: "إنت على قايمة الانتظار ⏳ هنبلّغك لو مكان فضي.", accepted: "اتقبلت 🎉", rejected: "للأسف المرة دي مقدرناش نقبل طلبك. شكراً لاهتمامك 🙏" },
    stOpen: "افتح موقع التسجيل",
    stDone: "سجّلت في موقع المعرض",
    stDoneOk: "تمام ✅ الفريق عرف إنك سجّلت.",
    passTitle: "تصريح وفد BuildX HUE",
    passNo: "رقمك في الوفد",
    passDay: "يومك",
    passMeet: "التجمع",
    passShot: "خد سكرين شوت للتصريح وخليه معاك يوم الزيارة.",
    passReg: "✓ اتسجّلت في موقع المعرض، والبادج على إيميلك.",
    qrTitle: "الـ QR بتاعك للحضور",
    qrHint: "احفظ الصورة على موبايلك ووريها للفريق عند الدخول كل مرة.",
    qrSave: "احفظ الصورة",
    qrCopy: "انسخ لينك الـ QR",
    qrCopied: "اتنسخ ✅",
    qrSessions: "مواعيد الحضور",
    qrHere: "حضرت ✅",
    qrNot: "لسه",
    rateAsk: "إيه رأيك في السيشن؟",
    rateStar: (n: number) => `${n} من 5`,
    rateNote: "اكتب رأيك (اختياري): إيه اللي عجبك وإيه اللي نحسّنه؟",
    rateSend: "ابعت التقييم",
    rateThanks: "شكرًا، تقييمك وصل 💙",
    rateEdit: "عدّل",
    rateFail: "التقييم موصلش، جرّب تاني.",
    rateJump: "⭐ قيّم السيشن اللي حضرتها",
    qrNotFound: "مش لاقيين الـ QR ده. لو سجّلت، تابع طلبك بالكود ورقم موبايلك وهيظهرلك تاني.",
    badNid: "الرقم القومي ده مش مظبوط. راجع الـ14 رقم اللي على البطاقة.",
    friendPh: "رقم موبايله أو كود طلبه",
    friendHelp: "لو جاي مع صاحبك وهو سجّل قبلك، اكتب رقم موبايله أو كود طلبه (F-…).",
    friendFind: "دوّر",
    friendIs: (n: string) => `صاحبك ${n}؟`,
    friendYes: "أيوه، ده صاحبي",
    friendNo: "لأ، مش هو",
    friendOk: (n: string) => `هتيجي مع ${n}`,
    friendChange: "غيّر",
    friendNone: "مش لاقيين حد بالرقم أو الكود ده في الفورم ده. صاحبك لازم يكون سجّل الأول.",
    friendBusy: "جرّبت كتير، استنى شوية وجرّب تاني.",
    friendConfirm: "أكّد اسم صاحبك الأول، أو امسح الخانة.",
    badFriend: "صاحبك مش متسجّل في الفورم ده.",
    nidLeft: (n: number) => (n === 1 ? "فاضل رقم واحد" : n === 2 ? "فاضل رقمين" : `فاضل ${n} ${n <= 10 ? "أرقام" : "رقم"}`),
    nidOk: (born: string, gov: string) => `✓ مواليد ${born} · ${gov}`,
    more: "اقرا التفاصيل كلها",
    less: "اخفي التفاصيل",
    progress: (done: number, all: number) => `جاوبت ${done} من ${all} سؤال مطلوب`,
    left: (n: number) => (n === 1 ? "فاضل سؤال واحد مطلوب" : n === 2 ? "فاضل سؤالين مطلوبين" : `فاضل ${n} ${n <= 10 ? "أسئلة مطلوبة" : "سؤال مطلوب"}`),
    goFirst: "وديني عليه",
    allDone: "كله تمام ✓ تقدر تبعت",
    draft: "رجّعنالك اللي كتبته قبل كده على الموبايل ده.",
    draftClear: "ابدأ من الأول",
    questions: (n: number) => {
      const m = Math.max(1, Math.round(n / 3));
      return `${n} ${n >= 3 && n <= 10 ? "أسئلة" : "سؤال"} · ${m === 1 ? "حوالي دقيقة" : m === 2 ? "حوالي دقيقتين" : `حوالي ${m} ${m <= 10 ? "دقايق" : "دقيقة"}`}`;
    },
    pickForm: "اختار الفورم اللي عايز تملاه",
    otherForms: "فورمات مفتوحة دلوقتي",
    closedAt: (d: string) => `اتقفل ${d}`,
  },
  en: {
    name: "Name",
    email: "Email",
    phone: "Mobile / WhatsApp",
    org: "Organization / company",
    topic: "Topic",
    message: "Your message",
    optional: "Optional",
    send: "Send",
    sending: "Sending…",
    oneOf: "Add your email or your phone so we can reply.",
    required: "This field is required.",
    short: (n: number) => `Write at least ${n} characters.`,
    badEmail: "That email doesn't look right.",
    badPhone: "That number doesn't look right.",
    badUrl: "Use a full link starting with https://",
    badNumber: "Enter a number.",
    badDate: "Pick a date.",
    badOption: "Pick one of the options.",
    badMember: "That membership number doesn't exist or isn't active. Check the number on your BuildX card.",
    memberPh: "e.g. 2024001",
    notMember: "Not a community member?",
    askInterview: "Ask the organiser for an interview",
    tooLong: "That's too long.",
    fileChoose: "Choose a file",
    fileHint: "Photos and videos are compressed before they are sent.",
    fileWorking: "Preparing and compressing the file…",
    fileUp: "Uploading the file…",
    fileDone: (name: string, before: string, after: string) => `✓ ${name} · ${before} → ${after}`,
    fileWait: "Wait until the file has finished uploading.",
    fileBad: "The file didn't arrive, please upload it again.",
    errors: { rate_limited: "Too many tries in a short time. Wait a little and try again.", busy: "We're busy right now. Try again in a minute.", invalid: "Something isn't right. Check the form and try again.", network: "We couldn't connect. Check your connection and try again.", closed: "This form is closed.", not_found: "This form doesn't exist.", banned: NO_SHOW.en.banned },
    sentTitle: "Message received ✅",
    sentBody: "We read every message and reply within a few days.",
    another: "Send another message",
    topics: { general: "General", partnership: "Partnership / sponsorship", media: "Media", workshop: "Workshop request", other: "Other" },
    tier: "Package you're interested in",
    tiers: { strategic: "Strategic partner", gold: "Gold sponsor", silver: "Silver sponsor", technical: "Technical partner (equipment / tools / venue)", unsure: "Not sure yet" },
    site: "Company website",
    interest: "Interested in",
    interests: ["A specific competition", "Workshops & training", "An event", "Hiring & internships", "Something else"],
    sponsorMsg: "Tell us about the company and how you'd like to support us",
    sponsorTitle: "Sponsorship request",
    sponsorSent: "Thank you for your interest 🤝 Our partnerships team will be in touch soon.",
    deck: "Download the sponsorship deck (PDF)",
    wlTitle: "Tell me when applications open",
    wlBody: "Leave your phone or email and we'll tell you the moment applications open.",
    wlSend: "Notify me",
    wlDone: "Done ✅ You'll hear from us when applications open.",
    wlDup: "You're already on the list ✅",
    closedTitle: "This form is closed right now",
    opensAt: (d: string) => `Opens ${d}`,
    closesAt: (d: string) => `Closes ${d}`,
    formSent: "Got your answers ✅ Thank you!",
    payFee: (n: string) => `Fee: EGP ${n}`,
    payHow: "How to pay",
    payPaid: (n: string) => `Fee (EGP ${n}) paid ✓`,
    payDue: (n: string) => `Fee (EGP ${n}) not paid yet`,
    payRef: "Put your request code in the transfer message so we know it's you.",
    formDup: "You've already sent this form ✅",
    loading: "Loading the form…",
    yes: "Yes",
    choose: "Choose…",
    back: "All forms",
    noForms: "No forms are open right now. Follow us to hear when a new one opens.",
    fill: "Fill in",
    soon: "Soon",
    applyTeam: "Apply to the team",
    teamOpen: "Applications for this team are open now!",
    refLabel: "Reference code",
    refHint: "Keep this code: with it and your mobile number you can check your application.",
    checkStatus: "Check your application",
    stTitle: "Your application",
    stRef: "Reference code",
    stPhone: "Or the mobile number you applied with",
    stCheck: "Check",
    stChecking: "Checking…",
    stNotFound: "No application matches that code or number. The code was shown after you sent the form and starts with F- (like F-1A2B3C4D); the number must be the one you wrote in the form.",
    stNeedOne: "Type the application code or the mobile number.",
    stListNote: "To see your QR and the details, type the application code (it starts with F- and comes in the WhatsApp message).",
    stJoinCode: "That's a join-application code (BX-…). Check it on the «Track your join application» page.",
    stRefHint: "Type the application code or the mobile number; either one is enough. The code starts with F- and comes in the WhatsApp message.",
    st: { new: "Received and under review ⏳", waiting: "You're on the waiting list ⏳ We'll tell you if a place opens up.", accepted: "Accepted 🎉", rejected: "Sorry, we couldn't accept your application this time. Thank you for your interest 🙏" },
    stOpen: "Open the registration site",
    stDone: "I've registered on the expo site",
    stDoneOk: "Done ✅ The team knows you registered.",
    passTitle: "BuildX HUE delegation pass",
    passNo: "Delegation number",
    passDay: "Your day",
    passMeet: "Meeting point",
    passShot: "Take a screenshot of your pass and keep it with you on the day.",
    passReg: "✓ You're registered on the expo's site; your badge goes to your email.",
    qrTitle: "Your attendance QR",
    qrHint: "Save the picture on your phone and show it to the team at the door each time.",
    qrSave: "Save the picture",
    qrCopy: "Copy the QR link",
    qrCopied: "Copied ✅",
    qrSessions: "Sessions",
    qrHere: "Attended ✅",
    qrNot: "Not yet",
    rateAsk: "How was this session?",
    rateStar: (n: number) => `${n} out of 5`,
    rateNote: "Your thoughts (optional): what did you like, and what should we improve?",
    rateSend: "Send rating",
    rateThanks: "Thanks, your rating is in 💙",
    rateEdit: "Edit",
    rateFail: "Your rating didn't go through. Try again.",
    rateJump: "⭐ Rate the session you attended",
    qrNotFound: "We can't find this QR. If you registered, check your application with your code and mobile number and it shows again.",
    badNid: "That national ID doesn't look right. Check the 14 digits on your ID card.",
    friendPh: "Their mobile number or request code",
    friendHelp: "Coming with a friend who signed up before you? Type their mobile number or request code (F-…).",
    friendFind: "Find",
    friendIs: (n: string) => `Is your friend ${n}?`,
    friendYes: "Yes, that's my friend",
    friendNo: "No, not them",
    friendOk: (n: string) => `Coming with ${n}`,
    friendChange: "Change",
    friendNone: "No one with that number or code signed up to this form. Your friend needs to sign up first.",
    friendBusy: "Too many tries. Wait a bit and try again.",
    friendConfirm: "Confirm your friend's name first, or clear the box.",
    badFriend: "Your friend hasn't signed up to this form.",
    nidLeft: (n: number) => `${n} more digit${n === 1 ? "" : "s"}`,
    nidOk: (born: string, gov: string) => `✓ Born ${born} · ${gov}`,
    more: "Read all the details",
    less: "Hide the details",
    progress: (done: number, all: number) => `${done} of ${all} required questions answered`,
    left: (n: number) => (n === 1 ? "1 required question left" : `${n} required questions left`),
    goFirst: "Take me there",
    allDone: "All set ✓ You can send",
    draft: "We brought back what you typed earlier on this device.",
    draftClear: "Start over",
    questions: (n: number) => `${n} question${n === 1 ? "" : "s"} · about ${Math.max(1, Math.round(n / 3))} min`,
    pickForm: "Pick the form you want to fill in",
    otherForms: "Forms open right now",
    closedAt: (d: string) => `Closed ${d}`,
  },
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Milliseconds since the form appeared: the server ignores forms sent faster than a person types. */
function useElapsed() {
  const shown = useRef(0);
  useEffect(() => {
    shown.current = Date.now();
  }, []);
  return () => (shown.current ? Date.now() - shown.current : 0);
}
const PHONE = /^\+?[0-9]{7,16}$/;
const cleanPhone = (s: string) => asciiDigits(s).replace(/[^0-9+]/g, "");
const fmtWhen = (iso: string, l: Locale) => new Date(iso).toLocaleString(l === "ar" ? "ar-EG" : "en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Row({ id, label, optional, error, hint, children, className }: { id: string; label: string; optional?: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-3 text-[0.95rem] font-semibold text-frost">
        {label}
        {optional && <span className="text-xs font-normal text-fog">{optional}</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-fog">{hint}</p>
      ) : null}
    </div>
  );
}

const aria = (id: string, error?: string) => ({ id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-error` : undefined });

function Honeypot({ value }: { value: React.RefObject<HTMLInputElement | null> }) {
  return (
    <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input ref={value} type="text" name="bx_hp_note" tabIndex={-1} autoComplete="off" aria-hidden="true" data-lpignore="true" data-1p-ignore="true" defaultValue="" />
      </label>
    </div>
  );
}

function Done({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div ref={ref} tabIndex={-1} role="status" className="frame flex flex-col items-start gap-4 p-7 outline-none sm:p-10" style={{ ["--edge" as string]: 0.8 }}>
      <span className="flex size-14 items-center justify-center rounded-2xl border border-ok/40 bg-ok/10 text-ok">
        <Icon name="check" size={26} />
      </span>
      <p className="t-headline text-2xl text-chalk sm:text-3xl">{title}</p>
      {body && <p className="max-w-lg text-mist">{body}</p>}
      {children}
    </div>
  );
}

function Submit({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  return (
    <button type="submit" disabled={busy} className="btn btn-primary btn-lg w-full disabled:opacity-70 sm:w-auto">
      <span aria-hidden className="btn-sheen" />
      <span>{busy ? busyLabel : label}</span>
      {!busy && <Icon name="arrow" size={16} className="btn-arrow" />}
    </button>
  );
}

/* ─── Contact us / sponsorship request ─────────────────────────────────── */

export function MessageForm({ locale, kind = "contact", defaultTopic, deckUrl }: { locale: string; kind?: "contact" | "sponsor"; defaultTopic?: string; deckUrl?: string | null }) {
  const l = L(locale);
  const t = C[l];
  const honey = useRef<HTMLInputElement>(null);
  const sponsor = kind === "sponsor";
  const elapsed = useElapsed();
  const [d, setD] = useState({ name: "", email: "", phone: "", organization: "", topic: defaultTopic && defaultTopic in t.topics ? defaultTopic : "general", message: "", tier: "", site: "", interest: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof d, v: string) => {
    setD((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
  };
  const p = (k: string) => `${kind}-${k}`;

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (d.name.trim().length < 2) e.name = t.required;
    if (sponsor && d.organization.trim().length < 2) e.organization = t.required;
    if (d.email.trim() && !EMAIL.test(d.email.trim())) e.email = t.badEmail;
    if (d.phone.trim() && !PHONE.test(cleanPhone(d.phone))) e.phone = t.badPhone;
    if (!d.email.trim() && !d.phone.trim()) e.email = t.oneOf;
    if (d.site.trim() && !/^https?:\/\/\S+$/i.test(d.site.trim())) e.site = t.badUrl;
    if (d.message.trim().length < 10) e.message = d.message.trim() ? t.short(10) : t.required;
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) {
      document.getElementById(p(first))?.focus();
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const out = await rpc<{ ok: boolean; error?: keyof typeof t.errors }>("submit_message", {
        p: { ...d, phone: cleanPhone(d.phone), kind, locale: l, website: honey.current?.value ?? "", elapsed: elapsed() },
      });
      if (!out.ok) setFormError(t.errors[out.error ?? "invalid"] ?? t.errors.invalid);
      else setDone(true);
    } catch {
      setFormError(t.errors.network);
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <Done title={sponsor ? t.sponsorSent : t.sentTitle} body={sponsor ? undefined : t.sentBody}>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setD((x) => ({ ...x, message: "" }));
            setDone(false);
          }}
        >
          {t.another}
        </button>
      </Done>
    );

  return (
    <form onSubmit={submit} noValidate className="frame relative grid gap-5 p-5 sm:grid-cols-2 sm:p-8" aria-label={sponsor ? t.sponsorTitle : undefined}>
      <Honeypot value={honey} />
      <Row id={p("name")} label={t.name} error={errors.name}>
        <input {...aria(p("name"), errors.name)} className={inputCls} autoComplete="name" maxLength={120} value={d.name} onChange={(e) => set("name", e.target.value)} />
      </Row>
      <Row id={p("organization")} label={t.org} optional={sponsor ? undefined : t.optional} error={errors.organization}>
        <input {...aria(p("organization"), errors.organization)} className={inputCls} autoComplete="organization" maxLength={160} value={d.organization} onChange={(e) => set("organization", e.target.value)} />
      </Row>
      <Row id={p("email")} label={t.email} error={errors.email}>
        <input {...aria(p("email"), errors.email)} className={inputCls} type="email" inputMode="email" autoComplete="email" dir="ltr" maxLength={200} value={d.email} onChange={(e) => set("email", e.target.value)} />
      </Row>
      <Row id={p("phone")} label={t.phone} optional={t.optional} error={errors.phone}>
        <input {...aria(p("phone"), errors.phone)} className={inputCls} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="01xxxxxxxxx" maxLength={20} value={d.phone} onChange={(e) => set("phone", e.target.value)} />
      </Row>
      {sponsor ? (
        <>
          <Row id={p("tier")} label={t.tier} optional={t.optional}>
            <select {...aria(p("tier"))} className={cn(inputCls, "appearance-none")} value={d.tier} onChange={(e) => set("tier", e.target.value)}>
              <option value="">{t.choose}</option>
              {Object.entries(t.tiers).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Row>
          <Row id={p("interest")} label={t.interest} optional={t.optional}>
            <select {...aria(p("interest"))} className={cn(inputCls, "appearance-none")} value={d.interest} onChange={(e) => set("interest", e.target.value)}>
              <option value="">{t.choose}</option>
              {t.interests.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Row>
          <Row id={p("site")} label={t.site} optional={t.optional} error={errors.site} className="sm:col-span-2">
            <input {...aria(p("site"), errors.site)} className={inputCls} type="url" inputMode="url" dir="ltr" placeholder="https://" maxLength={300} value={d.site} onChange={(e) => set("site", e.target.value)} />
          </Row>
        </>
      ) : (
        <Row id={p("topic")} label={t.topic} className="sm:col-span-2">
          <select {...aria(p("topic"))} className={cn(inputCls, "appearance-none")} value={d.topic} onChange={(e) => set("topic", e.target.value)}>
            {Object.entries(t.topics).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Row>
      )}
      <Row id={p("message")} label={sponsor ? t.sponsorMsg : t.message} error={errors.message} className="sm:col-span-2">
        <textarea {...aria(p("message"), errors.message)} className={cn(inputCls, "h-auto min-h-36 py-3")} rows={6} maxLength={5000} value={d.message} onChange={(e) => set("message", e.target.value)} />
      </Row>
      {formError && (
        <p role="alert" className="text-sm text-danger sm:col-span-2">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Submit busy={busy} label={t.send} busyLabel={t.sending} />
        {sponsor && deckUrl && (
          <a href={deckUrl} target="_blank" rel="noopener noreferrer" className="btn btn-lg">
            <Icon name="arrowUpRight" size={16} />
            <span>{t.deck}</span>
          </a>
        )}
      </div>
    </form>
  );
}

/** The sponsorship deck link, from the site settings (set in the BuildX App). */
export function useSponsorDeck() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/site_settings?select=value&key=eq.sponsorship`, { headers: { apikey: SUPABASE_KEY } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { value?: { deck_url?: string } }[]) => {
        const u = rows[0]?.value?.deck_url;
        if (u && /^https:\/\//.test(u)) setUrl(u);
      })
      .catch(() => undefined);
  }, []);
  return url;
}

export function SponsorRequest({ locale }: { locale: string }) {
  const deck = useSponsorDeck();
  return <MessageForm locale={locale} kind="sponsor" deckUrl={deck} />;
}

/* ─── Waitlist ─────────────────────────────────────────────────────────── */

export function WaitlistForm({ locale }: { locale: string }) {
  const l = L(locale);
  const t = C[l];
  const honey = useRef<HTMLInputElement>(null);
  const [d, setD] = useState({ name: "", contact: "" });
  const elapsed = useElapsed();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"" | "ok" | "dup">("");

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const v = d.contact.trim();
    const email = EMAIL.test(v) ? v : "";
    const phone = !email && PHONE.test(cleanPhone(v)) ? cleanPhone(v) : "";
    if (!email && !phone) {
      setError(v ? (v.includes("@") ? t.badEmail : t.badPhone) : t.oneOf);
      document.getElementById("wl-contact")?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const out = await rpc<{ ok: boolean; duplicate?: boolean; error?: keyof typeof t.errors }>("join_waitlist", { p: { name: d.name, email, phone, locale: l, website: honey.current?.value ?? "", elapsed: elapsed() } });
      if (!out.ok) setError(t.errors[out.error ?? "invalid"] ?? t.errors.invalid);
      else setDone(out.duplicate ? "dup" : "ok");
    } catch {
      setError(t.errors.network);
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl border border-ok/30 bg-ok/10 px-4 py-3 text-chalk">
        <Icon name="check" size={18} className="text-ok" />
        {done === "dup" ? t.wlDup : t.wlDone}
      </p>
    );

  return (
    <form onSubmit={submit} noValidate className="relative flex w-full max-w-xl flex-col gap-3" aria-label={t.wlTitle}>
      <Honeypot value={honey} />
      <p className="font-semibold text-chalk">{t.wlTitle}</p>
      <p className="text-sm text-mist">{t.wlBody}</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1.3fr_auto]">
        <label className="sr-only" htmlFor="wl-name">
          {t.name}
        </label>
        <input id="wl-name" className={inputCls} placeholder={`${t.name} (${t.optional})`} autoComplete="name" maxLength={120} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        <label className="sr-only" htmlFor="wl-contact">
          {`${t.phone} / ${t.email}`}
        </label>
        <input id="wl-contact" {...{ "aria-invalid": error ? true : undefined }} className={inputCls} dir="ltr" placeholder={l === "ar" ? "01xxxxxxxxx أو الإيميل" : "Phone or email"} autoComplete="tel" maxLength={200} value={d.contact} onChange={(e) => setD({ ...d, contact: e.target.value })} />
        <button type="submit" disabled={busy} className="btn btn-primary h-11 disabled:opacity-70">
          <Icon name="signal" size={16} />
          <span>{busy ? t.sending : t.wlSend}</span>
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

/* ─── Forms built in the app ───────────────────────────────────────────── */

export type FieldType = "name" | "text" | "textarea" | "email" | "phone" | "number" | "url" | "date" | "select" | "multi" | "checkbox" | "member" | "file" | "nid" | "friend";
/** The form someone without a community membership sends to ask the organiser for an interview. */
export const INTERVIEW_FORM = "membership-interview";
export type FileAccept = "image" | "pdf" | "video" | "any";
export type FormField = { id: string; type: FieldType; label_ar: string; label_en?: string; help_ar?: string; help_en?: string; required?: boolean; options?: { ar: string; en?: string }[]; /** For a file question: what it takes. */ accept?: FileAccept; /** A file question for the payment receipt: the fee box shows above it. */ receipt?: boolean };
export type PublicForm = {
  slug: string;
  title_ar: string;
  title_en?: string | null;
  intro_ar?: string | null;
  intro_en?: string | null;
  success_ar?: string | null;
  success_en?: string | null;
  fields?: FormField[];
  team?: string | null;
  listed?: boolean;
  open: boolean;
  opens_at?: string | null;
  closes_at?: string | null;
  /** How many questions (the forms list). */
  questions?: number;
  background_path?: string | null;
  background_kind?: "image" | "video" | null;
  /** The fee and how to pay, when the form asks for one. */
  payment?: FormPayment | null;
};
type FormPayment = { amount: number | null; note_ar?: string | null; note_en?: string | null; paid?: boolean };
const payNote = (p: FormPayment, l: Locale) => (l === "en" ? p.note_en || p.note_ar : p.note_ar) ?? "";
const payAmount = (p: FormPayment) => Number(p.amount ?? 0).toLocaleString("en-US");

/** The fee box: how much and how to pay (on the form, after sending, and on the status page). */
function FeeBox({ payment, locale, showRef }: { payment: FormPayment; locale: Locale; showRef?: boolean }) {
  const t = C[locale];
  const note = payNote(payment, locale);
  const state = payment.paid === undefined ? null : payment.paid;
  return (
    <div data-testid="form-fee" className={cn("grid gap-1.5 rounded-2xl border p-4", state ? "border-ok/40 bg-ok/5" : "border-warn/40 bg-warn/5")}>
      <p className={cn("font-semibold", state ? "text-ok" : "text-warn")}>{state === null ? t.payFee(payAmount(payment)) : state ? t.payPaid(payAmount(payment)) : t.payDue(payAmount(payment))}</p>
      {!state && note && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-mist">
          <span className="font-semibold text-chalk">{t.payHow}: </span>
          {note}
        </p>
      )}
      {!state && showRef && <p className="text-xs text-fog">{t.payRef}</p>}
    </div>
  );
}

const titleOf = (f: PublicForm, l: Locale) => (l === "en" && f.title_en) || f.title_ar;
const introOf = (f: PublicForm, l: Locale) => (l === "en" ? f.intro_en || f.intro_ar : f.intro_ar) ?? "";
const labelOf = (x: FormField, l: Locale) => (l === "en" && x.label_en) || x.label_ar;
const helpOf = (x: FormField, l: Locale) => (l === "en" ? x.help_en || x.help_ar : x.help_ar) ?? "";

export function useOpenForms() {
  const [forms, setForms] = useState<PublicForm[] | null>(null);
  useEffect(() => {
    rpc<PublicForm[]>("public_forms", {})
      .then(setForms)
      .catch(() => setForms([]));
  }, []);
  return forms;
}

/** /forms: every form that's open (or opening soon), open ones first. `exclude` leaves one out (the form on screen). */
export function OpenForms({ locale, base, exclude }: { locale: string; base: string; exclude?: string }) {
  const l = L(locale);
  const t = C[l];
  const forms = useOpenForms();
  if (!forms) return <div className="h-40 animate-pulse rounded-[20px] bg-panel/60" aria-busy="true" />;
  const shown = forms.filter((f) => f.listed !== false && f.slug !== exclude && (f.open || (f.opens_at && new Date(f.opens_at) > new Date())));
  if (!shown.length) return <p className="rounded-[18px] border border-[var(--line-2)] bg-panel/50 p-6 text-center text-mist">{t.noForms}</p>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {shown.map((f) => (
        <li key={f.slug} className="frame flex flex-col gap-3 p-6">
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className={cn("rounded-full px-2.5 py-0.5", f.open ? "bg-ok/15 text-ok" : "bg-warn/15 text-warn")}>{f.open ? (l === "ar" ? "مفتوح" : "Open") : t.soon}</span>
            {f.open && f.closes_at && <span className="text-fog">{t.closesAt(fmtWhen(f.closes_at, l))}</span>}
            {!f.open && f.opens_at && <span className="text-fog">{t.opensAt(fmtWhen(f.opens_at, l))}</span>}
          </p>
          <h2 className="t-title text-xl text-chalk">{titleOf(f, l)}</h2>
          {introOf(f, l) && <p className="line-clamp-3 text-sm leading-relaxed text-mist">{introOf(f, l)}</p>}
          {!!f.questions && <p className="text-xs text-fog">{t.questions(f.questions)}</p>}
          {f.open && (
            <Link href={`${base.replace(/\/?$/, "/")}?f=${encodeURIComponent(f.slug)}`} className="btn btn-primary btn-sm mt-auto w-fit">
              <span>{t.fill}</span>
              <Icon name="arrow" size={14} className="btn-arrow" />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A competition team's page: "Apply to the team" while its tryout form is open. */
export function TeamFormCta({ locale, team, base }: { locale: string; team: string; base: string }) {
  const l = L(locale);
  const t = C[l];
  const forms = useOpenForms();
  const f = forms?.find((x) => x.team === team && x.open);
  if (!f) return null;
  return (
    <div className="frame flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between" style={{ ["--edge" as string]: 0.8 }}>
      <div>
        <p className="font-semibold text-chalk">{t.teamOpen}</p>
        <p className="text-sm text-mist">
          {titleOf(f, l)}
          {f.closes_at ? ` · ${t.closesAt(fmtWhen(f.closes_at, l))}` : ""}
        </p>
      </div>
      <Link href={`${base.replace(/\/?$/, "/")}?f=${encodeURIComponent(f.slug)}`} className="btn btn-primary">
        <span aria-hidden className="btn-sheen" />
        <span>{t.applyTeam}</span>
        <Icon name="arrow" size={15} className="btn-arrow" />
      </Link>
    </div>
  );
}

const FILE_KINDS: Record<FileAccept, MediaKind[]> = { image: ["image"], pdf: ["pdf"], video: ["video"], any: ["image", "pdf", "video"] };
const FILE_ATTR: Record<FileAccept, string> = { image: "image/*", pdf: "application/pdf", video: "video/*", any: "image/*,video/*,application/pdf" };
type FileState = { name: string; status: "prep" | "up" | "done" | "error"; progress: number; before?: number; after?: number; error?: string };
const sizeText = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** One file straight into the form's private bucket, to the exact path a ticket named. */
function uploadForm(path: string, file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/form-files/${path.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("apikey", SUPABASE_KEY);
    xhr.setRequestHeader("Authorization", `Bearer ${SUPABASE_KEY}`);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

/** The form's own background (a picture or a looping video) behind the questions, dimmed so they stay readable. */
function FormStage({ form, children }: { form: PublicForm; children: ReactNode }) {
  const [still, setStill] = useState(false);
  useEffect(() => setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  if (!form.background_path) return <>{children}</>;
  const src = `${SUPABASE_URL}/storage/v1/object/public/form-media/${form.background_path.split("/").map(encodeURIComponent).join("/")}`;
  return (
    <div className="relative isolate overflow-clip rounded-[28px] p-4 sm:p-8" data-testid="form-stage">
      {form.background_kind === "video" ? (
        <video src={src} autoPlay={!still} muted loop playsInline preload={still ? "metadata" : "auto"} aria-hidden className="absolute inset-0 -z-20 size-full object-cover" />
      ) : (
        <img src={src} alt="" aria-hidden className="absolute inset-0 -z-20 size-full object-cover" />
      )}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-[#060b18]/80 via-[#060b18]/70 to-[#060b18]/90" />
      {children}
    </div>
  );
}

const URL_RE = /(https?:\/\/[^\s]+)/g;
/** Links in a form's intro are clickable (and long ones don't stretch the page). */
function Linked({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) =>
        i % 2 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" dir="ltr" className="break-all font-semibold text-cyan underline-offset-4 hover:underline">
            {part.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** A long intro shows its first lines and opens on tap, so the questions start near the top on a phone. */
function Intro({ text, l }: { text: string; l: Locale }) {
  const t = C[l];
  const long = text.length > 320 || text.split("\n").length > 7;
  const [open, setOpen] = useState(false);
  return (
    <div className="grid max-w-2xl gap-2">
      <p className={cn("whitespace-pre-line text-lg leading-relaxed text-mist [overflow-wrap:anywhere]", long && !open && "line-clamp-6")} data-testid="form-intro">
        <Linked text={text} />
      </p>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-fit text-sm font-semibold text-cyan underline-offset-4 hover:underline">
          {open ? t.less : t.more}
        </button>
      )}
    </div>
  );
}

type FriendHit = { ref: string; name: string };

/**
 * "Coming with a friend": type their mobile or request code, see their name, confirm. The answer is
 * their request code (the server checks they're in the same form). Typing without confirming is
 * reported as pending, so the form asks to confirm before sending.
 */
function FriendField({ id, slug, locale, error, value, onChange, onPending }: { id: string; slug: string; locale: Locale; error?: string; value: string; onChange: (ref: string) => void; onPending: (p: boolean) => void }) {
  const t = C[locale];
  const [q, setQ] = useState("");
  const [state, setState] = useState<"idle" | "look" | "hit" | "none" | "busy">("idle");
  const [hit, setHit] = useState<FriendHit | null>(null);
  const [chosen, setChosen] = useState<FriendHit | null>(null);
  const seq = useRef(0);
  const ready = (v: string) => {
    const d = asciiDigits(v).replace(/\s/g, "");
    return /^(\+?2)?01\d{9}$/.test(d) || /^F-?[0-9A-F]{8}$/i.test(d);
  };
  const find = async (v = q) => {
    if (asciiDigits(v).trim().length < 4) return;
    const n = ++seq.current;
    setState("look");
    try {
      const out = await rpc<{ ok: boolean; found?: boolean; ref?: string; name?: string; error?: string }>("form_friend", { p_slug: slug, p_query: asciiDigits(v.trim()) });
      if (n !== seq.current) return;
      if (out.ok && out.found && out.ref) {
        setHit({ ref: out.ref, name: out.name || out.ref });
        setState("hit");
      } else setState(out.error === "rate_limited" ? "busy" : "none");
    } catch {
      if (n === seq.current) setState("none");
    }
  };
  // A restored or changed answer without a confirmed name starts over.
  useEffect(() => {
    if (!value && chosen) setChosen(null);
  }, [value, chosen]);
  useEffect(() => onPending(!chosen && q.trim() !== ""), [q, chosen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (chosen && value)
    return (
      <div className="flex items-center gap-3 rounded-xl border border-ok/40 bg-ok/10 px-4 py-3" data-testid={`friend-ok-${id}`}>
        <Icon name="check" className="size-5 shrink-0 text-ok" />
        <p className="min-w-0 flex-1 font-semibold text-chalk">{t.friendOk(chosen.name)}</p>
        <button
          type="button"
          className="text-sm font-semibold text-cyan underline-offset-4 hover:underline"
          onClick={() => {
            setChosen(null);
            setHit(null);
            setState("idle");
            setQ("");
            onChange("");
          }}
        >
          {t.friendChange}
        </button>
      </div>
    );
  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <input
          {...aria(id, error)}
          className={cn(inputCls, "min-w-0 flex-1")}
          maxLength={40}
          value={q}
          dir="ltr"
          autoComplete="off"
          inputMode="text"
          placeholder={t.friendPh}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            setHit(null);
            setState("idle");
            if (ready(v)) void find(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void find();
            }
          }}
        />
        <button type="button" className="btn btn-sm shrink-0" disabled={state === "look" || asciiDigits(q).trim().length < 4} onClick={() => void find()} data-testid={`friend-find-${id}`}>
          {state === "look" ? "…" : t.friendFind}
        </button>
      </div>
      {state === "hit" && hit && (
        <div className="grid gap-3 rounded-xl border border-cyan/40 bg-volt/10 p-4" role="status" data-testid={`friend-hit-${id}`}>
          <p className="text-lg font-bold text-chalk">{t.friendIs(hit.name)}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                setChosen(hit);
                onChange(hit.ref);
              }}
            >
              {t.friendYes}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setHit(null);
                setState("idle");
                setQ("");
              }}
            >
              {t.friendNo}
            </button>
          </div>
        </div>
      )}
      {(state === "none" || state === "busy") && (
        <p className="text-sm text-warn" role="status">
          {state === "busy" ? t.friendBusy : t.friendNone}
        </p>
      )}
    </div>
  );
}

const draftKey = (slug: string) => `bx-form-draft:${slug}`;
type Answers = Record<string, string | string[] | boolean>;
/** Short single-choice questions show as buttons (one tap) instead of a dropdown. */
const asChips = (x: FormField) => (x.options?.length ?? 0) > 0 && (x.options?.length ?? 0) <= 8 && (x.options ?? []).every((o) => o.ar.length <= 28);
const answered = (x: FormField, v: Answers[string] | undefined) =>
  x.type === "multi" ? Array.isArray(v) && v.length > 0 : x.type === "checkbox" ? v === true : x.type === "nid" ? typeof v === "string" && !!readNationalId(v) : typeof v === "string" && v.trim() !== "";

/** /form?f=<slug>: fill in one form (or a fixed form embedded in a page, with a status link). */
export function FormFiller({ locale, listHref, slug: fixed, statusHref }: { locale: string; listHref: string; slug?: string; statusHref?: string }) {
  const l = L(locale);
  const t = C[l];
  const honey = useRef<HTMLInputElement>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [form, setForm] = useState<PublicForm | null | undefined>(undefined);
  const [a, setA] = useState<Answers>({});
  const [restored, setRestored] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"" | "ok" | "dup">("");
  const [ref, setRef] = useState("");
  const [pass, setPass] = useState("");
  const [viewPass, setViewPass] = useState("");
  const [warned, setWarned] = useState(false);
  /** Friend questions with something typed but no friend confirmed yet. */
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [fs, setFs] = useState<Record<string, FileState>>({});
  const elapsed = useElapsed();

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const token = fixed ? "" : (q.get("pass") ?? "").trim();
    if (/^[0-9a-fA-F]{16}$/.test(token)) return setViewPass(token);
    const s = fixed ?? q.get("f") ?? "";
    setSlug(s);
    if (!s) return setForm(null);
    rpc<PublicForm | null>("public_form", { p_slug: s })
      .then((f) => {
        setForm(f ?? null);
        if (!f?.open) return;
        // Answers typed earlier on this device.
        try {
          const saved = JSON.parse(localStorage.getItem(draftKey(s)) ?? "null") as Answers | null;
          const ids = new Set((f.fields ?? []).filter((x) => x.type !== "file" && x.type !== "nid" && x.type !== "friend").map((x) => x.id));
          const keep = saved ? Object.fromEntries(Object.entries(saved).filter(([k]) => ids.has(k))) : {};
          if (Object.values(keep).some((v) => (Array.isArray(v) ? v.length : v))) {
            setA(keep);
            setRestored(true);
          }
        } catch {
          /* no storage: start empty */
        }
      })
      .catch(() => setForm(null));
  }, [fixed]);

  // Keep what's typed on this device until it's sent (closing the tab by mistake loses nothing).
  useEffect(() => {
    if (!slug || !form?.open || done) return;
    const id = window.setTimeout(() => {
      try {
        // Not files (they upload again), national IDs (they stay off the device, like the family form) or a friend (looked up again).
        const files = new Set((form.fields ?? []).filter((x) => x.type === "file" || x.type === "nid" || x.type === "friend").map((x) => x.id));
        const keep = Object.fromEntries(Object.entries(a).filter(([k]) => !files.has(k)));
        if (Object.keys(keep).length) localStorage.setItem(draftKey(slug), JSON.stringify(keep));
      } catch {
        /* storage full or blocked */
      }
    }, 400);
    return () => window.clearTimeout(id);
  }, [a, slug, form, done]);

  if (viewPass) return <AttendPass token={viewPass} locale={l} page />;
  const formsBase = listHref.replace(/\/forms\/?$/, "/form/");
  if (form === undefined) return <p className="text-mist">{t.loading}</p>;
  // A form placed inside a page (the page has its own heading): just a short note.
  if (fixed && !form)
    return (
      <div className="frame flex flex-col items-start gap-4 p-8">
        <p className="t-headline text-2xl text-chalk">{t.errors.not_found}</p>
        <Link href={listHref} className="btn btn-sm">
          {t.back}
        </Link>
      </div>
    );
  if (!form || !slug)
    return (
      <div className="grid gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="t-headline text-3xl text-chalk sm:text-4xl">{slug ? t.errors.not_found : t.pickForm}</h1>
          {slug && <p className="text-mist">{t.pickForm}</p>}
        </header>
        <OpenForms locale={l} base={formsBase} />
      </div>
    );

  const fields = form.fields ?? [];
  const head = (
    <header className="mb-8 flex flex-col gap-3">
      <h1 className="t-headline text-3xl text-chalk [overflow-wrap:anywhere] sm:text-4xl">{titleOf(form, l).trim()}</h1>
      {introOf(form, l) && <Intro text={introOf(form, l).trim()} l={l} />}
      {form.open && form.closes_at && <p className="text-sm font-semibold text-warn">{t.closesAt(fmtWhen(form.closes_at, l))}</p>}
      {form.payment && !(form.fields ?? []).some((x) => x.receipt) && <FeeBox payment={form.payment} locale={l} />}
    </header>
  );

  if (!form.open)
    return (
      <FormStage form={form}>
        {head}
        <div role="status" className="frame flex flex-col items-start gap-3 p-8">
          <span className="flex size-12 items-center justify-center rounded-2xl border border-warn/40 bg-warn/10 text-warn">
            <Icon name="clock" size={22} />
          </span>
          <p className="t-headline text-2xl text-chalk">{t.closedTitle}</p>
          {form.opens_at && new Date(form.opens_at) > new Date() ? (
            <p className="text-mist">{t.opensAt(fmtWhen(form.opens_at, l))}</p>
          ) : (
            form.closes_at && new Date(form.closes_at) < new Date() && <p className="text-mist">{t.closedAt(fmtWhen(form.closes_at, l))}</p>
          )}
        </div>
        {!fixed && (
          <section className="mt-10 grid gap-4" data-testid="other-forms">
            <h2 className="t-title text-xl text-chalk">{t.otherForms}</h2>
            <OpenForms locale={l} base={formsBase} exclude={slug} />
          </section>
        )}
      </FormStage>
    );

  if (done)
    return (
      <Done title={done === "dup" ? t.formDup : (l === "en" ? form.success_en || form.success_ar : form.success_ar) || t.formSent}>
        {ref && (
          <div className="grid gap-1">
            <p className="text-sm text-fog">{t.refLabel}</p>
            <p dir="ltr" className="font-mono text-2xl font-bold tracking-wider text-chalk" data-testid="form-ref">
              {ref}
            </p>
            <p className="max-w-lg text-sm text-mist">{t.refHint}</p>
          </div>
        )}
        {warned && (
          <p role="alert" className="max-w-lg rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-[#ffd08a]" data-testid="no-show-warned">
            {NO_SHOW[l].warned}
          </p>
        )}
        {form.payment && done !== "dup" && <FeeBox payment={form.payment} locale={l} showRef={!!ref} />}
        {pass && <AttendPass token={pass} locale={l} />}
        {ref && statusHref && (
          <a href={`${statusHref}${statusHref.includes("?") ? "&" : "?"}${fixed ? "" : `f=${encodeURIComponent(slug)}&`}ref=${encodeURIComponent(ref)}#status`} className="btn btn-sm">
            {t.checkStatus}
          </a>
        )}
      </Done>
    );

  const set = (id: string, v: string | string[] | boolean) => {
    setA((x) => ({ ...x, [id]: v }));
    if (errors[id]) setErrors((e) => ({ ...e, [id]: "" }));
  };
  const setFile = (id: string, st: FileState | null) => setFs((m) => (st ? { ...m, [id]: st } : Object.fromEntries(Object.entries(m).filter(([k]) => k !== id))));
  const pickFile = async (x: FormField, file: File | undefined) => {
    if (!file) return;
    const base = { name: file.name, progress: 0 };
    setA((v) => ({ ...v, [x.id]: "" }));
    setErrors((e) => ({ ...e, [x.id]: "" }));
    setFile(x.id, { ...base, status: "prep" });
    try {
      const p = await prepareMedia(file, { accept: FILE_KINDS[x.accept ?? "image"], profile: "attachment", onProgress: (v) => setFile(x.id, { ...base, status: "prep", progress: v }) });
      setFile(x.id, { ...base, status: "up", progress: 0 });
      const tk = await rpc<{ ok: boolean; path?: string; error?: string }>("form_upload_ticket", { p_slug: slug, p_field: x.id, p_mime: p.file.type, p_size: p.file.size });
      if (!tk.ok || !tk.path) throw new Error(tk.error ?? "invalid");
      await uploadForm(tk.path, p.file, (v) => setFile(x.id, { ...base, status: "up", progress: v }));
      setA((v) => ({ ...v, [x.id]: tk.path! }));
      setFile(x.id, { ...base, status: "done", progress: 1, before: p.before, after: p.after });
    } catch (e) {
      setFile(x.id, { ...base, status: "error", progress: 0, error: e instanceof MediaError ? mediaErrorText(e, l) : t.fileBad });
    }
  };
  const reason: Record<string, string> = { file: t.fileBad, required: t.required, email: t.badEmail, phone: t.badPhone, number: t.badNumber, url: t.badUrl, date: t.badDate, option: t.badOption, too_long: t.tooLong, member: t.badMember, nid: t.badNid, friend: t.badFriend };
  const needed = fields.filter((x) => x.required);
  const missing = needed.filter((x) => !answered(x, a[x.id]));
  const unconfirmed = fields.some((x) => x.type === "friend" && pending[x.id]);
  const goTo = (id: string) => {
    const el = document.getElementById(`ff-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  };

  const check = () => {
    const e: Record<string, string> = {};
    for (const x of fields) {
      const v = a[x.id];
      const s = typeof v === "string" ? v.trim() : "";
      if (x.type === "friend" && pending[x.id]) {
        e[x.id] = t.friendConfirm;
        continue;
      }
      if (x.type === "file" && (fs[x.id]?.status === "prep" || fs[x.id]?.status === "up")) {
        e[x.id] = t.fileWait;
        continue;
      }
      const empty = x.type === "multi" ? !(Array.isArray(v) && v.length) : x.type === "checkbox" ? v !== true : !s;
      if (empty) {
        if (x.required) e[x.id] = t.required;
        continue;
      }
      if (x.type === "email" && !EMAIL.test(s)) e[x.id] = t.badEmail;
      if (x.type === "phone" && !PHONE.test(cleanPhone(s))) e[x.id] = t.badPhone;
      if (x.type === "url" && !/^https?:\/\/\S+$/i.test(s)) e[x.id] = t.badUrl;
      if (x.type === "number" && !/^-?\d+(\.\d+)?$/.test(asciiDigits(s))) e[x.id] = t.badNumber;
      if (x.type === "nid" && !readNationalId(s)) e[x.id] = t.badNid;
    }
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = check();
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) {
      goTo(first);
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      // Numbers typed in Arabic digits go as 0-9, the way the server reads them.
      const digits = new Set(fields.filter((x) => x.type === "phone" || x.type === "number" || x.type === "nid").map((x) => x.id));
      const answers = { ...Object.fromEntries(Object.entries(a).map(([k, v]) => [k, typeof v === "string" ? (digits.has(k) ? asciiDigits(v.trim()) : v.trim()) : v])), __t: elapsed() };
      const out = await rpc<{ ok: boolean; duplicate?: boolean; ref?: string; pass?: string; warned?: boolean; error?: string; fields?: Record<string, string> }>("submit_form", { p_slug: slug, p_answers: answers, p_locale: l, p_website: honey.current?.value ?? "" });
      if (out.ok) {
        try {
          localStorage.removeItem(draftKey(slug));
        } catch {
          /* nothing saved */
        }
        setRef(out.ref ?? "");
        setPass(out.pass ?? "");
        setWarned(!!out.warned);
        setDone(out.duplicate ? "dup" : "ok");
      }
      else if (out.error === "fields" && out.fields) {
        const fe = Object.fromEntries(Object.entries(out.fields).map(([k, r]) => [k, reason[r] ?? t.errors.invalid]));
        setErrors(fe);
        goTo(Object.keys(fe)[0]);
      } else if (out.error === "closed") setForm({ ...form, open: false });
      else setFormError(t.errors[(out.error as keyof typeof t.errors) ?? "invalid"] ?? t.errors.invalid);
    } catch {
      setFormError(t.errors.network);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormStage form={form}>
      {head}
      <form onSubmit={submit} noValidate className="frame relative grid gap-6 p-5 sm:p-8">
        <Honeypot value={honey} />
        {restored && (
          <p role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan/30 bg-cyan/5 px-4 py-3 text-sm text-frost" data-testid="form-draft">
            {t.draft}
            <button
              type="button"
              className="font-semibold text-cyan underline-offset-4 hover:underline"
              onClick={() => {
                setA({});
                setErrors({});
                setRestored(false);
                try {
                  localStorage.removeItem(draftKey(slug));
                } catch {
                  /* nothing saved */
                }
              }}
            >
              {t.draftClear}
            </button>
          </p>
        )}
        {needed.length > 2 && (
          <div className="sticky top-0 z-20 -mx-5 -mt-5 rounded-t-[inherit] border-b border-[var(--line)] bg-[rgb(6_11_24/0.88)] px-5 py-3 backdrop-blur-xl sm:-mx-8 sm:-mt-8 sm:px-8" data-testid="form-progress">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-frost">{t.progress(needed.length - missing.length, needed.length)}</span>
              <span className="font-mono text-fog" dir="ltr">
                {Math.round(((needed.length - missing.length) / needed.length) * 100)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={needed.length} aria-valuenow={needed.length - missing.length} aria-label={t.progress(needed.length - missing.length, needed.length)}>
              <div className="h-full rounded-full bg-gradient-to-r from-volt to-cyan transition-[width] duration-500" style={{ width: `${((needed.length - missing.length) / needed.length) * 100}%` }} />
            </div>
          </div>
        )}
        {fields.map((x) => {
          const id = `ff-${x.id}`;
          const err = errors[x.id];
          const label = labelOf(x, l);
          const opt = x.required ? undefined : t.optional;
          const v = a[x.id];
          if (x.type === "checkbox")
            return (
              <div key={x.id} className="flex flex-col gap-1.5">
                <label className="flex items-start gap-3 text-[0.95rem] text-frost">
                  <input {...aria(id, err)} type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[#2b6dff]" checked={v === true} onChange={(e) => set(x.id, e.target.checked)} />
                  <span>{label}</span>
                </label>
                {err && (
                  <p id={`${id}-error`} role="alert" className="text-sm text-danger">
                    {err}
                  </p>
                )}
              </div>
            );
          if (x.type === "multi") {
            const list = Array.isArray(v) ? v : [];
            return (
              <fieldset key={x.id} className="flex flex-col gap-2.5" aria-describedby={err ? `${id}-error` : undefined}>
                <legend className="mb-1 flex w-full items-baseline justify-between gap-3 text-[0.95rem] font-semibold text-frost">
                  {label}
                  {opt && <span className="text-xs font-normal text-fog">{opt}</span>}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {(x.options ?? []).map((o, i) => {
                    const on = list.includes(o.ar);
                    return (
                      <button
                        key={o.ar}
                        id={i === 0 ? id : undefined}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set(x.id, on ? list.filter((y) => y !== o.ar) : [...list, o.ar])}
                        className={cn("rounded-full border px-3.5 py-1.5 text-sm transition-colors", on ? "border-cyan/70 bg-volt/25 text-chalk" : "border-[var(--line-2)] text-mist hover:border-volt/50")}
                      >
                        {(l === "en" && o.en) || o.ar}
                      </button>
                    );
                  })}
                </div>
                {err ? (
                  <p id={`${id}-error`} role="alert" className="text-sm text-danger">
                    {err}
                  </p>
                ) : (
                  helpOf(x, l) && <p className="text-sm text-fog">{helpOf(x, l)}</p>
                )}
              </fieldset>
            );
          }
          if (x.type === "file") {
            const st = fs[x.id];
            const pct = Math.round((st?.progress ?? 0) * 100);
            return (
              <Row key={x.id} id={id} label={label} optional={opt} error={err} hint={helpOf(x, l) || t.fileHint}>
                {x.receipt && form.payment && (
                  <div className="mb-3">
                    <FeeBox payment={form.payment} locale={l} />
                  </div>
                )}
                <input
                  {...aria(id, err)}
                  type="file"
                  accept={FILE_ATTR[x.accept ?? "image"]}
                  className={cn(inputCls, "h-auto cursor-pointer py-3 file:me-3 file:rounded-lg file:border-0 file:bg-volt/25 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-chalk")}
                  data-testid={`file-${x.id}`}
                  onChange={(e) => {
                    void pickFile(x, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                {st && (
                  <p role="status" className={cn("mt-2 text-sm", st.status === "error" ? "text-danger" : st.status === "done" ? "text-ok" : "text-mist")} data-testid={`file-status-${x.id}`}>
                    {st.status === "prep" ? `${t.fileWorking} ${pct}%` : st.status === "up" ? `${t.fileUp} ${pct}%` : st.status === "done" ? t.fileDone(st.name, sizeText(st.before ?? 0), sizeText(st.after ?? 0)) : st.error}
                  </p>
                )}
              </Row>
            );
          }
          const s = typeof v === "string" ? v : "";
          if (x.type === "select" && asChips(x))
            return (
              <fieldset key={x.id} className="flex flex-col gap-2.5" aria-describedby={err ? `${id}-error` : undefined}>
                <legend className="mb-1 flex w-full items-baseline justify-between gap-3 text-[0.95rem] font-semibold text-frost">
                  {label}
                  {opt && <span className="text-xs font-normal text-fog">{opt}</span>}
                </legend>
                <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
                  {(x.options ?? []).map((o, i) => {
                    const on = s === o.ar;
                    return (
                      <button
                        key={o.ar}
                        id={i === 0 ? id : undefined}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => set(x.id, on && !x.required ? "" : o.ar)}
                        className={cn("min-h-11 rounded-xl border px-4 py-2 text-sm transition-colors", on ? "border-cyan/70 bg-volt/25 font-semibold text-chalk" : "border-[var(--line-2)] text-mist hover:border-volt/50")}
                      >
                        {(l === "en" && o.en) || o.ar}
                      </button>
                    );
                  })}
                </div>
                {err ? (
                  <p id={`${id}-error`} role="alert" className="text-sm text-danger">
                    {err}
                  </p>
                ) : (
                  helpOf(x, l) && <p className="text-sm text-fog">{helpOf(x, l)}</p>
                )}
              </fieldset>
            );
          if (x.type === "nid") {
            const d = asciiDigits(s).replace(/\D/g, "");
            const read = d.length === 14 ? readNationalId(d) : null;
            const gov = read ? (l === "ar" ? read.governorate.ar : read.governorate.en) : "";
            const hint = read ? (
              <span className="text-ok" data-testid={`nid-ok-${x.id}`}>
                {t.nidOk(read.birth.toLocaleDateString(l === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }), gov)}
              </span>
            ) : d.length > 0 && d.length < 14 ? (
              t.nidLeft(14 - d.length)
            ) : (
              helpOf(x, l)
            );
            return (
              <Row key={x.id} id={id} label={label} optional={opt} error={err || (d.length >= 14 && !read ? t.badNid : undefined)} hint={hint}>
                <input
                  {...aria(id, err)}
                  className={cn(inputCls, "font-mono tracking-wider")}
                  maxLength={20}
                  value={s}
                  onChange={(e) => set(x.id, e.target.value)}
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="30xxxxxxxxxxxx"
                />
              </Row>
            );
          }
          if (x.type === "friend")
            return (
              <Row key={x.id} id={id} label={label} optional={opt} error={err} hint={helpOf(x, l) || t.friendHelp}>
                <FriendField
                  id={id}
                  slug={slug}
                  locale={l}
                  error={err}
                  value={s}
                  onChange={(ref) => set(x.id, ref)}
                  onPending={(p) => {
                    setPending((m) => (!!m[x.id] === p ? m : { ...m, [x.id]: p }));
                    if (!p && errors[x.id] === t.friendConfirm) setErrors((e) => ({ ...e, [x.id]: "" }));
                  }}
                />
              </Row>
            );
          if (x.type === "member")
            return (
              <div key={x.id} className="grid gap-2">
                <Row id={id} label={label} optional={opt} error={err} hint={helpOf(x, l)}>
                  <input {...aria(id, err)} className={inputCls} maxLength={40} value={s} onChange={(e) => set(x.id, e.target.value)} dir="ltr" inputMode="text" autoComplete="off" placeholder={t.memberPh} />
                </Row>
                {slug !== INTERVIEW_FORM && (
                  <p className="text-sm text-mist" data-testid="ask-interview">
                    {t.notMember}{" "}
                    <a href={`${listHref.replace(/\/forms\/?$/, "")}/form/?f=${INTERVIEW_FORM}`} className="font-semibold text-cyan underline-offset-4 hover:underline">
                      {t.askInterview}
                    </a>
                  </p>
                )}
              </div>
            );
          return (
            <Row key={x.id} id={id} label={label} optional={opt} error={err} hint={helpOf(x, l)}>
              {x.type === "textarea" ? (
                <textarea {...aria(id, err)} className={cn(inputCls, "h-auto min-h-32 py-3")} rows={5} maxLength={4000} value={s} onChange={(e) => set(x.id, e.target.value)} />
              ) : x.type === "select" ? (
                <select {...aria(id, err)} className={cn(inputCls, "appearance-none")} value={s} onChange={(e) => set(x.id, e.target.value)}>
                  <option value="">{t.choose}</option>
                  {(x.options ?? []).map((o) => (
                    <option key={o.ar} value={o.ar}>
                      {(l === "en" && o.en) || o.ar}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  {...aria(id, err)}
                  className={inputCls}
                  maxLength={500}
                  value={s}
                  onChange={(e) => set(x.id, e.target.value)}
                  type={x.type === "email" ? "email" : x.type === "phone" ? "tel" : x.type === "url" ? "url" : x.type === "date" ? "date" : "text"}
                  inputMode={x.type === "number" ? "decimal" : x.type === "phone" ? "tel" : x.type === "email" ? "email" : x.type === "url" ? "url" : undefined}
                  autoComplete={x.type === "name" ? "name" : x.type === "email" ? "email" : x.type === "phone" ? "tel" : "off"}
                  dir={["email", "phone", "url", "number"].includes(x.type) ? "ltr" : undefined}
                  placeholder={x.type === "phone" ? "01xxxxxxxxx" : x.type === "url" ? "https://" : undefined}
                />
              )}
            </Row>
          );
        })}
        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}
        <div className="grid gap-3">
          {needed.length > 0 && (
            <p className={cn("text-sm", missing.length || unconfirmed ? "text-warn" : "text-ok")} data-testid="form-left">
              {missing.length ? t.left(missing.length) : unconfirmed ? t.friendConfirm : t.allDone}
              {missing.length > 0 && (
                <button type="button" onClick={() => goTo(missing[0].id)} className="ms-2 font-semibold text-cyan underline-offset-4 hover:underline">
                  {t.goFirst}
                </button>
              )}
            </p>
          )}
          <div>
            <Submit busy={busy} label={t.send} busyLabel={t.sending} />
          </div>
        </div>
      </form>
    </FormStage>
  );
}

type Pass = { no: string; ref: string; name: string | null; name_en: string | null; day: string | null; org: string | null; event: string | null; dates: string | null; venue: string | null; meet_ar: string | null };
type RespStatus = "new" | "accepted" | "rejected" | "waiting";
/** One code: the full answer. Only a number: that number's requests (form, status, when), nothing personal. */
type StatusOut = { ok: boolean; error?: string; list?: { title_ar: string; title_en: string | null; status: RespStatus; at: string }[]; status?: RespStatus; title_ar?: string; title_en?: string | null; accepted_ar?: string | null; accepted_url?: string | null; external_done?: boolean; pass?: Pass | null; attend_pass?: string | null; payment?: FormPayment | null };

type PassOut = { ok: boolean; error?: string; pass?: string; ref?: string; name?: string | null; title_ar?: string; title_en?: string | null; sessions?: { id: string; name: string; at: string | null; here: boolean; here_at: string | null; rating?: number | null; comment?: string | null }[] };
const passUrl = (token: string, l: Locale) => `${location.origin}/${l}/form/?pass=${token.toLowerCase()}`;

/** A form's attendance QR: kept on the phone (saved as a picture) and scanned by the team each session. */
function AttendPass({ token, locale, page }: { token: string; locale: Locale; page?: boolean }) {
  const t = C[locale];
  const [qr, setQr] = useState("");
  const [info, setInfo] = useState<PassOut | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    import("qrcode").then((Q) => Q.toDataURL(passUrl(token, locale), { margin: 1, width: 480, errorCorrectionLevel: "M", color: { dark: "#0b1f4d", light: "#ffffff" } })).then(setQr, () => setQr(""));
    rpc<PassOut>("form_pass", { p_token: token }).then(setInfo, () => setInfo({ ok: false, error: "network" }));
  }, [token, locale]);
  if (page && info && !info.ok)
    return (
      <div role="alert" className="frame p-8 text-mist" data-testid="attend-pass-missing">
        {info.error === "rate_limited" ? t.errors.rate_limited : t.qrNotFound}
      </div>
    );
  const title = info?.ok ? (locale === "en" && info.title_en) || info.title_ar : "";
  const save = async () => {
    if (!qr) return;
    const png = await passPicture(qr, { title: title ?? "", name: info?.name ?? "", ref: info?.ref ?? "", label: t.qrTitle, rtl: locale === "ar" });
    const file = new File([png], `buildx-qr-${info?.ref ?? token.slice(0, 6)}.png`, { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: t.qrTitle });
        return;
      } catch {
        /* share sheet closed: fall back to a download */
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(passUrl(token, locale));
      setCopied(true);
    } catch {
      /* no clipboard: the link is still in the QR */
    }
  };
  return (
    <div data-testid="attend-pass" className="grid w-full max-w-md gap-4 rounded-3xl border border-cyan/40 bg-gradient-to-br from-[#0b1f4d] via-[#0a1838] to-[#06213a] p-5 text-white shadow-[0_30px_80px_-40px_rgb(56_189_248/0.6)] sm:p-6">
      <div className="grid gap-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-cyan">{t.qrTitle}</p>
        {title && <p className="text-lg font-bold leading-snug">{title}</p>}
        {info?.name && <p className="text-white/80">{info.name}</p>}
      </div>
      {/* Opened from the WhatsApp ask: one tap down to the session waiting for a rating (the QR stays on top for the door). */}
      {info?.sessions?.some((x) => x.here && !x.rating) && (
        <button
          type="button"
          className="w-fit rounded-full border border-[#ffd08a]/40 bg-[#ffd08a]/10 px-3 py-1.5 text-sm font-semibold text-[#ffd08a]"
          onClick={() => document.getElementById(`rate-${info.sessions!.find((x) => x.here && !x.rating)!.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
          data-testid="rate-jump"
        >
          {t.rateJump}
        </button>
      )}
      <div className="mx-auto rounded-2xl bg-white p-3">
        {qr ? <img src={qr} alt={t.qrTitle} width={240} height={240} className="size-60" data-testid="attend-qr" /> : <div className="size-60 animate-pulse rounded-xl bg-slate-200" />}
      </div>
      {info?.ref && (
        <p dir="ltr" className="text-center font-mono text-sm tracking-widest text-white/70">
          {info.ref}
        </p>
      )}
      <p className="text-sm text-white/75">{t.qrHint}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={!qr} className="btn btn-primary btn-sm disabled:opacity-60" data-testid="attend-save">
          <Icon name="image" size={15} />
          <span>{t.qrSave}</span>
        </button>
        <button type="button" onClick={copy} className="btn btn-sm">
          {copied ? t.qrCopied : t.qrCopy}
        </button>
      </div>
      {!!info?.sessions?.length && (
        <div className="grid gap-2 border-t border-white/10 pt-4">
          <p className="text-sm font-semibold">{t.qrSessions}</p>
          <ul className="grid gap-1.5" data-testid="attend-sessions">
            {info.sessions.map((x) => (
              <li key={x.id} className="grid gap-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate">{x.name}</span>
                    {x.at && <span className="block text-xs text-white/55">{fmtWhen(x.at, locale)}</span>}
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", x.here ? "bg-ok/20 text-[#7cf0c6]" : "bg-white/10 text-white/60")}>{x.here ? t.qrHere : t.qrNot}</span>
                </div>
                {x.here && (
                  <RateSession
                    token={token}
                    locale={locale}
                    session={x.id}
                    rating={x.rating ?? null}
                    comment={x.comment ?? null}
                    onRated={(rating, comment) => setInfo((i) => i && { ...i, sessions: i.sessions?.map((y) => (y.id === x.id ? { ...y, rating, comment } : y)) })}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** After a session they came to: stars out of 5 and a few words, sent from the QR page (and editable). */
function RateSession({ token, locale, session, rating, comment, onRated }: { token: string; locale: Locale; session: string; rating: number | null; comment: string | null; onRated: (rating: number, comment: string) => void }) {
  const t = C[locale];
  const [saved, setSaved] = useState<{ rating: number; comment: string } | null>(rating ? { rating, comment: comment ?? "" } : null);
  const [stars, setStars] = useState(rating ?? 0);
  const [note, setNote] = useState(comment ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (saved && !editing)
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2" data-testid={`rate-done-${session}`}>
        <span className="text-[#ffd08a]" aria-label={t.rateStar(saved.rating)}>
          {"★".repeat(saved.rating)}
          <span className="text-white/25">{"★".repeat(5 - saved.rating)}</span>
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-white/70">{saved.comment || t.rateThanks}</span>
        <button type="button" className="text-xs font-semibold text-cyan underline-offset-4 hover:underline" onClick={() => setEditing(true)}>
          {t.rateEdit}
        </button>
      </div>
    );
  const send = async () => {
    if (!stars) return;
    setBusy(true);
    setError("");
    try {
      const out = await rpc<{ ok: boolean; error?: string }>("form_session_rate", { p_token: token, p_session: session, p_rating: stars, p_comment: note.trim() || null });
      if (!out.ok) throw new Error(out.error);
      setSaved({ rating: stars, comment: note.trim() });
      setEditing(false);
      onRated(stars, note.trim());
    } catch (e) {
      setError(e instanceof Error && e.message === "rate_limited" ? t.errors.rate_limited : t.rateFail);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div id={`rate-${session}`} className="grid scroll-mt-24 gap-2 rounded-xl border border-[#ffd08a]/30 bg-[#ffd08a]/[0.06] p-3" data-testid={`rate-${session}`}>
      <p className="text-sm font-semibold">{t.rateAsk}</p>
      <div className="flex gap-1" role="radiogroup" aria-label={t.rateAsk}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={t.rateStar(n)}
            onClick={() => setStars(n)}
            className={cn("grid size-10 place-items-center rounded-lg text-2xl transition", n <= stars ? "text-[#ffd08a]" : "text-white/25 hover:text-white/50")}
          >
            ★
          </button>
        ))}
      </div>
      {stars > 0 && (
        <>
          <textarea
            className="min-h-20 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/40"
            maxLength={1000}
            rows={3}
            value={note}
            placeholder={t.rateNote}
            aria-label={t.rateNote}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="button" className="btn btn-primary btn-sm w-fit disabled:opacity-60" disabled={busy} onClick={() => void send()} data-testid={`rate-send-${session}`}>
            {busy ? "…" : t.rateSend}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-[#ff9aa5]">
          {error}
        </p>
      )}
    </div>
  );
}

/** The pass as one picture for the phone's gallery: title, name, the QR and the code. */
async function passPicture(qr: string, o: { title: string; name: string; ref: string; label: string; rtl: boolean }): Promise<Blob> {
  const W = 1080;
  const H = 1440;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b1f4d");
  bg.addColorStop(1, "#06213a");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const font = getComputedStyle(document.body).fontFamily || "sans-serif";
  g.textAlign = "center";
  g.direction = o.rtl ? "rtl" : "ltr";
  g.fillStyle = "#38bdf8";
  g.font = `600 40px ${font}`;
  g.fillText(o.label, W / 2, 130);
  g.fillStyle = "#ffffff";
  g.font = `700 58px ${font}`;
  wrap(g, o.title, W / 2, 220, W - 160, 70);
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.font = `500 48px ${font}`;
  g.fillText(o.name, W / 2, 420);
  const img = new Image();
  img.src = qr;
  await img.decode();
  const size = 720;
  g.fillStyle = "#ffffff";
  roundRect(g, (W - size) / 2 - 30, 480, size + 60, size + 60, 40);
  g.drawImage(img, (W - size) / 2, 510, size, size);
  g.fillStyle = "rgba(255,255,255,0.7)";
  g.direction = "ltr";
  g.font = `500 44px ui-monospace, monospace`;
  g.fillText(o.ref, W / 2, 1360);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png"));
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  const words = text.split(/\s+/);
  let line = "";
  let row = 0;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > max && line && row < 2) {
      g.fillText(line, x, y + row * lh);
      line = w;
      row++;
    } else line = next;
  }
  g.fillText(line, x, y + row * lh);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
}

/** An accepted applicant's delegation pass: number, name, day and a QR back to their status. */
function PassCard({ pass, locale, registered }: { pass: Pass; locale: Locale; registered?: boolean }) {
  const t = C[locale];
  const [qr, setQr] = useState("");
  useEffect(() => {
    const url = `${location.origin}${location.pathname}?ref=${encodeURIComponent(pass.ref)}#status`;
    import("qrcode").then((Q) => Q.toDataURL(url, { margin: 1, width: 240, color: { dark: "#0b1f4d", light: "#ffffff" } })).then(setQr, () => setQr(""));
  }, [pass.ref]);
  return (
    <div data-testid="delegation-pass" className="relative overflow-hidden rounded-3xl border border-[#ff7a45]/50 bg-gradient-to-br from-[#0b1f4d] via-[#0a1838] to-[#2a1407] p-6 text-white shadow-[0_30px_80px_-40px_rgb(255_122_69/0.8)]">
      <span aria-hidden className="absolute -end-16 -top-16 size-56 rounded-full bg-[#ff7a45]/20 blur-3xl" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="t-eyebrow text-[0.62rem] text-[#ffb08f]">{t.passTitle}</p>
          <p dir="ltr" className="mt-1 truncate text-sm text-white/70 rtl:text-right">
            {[pass.event, pass.dates].filter(Boolean).join(" · ")}
          </p>
        </div>
        {qr && <img src={qr} alt="" width={96} height={96} className="size-24 shrink-0 rounded-xl bg-white p-1" />}
      </div>
      <div className="relative mt-4 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end">
        <div>
          <p className="text-xs text-white/60">{t.passNo}</p>
          <p dir="ltr" className="t-headline text-5xl tracking-wide text-[#ff9b70]">
            {pass.no}
          </p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-xl font-bold">{pass.name}</p>
          {pass.name_en && (
            <p dir="ltr" className="truncate text-white/80 rtl:text-right">
              {pass.name_en}
            </p>
          )}
          {pass.org && <p className="truncate text-sm text-white/60">{pass.org}</p>}
        </div>
      </div>
      <div className="relative mt-4 grid gap-2 border-t border-white/15 pt-4 text-sm sm:grid-cols-2">
        {pass.day && (
          <p>
            <span className="text-white/60">{t.passDay}: </span>
            <b>{pass.day}</b>
          </p>
        )}
        {pass.venue && (
          <p dir="ltr" className="text-white/80 rtl:text-right">
            📍 {pass.venue}
          </p>
        )}
        {pass.meet_ar && (
          <p className="sm:col-span-2">
            <span className="text-white/60">{t.passMeet}: </span>
            {pass.meet_ar}
          </p>
        )}
      </div>
      {registered && <p className="relative mt-4 text-sm font-semibold text-[#7cf0c6]">{t.passReg}</p>}
      <p className="relative mt-2 text-xs text-white/60">{t.passShot}</p>
    </div>
  );
}

/** Check an application with its reference code and phone; accepted applicants get the next step. */
export function FormStatus({ locale }: { locale: string }) {
  const l = L(locale);
  const t = C[l];
  const [ref, setRef] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<StatusOut | null>(null);
  const [err, setErr] = useState("");
  const [marked, setMarked] = useState(false);
  useEffect(() => {
    setRef(new URLSearchParams(location.search).get("ref") ?? "");
  }, []);
  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ref.trim() && !phone.trim()) return setErr(t.stNeedOne);
    if (!ref.trim() && !PHONE.test(cleanPhone(phone))) return setErr(t.badPhone);
    setBusy(true);
    setErr("");
    setOut(null);
    try {
      const r = await rpc<StatusOut>("form_status", { p_ref: ref.trim(), p_phone: phone.trim() ? asciiDigits(phone.trim()) : null });
      if (r.ok) setOut(r);
      else setErr(r.error === "rate_limited" ? t.errors.rate_limited : r.error === "join_code" ? t.stJoinCode : t.stNotFound);
    } catch {
      setErr(t.errors.network);
    } finally {
      setBusy(false);
    }
  };
  const markDone = async () => {
    try {
      const r = await rpc<{ ok: boolean }>("form_external_done", { p_ref: ref.trim(), p_phone: asciiDigits(phone.trim()) });
      if (r.ok) setMarked(true);
    } catch {
      setErr(t.errors.network);
    }
  };
  return (
    <div className="frame grid gap-5 p-5 sm:p-8">
      <form onSubmit={check} noValidate className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Row id="st-ref" label={t.stRef}>
          <input id="st-ref" className={inputCls} dir="ltr" value={ref} maxLength={20} onChange={(e) => setRef(asciiDigits(e.target.value).toUpperCase())} placeholder="F-XXXXXXXX" autoComplete="off" />
        </Row>
        <Row id="st-phone" label={t.stPhone}>
          <input id="st-phone" className={inputCls} dir="ltr" type="tel" inputMode="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" autoComplete="tel" />
        </Row>
        <button type="submit" disabled={busy} className="btn btn-primary h-12 disabled:opacity-70">
          {busy ? t.stChecking : t.stCheck}
        </button>
      </form>
      {!out && <p className="-mt-2 text-sm text-fog">{t.stRefHint}</p>}
      {err && (
        <p role="alert" className="text-sm text-danger">
          {err}
        </p>
      )}
      {out?.list && (
        <div role="status" className="grid gap-3">
          {out.list.map((x, i) => (
            <div key={i} className="grid gap-1 rounded-2xl border border-[var(--line-2)] p-5" data-testid="status-item">
              <p className="text-sm text-fog">
                {(l === "en" && x.title_en) || x.title_ar} · {fmtWhen(x.at, l)}
              </p>
              <p className={cn("t-headline text-xl", x.status === "accepted" ? "text-ok" : x.status === "rejected" ? "text-danger" : "text-chalk")}>{t.st[x.status]}</p>
            </div>
          ))}
          <p className="text-sm text-fog">{t.stListNote}</p>
        </div>
      )}
      {out?.status && (
        <div role="status" className="grid gap-3 rounded-2xl border border-[var(--line-2)] p-5">
          <p className="text-sm text-fog">{(l === "en" && out.title_en) || out.title_ar}</p>
          <p className={cn("t-headline text-2xl", out.status === "accepted" ? "text-ok" : out.status === "rejected" ? "text-danger" : "text-chalk")}>{t.st[out.status]}</p>
          {out.payment && <FeeBox payment={out.payment} locale={l} showRef />}
          {out.status === "accepted" && out.accepted_ar && <p className="max-w-2xl whitespace-pre-line leading-relaxed text-mist">{out.accepted_ar}</p>}
          {out.status === "accepted" && out.pass && <PassCard pass={out.pass} locale={l} registered={out.external_done} />}
          {out.attend_pass && <AttendPass token={out.attend_pass} locale={l} />}
          {out.status === "accepted" && (
            <div className="flex flex-wrap gap-3">
              {out.accepted_url && (
                <a href={out.accepted_url} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
                  {t.stOpen}
                </a>
              )}
              {out.external_done || marked ? (
                <p className="self-center text-sm font-semibold text-ok">{t.stDoneOk}</p>
              ) : (
                out.accepted_url && (
                  <button type="button" onClick={markDone} className="btn btn-sm">
                    {t.stDone}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
