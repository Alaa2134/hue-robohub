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
      ["What we collect", "When you apply, we collect your name, email, phone/WhatsApp, academic year, preferred track, skills, experience, optional portfolio links, motivation and availability. When you use the contact form, we collect your name, email, organisation (optional), topic and message. We store a salted hash of your IP address to block abuse — never the raw address."],
      ["Why", "Only to review your application or answer your message, and to protect the forms from spam."],
      ["Who can see it", "Applications and messages are visible only to authorised team leads and administrators inside the private Command Center. Access is role-based and every change is recorded in an audit log. Your phone number and email are never shown on the public site."],
      ["Public profiles", "If you become a member, a public profile is shown only when you and an admin switch it on. Phone numbers, private emails, attendance and internal notes are never public."],
      ["Cookies", "The public website sets no tracking cookies. The Command Center uses one essential, secure session cookie for signed-in members."],
      ["Retention & deletion", "Application data is kept for the current recruitment cycle and the following one, then deleted or anonymised. You can ask us to correct or delete your data at any time."],
      ["Independence", "BuildX HUE is a student-led community at Horus University. This website is not an official publication of the university."],
    ],
    contact: "Contact us to exercise your rights:",
  },
  ar: {
    title: "إشعار الخصوصية",
    lead: "ما الذي نجمعه ولماذا ومن يمكنه رؤيته وكيف تحذفه. بلغة واضحة وبلا مفاجآت.",
    sections: [
      ["ما الذي نجمعه", "عند التقديم نجمع اسمك وبريدك ورقم هاتفك/واتساب والفرقة الدراسية والمسار المفضّل والمهارات والخبرات وروابط أعمالك الاختيارية ودوافعك ومواعيدك المتاحة. وعند استخدام نموذج التواصل نجمع الاسم والبريد والجهة (اختياري) والموضوع والرسالة. نحفظ بصمة مشفّرة لعنوان IP لمنع إساءة الاستخدام — ولا نحفظ العنوان نفسه."],
      ["لماذا", "فقط لمراجعة طلبك أو الرد على رسالتك ولحماية النماذج من الرسائل المزعجة."],
      ["من يمكنه رؤيتها", "الطلبات والرسائل لا يراها إلا القادة والمسؤولون المخوّلون داخل مركز القيادة الخاص. الوصول حسب الصلاحيات وكل تعديل يُسجَّل. رقم هاتفك وبريدك لا يظهران أبدًا على الموقع العام."],
      ["الملفات العامة", "إذا أصبحت عضوًا، يظهر ملفك العام فقط عندما توافق أنت والمسؤول على تفعيله. أرقام الهواتف والبريد الخاص والحضور والملاحظات الداخلية لا تُنشر أبدًا."],
      ["ملفات تعريف الارتباط", "الموقع العام لا يستخدم أي ملفات تتبّع. مركز القيادة يستخدم ملف جلسة واحدًا آمنًا وضروريًا للأعضاء المسجّلين."],
      ["الاحتفاظ والحذف", "نحتفظ ببيانات الطلبات خلال دورة الاستقطاب الحالية والتالية ثم نحذفها أو نجعلها مجهولة. يمكنك طلب تصحيح بياناتك أو حذفها في أي وقت."],
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
