import type { Metadata } from "next";
import { CertificateVerify } from "@/components/forms/certificate-verify";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export const revalidate = 86400;

const COPY = {
  en: { eyebrow: "Certificates", title: "Verify a certificate", lead: "Every BuildX HUE certificate carries a QR code and a code. Scan it or type the code to confirm it's genuine." },
  ar: { eyebrow: "الشهادات", title: "تحقّق من شهادة", lead: "كل شهادة من BuildX HUE عليها QR وكود. امسح الكود أو اكتبه عشان تتأكد إنها أصلية." },
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  return pageMeta({ locale, path: "/verify", title: COPY[locale].title, description: COPY[locale].lead });
}

export default async function Verify({ params }: Params) {
  const { locale, t, href } = await resolvePage(params);
  const c = COPY[locale];
  return (
    <>
      <PageHero eyebrow={c.eyebrow} title={c.title} body={c.lead} crumbs={[{ label: t.nav.home, href: href("/") }, { label: c.title }]} size="md" />
      <Band tight>
        <div className="mx-auto max-w-2xl">
          <CertificateVerify locale={locale} />
        </div>
      </Band>
    </>
  );
}
