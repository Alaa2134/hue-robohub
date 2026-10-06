import type { Metadata } from "next";
import { MemberProfile } from "@/components/team/member-profile";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, t } = await resolvePage(params);
  return pageMeta({ locale, path: "/team/member", title: t.team.title, description: t.team.body });
}

/** One static page renders every portfolio; the member comes from ?u=<slug>. */
export default async function Member({ params }: Params) {
  const { locale, href } = await resolvePage(params);
  return (
    <div className="mx-auto max-w-[1400px] px-5 pb-24 pt-28 sm:px-8 lg:pt-36">
      <MemberProfile locale={locale} teamHref={`${href("/team")}/`} />
    </div>
  );
}
