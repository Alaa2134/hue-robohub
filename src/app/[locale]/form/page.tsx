import type { Metadata } from "next";
import { FormFiller, FormStatus } from "@/components/forms/site-forms";
import { Band } from "@/components/pages/section";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export const revalidate = 3600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  // One page for every form (/form/?f=<slug>); the forms list is what search engines get.
  return pageMeta({ locale, path: "/form", title: locale === "ar" ? "فورم" : "Form", noindex: true });
}

export default async function FormPage({ params }: Params) {
  const { locale, href } = await resolvePage(params);
  return (
    <Band tight className="pt-24">
      <div className="mx-auto max-w-3xl">
        <FormFiller locale={locale} listHref={href("/forms")} statusHref={href("/form")} />
        <section id="status" className="mt-14 grid gap-4">
          <h2 className="t-headline text-2xl text-chalk">{locale === "ar" ? "تابع طلبك" : "Check your application"}</h2>
          <FormStatus locale={locale} />
        </section>
      </div>
    </Band>
  );
}
