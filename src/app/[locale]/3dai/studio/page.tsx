import type { Metadata } from "next";
import { Ai3dStudio } from "@/components/ai3d/studio";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

const META = {
  ar: { title: "استوديو BuildX 3D AI", description: "اعمل موديلات 3D من كلام أو صورة، وتابعها وهي بتتبني، ونزّلها GLB أو STL أو OBJ." },
  en: { title: "BuildX 3D AI studio", description: "Make 3D models from text or a photo, watch them being built, and download GLB, STL or OBJ." },
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  return { ...pageMeta({ locale, path: "/3dai/studio", title: META[locale].title, description: META[locale].description }), robots: { index: false, follow: true } };
}

export default async function Ai3dStudioPage({ params }: Params) {
  const { locale, href } = await resolvePage(params);
  return <Ai3dStudio lang={locale} home={href("/3dai")} />;
}
