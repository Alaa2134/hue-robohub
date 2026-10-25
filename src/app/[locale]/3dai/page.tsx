import type { Metadata } from "next";
import { Ai3dLanding } from "@/components/ai3d/landing";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export const revalidate = 3600;

const META = {
  ar: { title: "BuildX 3D AI — حوّل فكرتك أو صورتك لموديل 3D", description: "اكتب وصف أو ارفع صورة واستلم موديل ثلاثي الأبعاد بالخامات في دقايق: عارض 3D في المتصفح وتحميل GLB وSTL للطباعة وOBJ." },
  en: { title: "BuildX 3D AI — turn an idea or a photo into a 3D model", description: "Describe something or upload a photo and get a textured 3D model in minutes: a 3D viewer in your browser and GLB, print-ready STL and OBJ downloads." },
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  return pageMeta({ locale, path: "/3dai", title: META[locale].title, description: META[locale].description });
}

export default async function Ai3dPage({ params }: Params) {
  const { locale, href } = await resolvePage(params);
  return <Ai3dLanding lang={locale} studio={href("/3dai/studio")} />;
}
