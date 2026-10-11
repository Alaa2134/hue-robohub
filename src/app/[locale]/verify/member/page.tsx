import type { Metadata } from "next";
import { MemberVerify } from "@/components/forms/member-verify";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export const revalidate = 86400;

const COPY = {
  en: {
    eyebrow: "Membership",
    title: "Verify a member",
    lead: "Every BuildX HUE member has a digital card with a QR code. Scan it, or type the code, to see whether the membership is valid today.",
  },
  ar: {
    eyebrow: "العضوية",
    title: "تحقّق من عضو",
    lead: "كل عضو في BuildX HUE معاه كارنيه رقمي عليه QR. امسحه أو اكتب الكود عشان تعرف العضوية سارية النهارده ولا لأ.",
  },
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  return pageMeta({
    locale,
    path: "/verify/member",
    title: COPY[locale].title,
    description: COPY[locale].lead,
    noindex: true,
  });
}

export default async function VerifyMember({ params }: Params) {
  const { locale, t, href } = await resolvePage(params);
  const c = COPY[locale];
  return (
    <>
      <PageHero
        eyebrow={c.eyebrow}
        title={c.title}
        body={c.lead}
        crumbs={[{ label: t.nav.home, href: href("/") }, { label: c.title }]}
        size="md"
      />
      <Band tight>
        <div className="mx-auto max-w-2xl">
          <MemberVerify locale={locale} />
        </div>
      </Band>
    </>
  );
}
