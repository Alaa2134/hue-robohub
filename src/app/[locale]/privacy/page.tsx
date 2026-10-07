import type { Metadata } from "next";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { getSiteConfig } from "@/server/queries/public";

export const revalidate = 86400;

const COPY = {
  en: {
    title: "Privacy notice",
    lead: "What we collect, why, who can see it and how to remove it. Plain language, no surprises.",
    sections: [
      ["What we collect", "When you apply, we collect what you type in the form: your name, phone/WhatsApp, email, faculty, academic year, student number (optional), preferred tracks and roles, experience, skills, links to your work (optional), motivation, goals and availability."],
      ["Why", "Only to review your application, contact you about it, and — if you join — set up your BuildX App account."],
      ["Who can see it", "Applications are visible only to the community's owner, admins and team leads inside the BuildX App. Access is role-based and important actions are recorded in an activity log. Your phone number and email are never shown on the public site."],
      ["The BuildX HUE and BuildX Team apps", "Accounts are created by the community's team, not in the apps. The student app (BuildX HUE) uses your student number, name and group, and keeps your attendance, quiz answers and scores, points and certificates. The team app (BuildX Team) uses the team member's email and name, and the photos and files they choose to upload. The camera is used only to scan attendance barcodes and tickets on the device; no picture is saved unless you choose to upload it. If the app breaks we record the error message, the screen and the device type. There are no ads, no tracking across apps or sites, and nothing is sold or shared with advertisers. Data is stored with our database provider (Supabase) and sent over encrypted connections."],
      ["Deleting your account", "Email us from the address below (or ask your coach) and we'll close your app account and delete its data within 30 days, except records we must keep for security for up to 180 days."],
      ["Visits and errors", "We count page visits without cookies: the page, the site you came from, the language, the device type and the country. Visitors are counted with a code that changes every day and can't be traced back to anyone, and nothing is counted if your browser sends \"Do Not Track\". If a page breaks in your browser, we record the error message, the page and the browser name so we can fix it."],
      ["Security", "To stop spam and attacks we limit how often forms and sign-ins can be used. When a request is refused or looks like an attack (many attempts, a bot trap, wrong sign-ins) we record its IP address and time for up to 180 days. Only the owner and admins can see these records."],
      ["Public profiles", "Team members' portfolios are shown only after the member and an admin publish them. Phone numbers, private emails, attendance and internal notes are never public."],
      ["Cookies", "The public website sets no cookies. The BuildX App keeps you signed in by storing a session on your own device."],
      ["Retention & deletion", "Application data is kept for the current recruitment cycle and the following one, then deleted or anonymised. Visit counts are kept for about a year. You can ask us to correct or delete your data at any time."],
      ["Independence", "BuildX HUE is a student-led community at Horus University. This website is not an official publication of the university."],
    ],
    contact: "Contact us to exercise your rights:",
  },
  ar: {
    title: "إشعار الخصوصية",
    lead: "ما الذي نجمعه ولماذا ومن يمكنه رؤيته وكيف تحذفه. بلغة واضحة وبلا مفاجآت.",
    sections: [
      ["ما الذي نجمعه", "عند التقديم نجمع ما تكتبه في الاستمارة: اسمك ورقم هاتفك/واتساب وبريدك والكلية والفرقة ورقمك الجامعي (اختياري) والمسارات والأدوار المفضّلة وخبرتك ومهاراتك وروابط أعمالك (اختياري) ودوافعك وأهدافك ومواعيدك المتاحة."],
      ["لماذا", "فقط لمراجعة طلبك والتواصل معك بشأنه، وإذا انضممت — لإنشاء حسابك في تطبيق BuildX."],
      ["من يمكنه رؤيتها", "الطلبات لا يراها إلا مالك المجتمع والمسؤولون وقادة الفرق داخل تطبيق BuildX. الوصول حسب الصلاحيات والإجراءات المهمة تُسجَّل في سجل النشاط. رقم هاتفك وبريدك لا يظهران أبدًا على الموقع العام."],
      ["تطبيقا BuildX HUE و BuildX Team", "الحسابات ينشئها فريق المجتمع وليس التطبيقات نفسها. تطبيق الطلاب (BuildX HUE) يستخدم رقمك الجامعي واسمك ومجموعتك، ويحفظ حضورك وإجابات الكويزات ودرجاتها ونقاطك وشهاداتك. تطبيق الفريق (BuildX Team) يستخدم بريد عضو الفريق واسمه والصور والملفات التي يختار رفعها. الكاميرا تُستخدم فقط لمسح باركود الحضور والتذاكر على الجهاز، ولا تُحفظ أي صورة إلا إذا اخترت رفعها. وإذا تعطّل التطبيق نسجّل رسالة الخطأ والشاشة ونوع الجهاز. لا إعلانات، ولا تتبّع عبر التطبيقات أو المواقع، ولا نبيع أي بيانات أو نشاركها مع معلنين. البيانات محفوظة لدى مزوّد قاعدة البيانات (Supabase) وتنتقل عبر اتصالات مشفّرة."],
      ["حذف حسابك", "راسلنا على البريد بالأسفل (أو اطلب من مدرّبك) وسنغلق حسابك في التطبيق ونحذف بياناته خلال 30 يومًا، ما عدا سجلات الأمان التي نحتفظ بها حتى 180 يومًا."],
      ["الزيارات والأخطاء", "نعدّ زيارات الصفحات بدون ملفات تعريف الارتباط: الصفحة والموقع الذي جئت منه واللغة ونوع الجهاز والدولة. يُعدّ الزوار برمز يتغيّر كل يوم ولا يمكن ربطه بأي شخص، ولا نعدّ شيئًا إذا كان متصفحك يرسل «عدم التتبع». وإذا تعطّلت صفحة في متصفحك نسجّل رسالة الخطأ والصفحة واسم المتصفح لنصلحها."],
      ["الأمان", "لمنع الرسائل المزعجة والهجمات نحدّ من عدد مرات استخدام الاستمارات وتسجيل الدخول. عندما يُرفض طلب أو يبدو كهجوم (محاولات كثيرة، فخ للبوتات، دخول خاطئ) نسجّل عنوان IP والوقت لمدة أقصاها 180 يومًا، ولا يرى هذه السجلات إلا المالك والمسؤولون."],
      ["الملفات العامة", "بورتفوليو أعضاء الفريق لا يظهر إلا بعد أن ينشره العضو والمسؤول. أرقام الهواتف والبريد الخاص والحضور والملاحظات الداخلية لا تُنشر أبدًا."],
      ["ملفات تعريف الارتباط", "الموقع العام لا يستخدم أي ملفات تعريف ارتباط. تطبيق BuildX يحفظ جلسة الدخول على جهازك أنت."],
      ["الاحتفاظ والحذف", "نحتفظ ببيانات الطلبات خلال دورة الاستقطاب الحالية والتالية ثم نحذفها أو نجعلها مجهولة، وأعداد الزيارات لمدة سنة تقريبًا. يمكنك طلب تصحيح بياناتك أو حذفها في أي وقت."],
      ["الاستقلالية", "BuildX HUE مجتمع طلابي في جامعة حورس، وهذا الموقع ليس منشورًا رسميًا للجامعة."],
    ],
    contact: "تواصل معنا لممارسة حقوقك:",
  },
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  return pageMeta({ locale, path: "/privacy", title: COPY[locale].title, description: COPY[locale].lead });
}

export default async function Privacy({ params }: Params) {
  const { locale, t, href } = await resolvePage(params);
  const c = COPY[locale];
  const email = (await getSiteConfig())["site.contact"].email;
  return (
    <>
      <PageHero eyebrow={t.footer.privacy} title={c.title} body={c.lead} crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.footer.privacy }]} size="md" />
      <Band tight>
        <div className="mx-auto flex max-w-3xl flex-col gap-10">
          {c.sections.map(([h, b], i) => (
            <section key={h}>
              <p className="t-eyebrow flex items-center gap-3 text-cyan">
                <span className="font-mono">{String(i + 1).padStart(2, "0")}</span>
                <span className="h-px w-8 bg-cyan" />
                {h}
              </p>
              <p className="mt-4 text-pretty leading-relaxed text-frost">{b}</p>
            </section>
          ))}
          {email && (
            <p className="rounded-xl border border-[var(--line)] p-5 text-mist">
              {c.contact}{" "}
              <a href={`mailto:${email}`} className="text-cyan hover:underline">
                {email}
              </a>
            </p>
          )}
        </div>
      </Band>
    </>
  );
}
