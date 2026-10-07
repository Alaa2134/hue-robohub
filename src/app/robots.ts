import type { MetadataRoute } from "next";
import { BASE_PATH, STATIC_SITE } from "@/lib/deploy";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  // The BuildX App (/app/) is the students' and staff's sign-in area, not a page for search results.
  const disallow = STATIC_SITE ? [`${BASE_PATH}/app/`] : ["/app", "/command", "/login", "/setup", "/forgot-password", "/reset-password", "/api/", "/uploads/"];
  return {
    rules: [{ userAgent: "*", allow: "/", disallow }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
