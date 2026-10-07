/**
 * Where the guide takes people: a section on the current page (smooth scroll) or another page
 * (client-side navigation, with the trailing slash the static site uses).
 */
import { localePath, type Locale } from "@/i18n/config";
import { routeKey, scrollToSection } from "@/lib/mascotScenes";

type Router = { push: (href: string) => void };

export function goTo(target: { href: string; section?: string }, o: { locale: Locale; pathname: string; router: Router }): "scrolled" | "navigated" {
  const here = routeKey(o.pathname);
  // Home has most sections: scroll there instead of leaving the page.
  if (target.section && (here === "/" || here === routeKey(target.href)) && scrollToSection(target.section)) return "scrolled";
  if (routeKey(target.href) === here) {
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    return "scrolled";
  }
  const path = localePath(o.locale, target.href);
  o.router.push(path.endsWith("/") ? path : `${path}/`);
  return "navigated";
}
